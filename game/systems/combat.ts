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
import { inEnemyContact, inSwingCone } from './hitbox';
import { hurtShakeOffset } from './hurtFx';
import {
  KNOCK,
  beginKnockback,
  dirFromTo,
  endKnockback,
  facingDir,
  isKnocking,
  tickKnockback,
} from './knockback';
import { playSfx } from './sound';
import {
  slashAlpha,
  slashPlace,
  swingAngle,
  swingLunge,
  swingProgress,
  swordHand,
} from './swingFx';

export { swingHitbox } from './hitbox';

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

function equippedWeapon(): {
  itemId: string | null;
  damage: number;
  reach: number;
  blade: boolean;
} {
  const { player } = world();
  const itemId = player.hotbar[getHotbarSlot()];
  const item = itemId ? player.bag.find((i) => i.id === itemId) : undefined;
  return {
    itemId,
    damage: item?.stats?.damage ?? 1,
    reach: item?.stats?.reach ?? 1,
    blade: item?.kind === 'weapon' || Boolean(item?.tags.includes('sharp')),
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
  let swingAt = 0;
  let swingFacing: Facing = 'down';
  let showBlade = false;
  let lungeX = 0;
  let lungeY = 0;

  const blade = scene.textures.exists('tex-sword')
    ? scene.add.image(0, 0, 'tex-sword').setVisible(false).setOrigin(0.5, 0.88).setDepth(12)
    : null;
  const slash = scene.textures.exists('tex-slash-0')
    ? scene.add
        .sprite(0, 0, 'tex-slash-0')
        .setVisible(false)
        .setDepth(13)
        .setOrigin(11 / 32, 0.5)
        .setScale(1.7)
    : null;

  const hideSwing = (): void => {
    swingAt = 0;
    showBlade = false;
    blade?.setVisible(false);
    slash?.setVisible(false).anims.stop();
  };

  const clearLunge = (): void => {
    if (!lungeX && !lungeY) return;
    s.player.x -= lungeX;
    s.player.y -= lungeY;
    lungeX = 0;
    lungeY = 0;
  };

  const poseSwing = (): void => {
    if (swingAt === 0) return;
    const t = swingProgress(scene.time.now - swingAt);
    const hand = swordHand(swingFacing);
    const place = slashPlace(swingFacing);
    if (blade && showBlade) {
      blade
        .setPosition(s.player.x + hand.x, s.player.y + hand.y)
        .setAngle(swingAngle(swingFacing, t))
        .setDepth(swingFacing === 'up' ? 9 : 12)
        .setVisible(true);
    }
    if (slash) {
      slash
        .setPosition(s.player.x + place.x, s.player.y + place.y)
        .setAngle(place.angle)
        .setAlpha(slashAlpha(t))
        .setVisible(true);
    }
  };

  const burstSpark = (x: number, y: number): void => {
    if (!scene.textures.exists('tex-spark')) return;
    const spark = scene.add.image(x, y, 'tex-spark').setDepth(14);
    scene.tweens.add({
      targets: spark,
      alpha: 0,
      scale: 1.6,
      duration: 140,
      onComplete: () => spark.destroy(),
    });
  };

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

  const playHurt = (fromX: number, fromY: number): void => {
    const now = scene.time.now;
    iframeUntil = now + COMBAT.iFramesMs;
    hurtAt = now;
    clearShake();
    flashTimer?.remove(false);
    s.player.setTint(COMBAT.hurtTint).setTintMode(Phaser.TintModes.FILL).setAlpha(1);
    flashTimer = scene.time.delayedCall(COMBAT.hurtFlashMs, () => {
      if (scene.time.now < iframeUntil) {
        s.player.setTintMode(Phaser.TintModes.MULTIPLY).setTint(COMBAT.hurtTint);
      }
    });
    const away = dirFromTo(fromX, fromY, s.player.x, s.player.y, {
      x: -facingDir(s.facing).x,
      y: -facingDir(s.facing).y,
    });
    beginKnockback(s.player, away.x, away.y, KNOCK.playerSpeed, now);
  };

  const onSpace = () => {
    if (isWorldInputBlocked()) return;
    const now = scene.time.now;
    if (now < cooldownUntil) return;
    cooldownUntil = now + COMBAT.cooldownMs;
    playSfx('swing');
    const facing = s.facing;
    const { itemId, reach, blade: armed } = equippedWeapon();
    swingAt = now;
    swingFacing = facing;
    showBlade = armed;
    if (slash) {
      slash.setVisible(true).setAlpha(1);
      if (scene.anims.exists('slash-arc')) slash.play('slash-arc', true);
    }
    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const id = sprite.name;
      const entity = world().entities[id];
      if (!entity || (entity.kind !== 'enemy' && entity.kind !== 'elite')) continue;
      if (entity.state === 'dead') continue;
      if (inSwingCone(s.player.x, s.player.y, sprite.x, sprite.y, facing, reach)) {
        const along = facingDir(facing);
        beginKnockback(sprite, along.x, along.y, KNOCK.enemySpeed, now);
        bus.emit('world:attack_landed', { entityId: id, facing, withItemId: itemId });
      }
    }
  };

  space.on('down', onSpace);

  const onPreUpdate = () => {
    clearShake();
    clearLunge();
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
        if (inEnemyContact(s.player.x, s.player.y, sprite.x, sprite.y)) {
          playHurt(sprite.x, sprite.y);
          bus.emit('world:player_hurt', { amount: 1, source: entity.name });
          break;
        }
      }
    }

    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const was = isKnocking(sprite, now);
      tickKnockback(sprite, now);
      if (!was || isKnocking(sprite, now)) continue;
      if (world().entities[sprite.name]?.state === 'dead' && sprite.body) {
        sprite.body.enable = false;
      }
    }
  };

  const onPostUpdate = () => {
    const now = scene.time.now;
    if (swingAt !== 0) {
      const t = swingProgress(now - swingAt);
      if (t >= 1) hideSwing();
      else {
        const lunge = swingLunge(swingFacing, t);
        lungeX = lunge.x;
        lungeY = lunge.y;
        s.player.x += lungeX;
        s.player.y += lungeY;
      }
    }
    if (hurtAt !== 0 && now < hurtAt + COMBAT.iFramesMs) {
      const shake = hurtShakeOffset(now - hurtAt, COMBAT.hurtShakeMs, COMBAT.hurtShakePx);
      shakeX = shake.x;
      shakeY = shake.y;
      s.player.x += shakeX;
      s.player.y += shakeY;
      if (now >= hurtAt + COMBAT.hurtFlashMs) {
        s.player.setAlpha(Math.floor(now / 60) % 2 === 0 ? 1 : 0.35);
      }
    }
    if (swingAt !== 0) poseSwing();
  };

  scene.events.on('preupdate', onPreUpdate);
  scene.events.on('update', onUpdate);
  scene.events.on('postupdate', onPostUpdate);

  const offEvent = bus.on('sim:event', (event) => {
    if (event.type === 'entity_struck') {
      const sprite = s.entityLayer.getByName(event.entityId) as Phaser.GameObjects.Sprite | null;
      if (!sprite) return;
      sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      burstSpark(sprite.x, sprite.y);
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
      if (sprite.body && !isKnocking(sprite, scene.time.now)) sprite.body.enable = false;
    }
    if (event.type === 'player_died') {
      hurtAt = 0;
      endHurtVisual();
      hideSwing();
      clearLunge();
      endKnockback(s.player);
    }
  });

  const offHydrate = bus.on('sim:hydrated', () => {
    iframeUntil = 0;
    hurtAt = 0;
    endHurtVisual();
    hideSwing();
    clearLunge();
    endKnockback(s.player);
  });

  return () => {
    space.off('down', onSpace);
    scene.events.off('preupdate', onPreUpdate);
    scene.events.off('update', onUpdate);
    scene.events.off('postupdate', onPostUpdate);
    flashTimer?.remove(false);
    endHurtVisual();
    hideSwing();
    clearLunge();
    blade?.destroy();
    slash?.destroy();
    offEvent();
    offHydrate();
  };
}
