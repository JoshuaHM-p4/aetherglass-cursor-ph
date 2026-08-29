// game/systems/combat.ts
//
// Space to swing. AGENTS.md #5: NO LLM CALLS HERE, EVER. This is a 60fps path.
//
// The split that keeps it honest: Phaser owns the hitbox, the animation, and the
// question "did the blade overlap that sprite this frame". The sim owns the question
// "does that hit count, and for how much". So this file computes geometry and emits
// `world:attack_landed`; it never reads or writes hp.
//
// Enemy hp lives on `Entity.hp` in the sim (which is why STRIKE_ENTITY exists). Phaser
// keeping its own copy is the exact thing ARCHITECTURE §1.3 forbids, and it is also how
// you end up with a slime that dies twice.

import Phaser from 'phaser';
import type { Facing } from '../../lib/sim/types';
import { world } from '../../lib/sim/store';
import { bus } from '../EventBus';
import { getHotbarSlot, isWorldInputBlocked } from '../inputCapture';
import { swingHitbox } from './hitbox';
import { hurtShakeOffset } from './hurtFx';
import { playSfx } from './sound';

export { swingHitbox } from './hitbox';

const TILE = 16;

/**
 * Enemy bodies are immovable and the player collides with them, so the player never
 * overlaps a slime — arcade separation parks the two centres exactly one tile apart.
 * A strict `< TILE` test would therefore never fire; the cushion absorbs the pixel of
 * float slop separation leaves behind.
 */
const CONTACT_RANGE = TILE + 1;

export const COMBAT = {
  swingMs: 180,
  /** Post-swing lockout, so mashing Space is not a DPS strategy. */
  cooldownMs: 260,
  /** Player invulnerability after being hit, so contact damage cannot chain-kill. */
  iFramesMs: 700,
  /** Solid red FILL flash before the multiply-tint blink. */
  hurtFlashMs: 80,
  /** Sprite-local shake; shorter than i-frames so the wobble dies before you can be hit again. */
  hurtShakeMs: 260,
  hurtShakePx: 3,
  hurtTint: 0xff2a2a,
} as const;

/**
 * `facing` comes from the scene, not from `world().player.facing`: the sim only learns
 * the direction on a tile crossing, and a player pinned against an entity turns without
 * crossing anything. Reading the stale fact would swing the blade the wrong way.
 */
type CombatScene = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
  facing: Facing;
};

/** Shared with Overworld's store sync, so a hit flash cannot outlive a death. */
export const DEAD_TINT = 0x555555;

function equippedWeapon(): { itemId: string | null; damage: number; reach: number } {
  const { player } = world();
  const itemId = player.hotbar[getHotbarSlot()];
  const item = itemId ? player.bag.find((i) => i.id === itemId) : undefined;
  return {
    itemId,
    damage: item?.stats?.damage ?? 1,
    reach: item?.stats?.reach ?? 1,
  };
}

/**
 * Reads the hotbar's active item from the store ONCE PER SWING — not per frame — to get
 * damage and reach. A swing is a moment; the equipped weapon is a fact.
 */
export function installCombatSystem(scene: Phaser.Scene): () => void {
  const s = scene as CombatScene;
  const space = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
  let cooldownUntil = 0;
  let iframeUntil = 0;
  let hurtAt = 0;
  let shakeX = 0;
  let shakeY = 0;
  let flashTimer: Phaser.Time.TimerEvent | null = null;

  const clearShake = (): void => {
    if (!shakeX && !shakeY) return;
    s.player.x -= shakeX;
    s.player.y -= shakeY;
    shakeX = 0;
    shakeY = 0;
  };

  const endHurtVisual = (): void => {
    clearShake();
    flashTimer?.remove(false);
    flashTimer = null;
    s.player.setTintMode(Phaser.TintModes.MULTIPLY);
    s.player.clearTint();
    s.player.setAlpha(1);
  };

  const playHurt = (): void => {
    const now = scene.time.now;
    iframeUntil = now + COMBAT.iFramesMs;
    hurtAt = now;
    clearShake();
    flashTimer?.remove(false);
    s.player.setTint(COMBAT.hurtTint).setTintMode(Phaser.TintModes.FILL).setAlpha(1);
    scene.cameras.main.shake(COMBAT.hurtShakeMs, 0.005);
    flashTimer = scene.time.delayedCall(COMBAT.hurtFlashMs, () => {
      if (scene.time.now < iframeUntil) {
        s.player.setTintMode(Phaser.TintModes.MULTIPLY).setTint(COMBAT.hurtTint);
      }
    });
  };

  const onSpace = () => {
    if (isWorldInputBlocked()) return;
    const now = scene.time.now;
    if (now < cooldownUntil) return;
    cooldownUntil = now + COMBAT.cooldownMs;
    playSfx('swing');
    const facing = s.facing;
    const { itemId, reach } = equippedWeapon();
    const tileX = Math.floor(s.player.x / TILE);
    const tileY = Math.floor(s.player.y / TILE);
    const box = swingHitbox(tileX, tileY, facing, reach);
    const left = box.tx * TILE;
    const top = box.ty * TILE;
    const right = left + box.w * TILE;
    const bottom = top + box.h * TILE;
    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const id = sprite.name;
      const entity = world().entities[id];
      if (!entity || (entity.kind !== 'enemy' && entity.kind !== 'elite')) continue;
      if (entity.state === 'dead') continue;
      if (sprite.x >= left && sprite.x < right && sprite.y >= top && sprite.y < bottom) {
        bus.emit('world:attack_landed', { entityId: id, facing, withItemId: itemId });
      }
    }
  };

  space.on('down', onSpace);

  const onPreUpdate = () => {
    clearShake();
  };

  const onUpdate = () => {
    const now = scene.time.now;
    const hurting = hurtAt !== 0 && now < hurtAt + COMBAT.iFramesMs;
    if (!hurting && hurtAt !== 0) {
      endHurtVisual();
      hurtAt = 0;
    }

    if (now >= iframeUntil && world().player.hp > 0) {
      for (const obj of s.entityLayer.list) {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        const entity = world().entities[sprite.name];
        if (!entity || (entity.kind !== 'enemy' && entity.kind !== 'elite')) continue;
        if (entity.state === 'dead') continue;
        const dx = Math.abs(sprite.x - s.player.x);
        const dy = Math.abs(sprite.y - s.player.y);
        if (dx <= CONTACT_RANGE && dy <= CONTACT_RANGE) {
          playHurt();
          bus.emit('world:player_hurt', { amount: 1, source: entity.name });
          break;
        }
      }
    }
  };

  const onPostUpdate = () => {
    const now = scene.time.now;
    if (hurtAt === 0 || now >= hurtAt + COMBAT.iFramesMs) return;
    const shake = hurtShakeOffset(now - hurtAt, COMBAT.hurtShakeMs, COMBAT.hurtShakePx);
    shakeX = shake.x;
    shakeY = shake.y;
    s.player.x += shakeX;
    s.player.y += shakeY;
    if (now >= hurtAt + COMBAT.hurtFlashMs) {
      s.player.setAlpha(Math.floor(now / 60) % 2 === 0 ? 1 : 0.35);
    }
  };

  scene.events.on('preupdate', onPreUpdate);
  scene.events.on('update', onUpdate);
  scene.events.on('postupdate', onPostUpdate);

  const offEvent = bus.on('sim:event', (event) => {
    if (event.type === 'entity_struck') {
      const sprite = s.entityLayer.getByName(event.entityId) as Phaser.GameObjects.Sprite | null;
      if (!sprite) return;
      sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      scene.time.delayedCall(COMBAT.swingMs, () => {
        sprite.setTintMode(Phaser.TintModes.MULTIPLY);
        if (world().entities[event.entityId]?.state === 'dead') sprite.setTint(DEAD_TINT);
        else sprite.clearTint();
      });
    }
    if (event.type === 'entity_state_changed' && event.state === 'dead') {
      const sprite = s.entityLayer.getByName(event.entityId) as Phaser.Physics.Arcade.Sprite | null;
      if (!sprite) return;
      sprite.setTint(DEAD_TINT).setAlpha(0.5);
      if (sprite.body) sprite.body.enable = false;
    }
    if (event.type === 'player_died') {
      hurtAt = 0;
      endHurtVisual();
    }
  });

  const offHydrate = bus.on('sim:hydrated', () => {
    iframeUntil = 0;
    hurtAt = 0;
    endHurtVisual();
  });

  return () => {
    space.off('down', onSpace);
    scene.events.off('preupdate', onPreUpdate);
    scene.events.off('update', onUpdate);
    scene.events.off('postupdate', onPostUpdate);
    flashTimer?.remove(false);
    endHurtVisual();
    offEvent();
    offHydrate();
  };
}
