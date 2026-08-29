// game/systems/combat.ts
//
// Space uses the equipped hotbar item: swing, drink, or parry.
// AGENTS.md #5: NO LLM CALLS HERE, EVER. This is a 60fps path.
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
import type { Facing, Item } from '../../lib/sim/types';
import { gameStore, world } from '../../lib/sim/store';
import { bus } from '../EventBus';
import { getHotbarSlot, isWorldInputBlocked } from '../inputCapture';
import { ROOM_SIZE } from '../../lib/dungeon/const';
import { TILE } from '../const';
import { BOLT, boltHits, boltRangePx, foeContactReach, foeRadiusPx, inEnemyContact, inSwingCone, SWING_CONE } from './hitbox';
import { contactDamage } from './foeContact';
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
import { playWeaponUse } from './sound';
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
  parryMs: 220,
  wardMs: 1200,
  hasteMs: 6000,
  hasteCooldown: 0.55,
} as const;

const UNARMED = {
  damage: 1,
  reach: 1,
  cone: 0.7,
  knock: 0.6,
  cooldownMs: 220,
  swingMs: 140,
} as const;

const WARD_TINT = 0x88ddff;

function hotbarItem(): { itemId: string | null; item: Item | undefined } {
  const { player } = world();
  const itemId = player.hotbar[getHotbarSlot()];
  const item = itemId ? player.bag.find((i) => i.id === itemId) : undefined;
  return { itemId, item };
}

const BOLT_SPEED = 160;

function isBoltItem(item: Item | undefined): boolean {
  return Boolean(item?.tags.includes('bolt'));
}

function isSwingItem(item: Item | undefined): boolean {
  if (!item || item.tags.includes('bolt')) return false;
  return item.kind === 'weapon' || item.tags.includes('sharp') || item.tags.includes('blunt');
}

function isShieldItem(item: Item | undefined): boolean {
  if (!item) return false;
  return item.kind === 'shield' || item.tags.includes('block');
}

function wieldTexture(scene: Phaser.Scene, itemId: string | null): string | null {
  if (!itemId) return null;
  const key = `tex-wield-${itemId}`;
  return scene.textures.exists(key) ? key : null;
}

function shieldPlace(facing: Facing): { x: number; y: number } {
  if (facing === 'right') return { x: 8, y: 1 };
  if (facing === 'left') return { x: -8, y: 1 };
  if (facing === 'down') return { x: 1, y: 8 };
  return { x: 1, y: -8 };
}

/**
 * `facing` comes from the scene, not from `world().player.facing`: the sim only learns
 * the direction on a tile crossing, and a player pinned against an entity turns without
 * crossing anything. Reading the stale fact would swing the blade the wrong way.
 */
type CombatScene = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
  facing: Facing;
  walls?: Phaser.Physics.Arcade.StaticGroup;
};

/** Shared with Overworld's store sync, so a hit flash cannot outlive a death. */
export const DEAD_TINT = 0x555555;

/**
 * Reads the hotbar's active item from the store ONCE PER PRESS — not per frame.
 * Space uses that item: swing, drink, or parry.
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
  let swingDur: number = COMBAT.swingMs;
  let showBlade = false;
  let showSlash = false;
  let lungeX = 0;
  let lungeY = 0;
  let parryUntil = 0;
  let parryDone = false;
  let parryItemId: string | null = null;
  let parryBash = 0;
  let hasteUntil = 0;
  let wardUntil = 0;

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
  const shield = scene.add.image(0, 0, 'tex-sword').setVisible(false).setOrigin(0.5, 0.5).setDepth(12);

  type LiveBolt = {
    sprite: Phaser.Physics.Arcade.Image;
    itemId: string | null;
    facing: Facing;
    knock: number;
    ox: number;
    oy: number;
    rangePx: number;
    collider: Phaser.Physics.Arcade.Collider | null;
  };
  const bolts: LiveBolt[] = [];

  const killBolt = (bolt: LiveBolt): void => {
    bolt.collider?.destroy();
    bolt.sprite.destroy();
    const i = bolts.indexOf(bolt);
    if (i >= 0) bolts.splice(i, 1);
  };

  const clearBolts = (): void => {
    for (const bolt of [...bolts]) killBolt(bolt);
  };

  const hideSwing = (): void => {
    swingAt = 0;
    showBlade = false;
    showSlash = false;
    blade?.setVisible(false);
    slash?.setVisible(false).anims.stop();
  };

  const hideShield = (): void => {
    parryUntil = 0;
    parryDone = false;
    parryItemId = null;
    parryBash = 0;
    shield.setVisible(false);
  };

  const poseShield = (): void => {
    if (scene.time.now >= parryUntil) {
      if (shield.visible) hideShield();
      return;
    }
    const place = shieldPlace(s.facing);
    const tex = wieldTexture(scene, parryItemId) ?? 'tex-sword';
    if (scene.textures.exists(tex)) shield.setTexture(tex);
    shield
      .setPosition(s.player.x + place.x, s.player.y + place.y)
      .setDepth(s.facing === 'up' ? 9 : 12)
      .setVisible(true);
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
    const t = swingProgress(scene.time.now - swingAt, swingDur);
    const hand = swordHand(swingFacing);
    const place = slashPlace(swingFacing);
    if (blade && showBlade) {
      blade
        .setPosition(s.player.x + hand.x, s.player.y + hand.y)
        .setAngle(swingAngle(swingFacing, t))
        .setDepth(swingFacing === 'up' ? 9 : 12)
        .setVisible(true);
    }
    if (slash && showSlash) {
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
    s.player.setData('iframeUntil', iframeUntil);
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

  const beginSwing = (itemId: string | null, item: Item | undefined, now: number): void => {
    const stats = item?.stats;
    const reach = stats?.reach ?? UNARMED.reach;
    const cone = stats?.cone ?? (item ? SWING_CONE.halfAngle : UNARMED.cone);
    const knock = stats?.knock ?? (item ? 1 : UNARMED.knock);
    const cooldown = stats?.cooldownMs ?? (item ? COMBAT.cooldownMs : UNARMED.cooldownMs);
    swingDur = stats?.swingMs ?? (item ? COMBAT.swingMs : UNARMED.swingMs);
    cooldownUntil = now + cooldown * (now < hasteUntil ? COMBAT.hasteCooldown : 1);
    playWeaponUse(item);
    const facing = s.facing;
    swingAt = now;
    swingFacing = facing;
    showBlade = Boolean(item);
    showSlash = true;
    const tex = wieldTexture(scene, itemId);
    if (blade && tex) blade.setTexture(tex);
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
      if (sprite.body && sprite.body.enable === false) continue;
      if (inSwingCone(
        s.player.x,
        s.player.y,
        sprite.x,
        sprite.y,
        facing,
        reach,
        foeRadiusPx(entity.tags),
        cone,
      )) {
        const along = facingDir(facing);
        beginKnockback(sprite, along.x, along.y, KNOCK.enemySpeed * knock, now);
        bus.emit('world:attack_landed', { entityId: id, facing, withItemId: itemId });
      }
    }
  };

  const beginBolt = (itemId: string | null, item: Item, now: number): void => {
    const stats = item.stats;
    const cooldown = stats?.cooldownMs ?? COMBAT.cooldownMs;
    swingDur = stats?.swingMs ?? 140;
    cooldownUntil = now + cooldown * (now < hasteUntil ? COMBAT.hasteCooldown : 1);
    playWeaponUse(item);
    const facing = s.facing;
    swingAt = now;
    swingFacing = facing;
    showBlade = true;
    showSlash = false;
    slash?.setVisible(false).anims.stop();
    const tex = wieldTexture(scene, itemId);
    if (blade && tex) blade.setTexture(tex);
    const along = facingDir(facing);
    const originX = s.player.x + along.x * 10;
    const originY = s.player.y + along.y * 10;
    const key = scene.textures.exists('tex-bolt') ? 'tex-bolt' : 'tex-spark';
    if (!scene.textures.exists(key)) return;
    const sprite = scene.physics.add.image(originX, originY, key).setDepth(14);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(6, 6, true);
    body.setVelocity(along.x * BOLT_SPEED, along.y * BOLT_SPEED);
    const bolt: LiveBolt = {
      sprite,
      itemId,
      facing,
      knock: stats?.knock ?? 0.4,
      ox: originX,
      oy: originY,
      rangePx: boltRangePx(stats?.reach ?? 6),
      collider: null,
    };
    if (s.walls) {
      bolt.collider = scene.physics.add.overlap(sprite, s.walls, () => {
        burstSpark(sprite.x, sprite.y);
        killBolt(bolt);
      });
    }
    bolts.push(bolt);
  };

  const tickBolts = (): void => {
    const now = scene.time.now;
    const max = ROOM_SIZE * TILE;
    for (const bolt of [...bolts]) {
      if (!bolt.sprite.active) {
        killBolt(bolt);
        continue;
      }
      const { x, y } = bolt.sprite;
      if (Math.hypot(x - bolt.ox, y - bolt.oy) > bolt.rangePx || x < 0 || y < 0 || x > max || y > max) {
        killBolt(bolt);
        continue;
      }
      for (const obj of s.entityLayer.list) {
        const foe = obj as Phaser.Physics.Arcade.Sprite;
        const entity = world().entities[foe.name];
        if (!entity || (entity.kind !== 'enemy' && entity.kind !== 'elite')) continue;
        if (entity.state === 'dead') continue;
        if (foe.body && foe.body.enable === false) continue;
        if (!boltHits(x, y, foe.x, foe.y, BOLT.radiusPx, foeRadiusPx(entity.tags))) continue;
        const along = facingDir(bolt.facing);
        beginKnockback(foe, along.x, along.y, KNOCK.enemySpeed * bolt.knock, now);
        bus.emit('world:attack_landed', { entityId: foe.name, facing: bolt.facing, withItemId: bolt.itemId });
        burstSpark(foe.x, foe.y);
        killBolt(bolt);
        break;
      }
    }
  };

  const drinkItem = (item: Item, now: number): void => {
    const heal = item.stats?.heal ?? 0;
    const ward = item.tags.includes('ward');
    const haste = item.tags.includes('haste');
    const healOnly = heal > 0 && !ward && !haste;
    if (healOnly && world().player.hp >= world().player.hpMax) {
      bus.emit('hud:toast', { text: 'already full' });
      return;
    }
    const cooldown = item.stats?.cooldownMs ?? 280;
    cooldownUntil = now + cooldown * (now < hasteUntil ? COMBAT.hasteCooldown : 1);
    const { dispatch } = gameStore.getState();
    if (heal > 0) dispatch({ type: 'HEAL', amount: heal }, 'keyboard');
    if (ward) {
      wardUntil = now + COMBAT.wardMs;
      iframeUntil = Math.max(iframeUntil, wardUntil);
      s.player.setData('iframeUntil', iframeUntil);
    }
    if (haste) hasteUntil = now + COMBAT.hasteMs;
    dispatch({ type: 'CONSUME_ITEM', itemId: item.id }, 'keyboard');
  };

  const beginParry = (item: Item, itemId: string, now: number): void => {
    hideSwing();
    const cooldown = item.stats?.cooldownMs ?? 320;
    cooldownUntil = now + cooldown * (now < hasteUntil ? COMBAT.hasteCooldown : 1);
    parryUntil = now + COMBAT.parryMs;
    parryDone = false;
    parryItemId = itemId;
    parryBash = item.stats?.damage ?? 0;
    playWeaponUse(item);
  };

  const onSpace = () => {
    if (isWorldInputBlocked()) return;
    const now = scene.time.now;
    if (now < cooldownUntil) return;
    const { itemId, item } = hotbarItem();
    if (item?.kind === 'consumable') {
      const usable =
        (item.stats?.heal ?? 0) > 0 || item.tags.includes('ward') || item.tags.includes('haste');
      if (usable) drinkItem(item, now);
      return;
    }
    if (isShieldItem(item) && item && itemId) {
      beginParry(item, itemId, now);
      return;
    }
    if (item?.kind === 'tool') return;
    if (isBoltItem(item) && item) {
      beginBolt(itemId, item, now);
      return;
    }
    if (!item || isSwingItem(item)) {
      beginSwing(itemId, item, now);
    }
  };

  space.on('down', onSpace);

  const onPreUpdate = () => {
    clearShake();
    clearLunge();
  };

  const onUpdate = () => {
    const now = scene.time.now;
    tickBolts();
    const hurting = hurtAt !== 0 && now < hurtAt + COMBAT.iFramesMs;
    if (!hurting && hurtAt !== 0) {
      endHurtVisual();
      hurtAt = 0;
    }

    if (now < parryUntil && !parryDone && world().player.hp > 0) {
      for (const obj of s.entityLayer.list) {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        const entity = world().entities[sprite.name];
        if (!entity || (entity.kind !== 'enemy' && entity.kind !== 'elite')) continue;
        if (entity.state === 'dead') continue;
        if (sprite.body && sprite.body.enable === false) continue;
        if (!inEnemyContact(s.player.x, s.player.y, sprite.x, sprite.y, foeContactReach(entity.tags))) continue;
        const away = dirFromTo(s.player.x, s.player.y, sprite.x, sprite.y, facingDir(s.facing));
        beginKnockback(sprite, away.x, away.y, KNOCK.enemySpeed * 1.2, now);
        if (parryBash > 0) {
          bus.emit('world:attack_landed', { entityId: sprite.name, facing: s.facing, withItemId: parryItemId });
        }
        parryDone = true;
        break;
      }
    }

    if (now >= iframeUntil && world().player.hp > 0) {
      for (const obj of s.entityLayer.list) {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        const entity = world().entities[sprite.name];
        if (!entity || (entity.kind !== 'enemy' && entity.kind !== 'elite')) continue;
        if (entity.state === 'dead') continue;
        if (sprite.body && sprite.body.enable === false) continue;
        const amount = contactDamage(entity);
        if (amount === null) continue;
        if (inEnemyContact(s.player.x, s.player.y, sprite.x, sprite.y, foeContactReach(entity.tags))) {
          playHurt(sprite.x, sprite.y);
          bus.emit('world:player_hurt', { amount, source: entity.name });
          break;
        }
      }
    }

    if (!hurting && world().player.hp > 0) {
      if (now < wardUntil) {
        s.player.setTintMode(Phaser.TintModes.MULTIPLY).setTint(WARD_TINT);
      } else if (wardUntil !== 0 && now >= wardUntil) {
        wardUntil = 0;
        s.player.clearTint();
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
      const t = swingProgress(now - swingAt, swingDur);
      if (t >= 1) hideSwing();
      else if (showSlash) {
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
    poseShield();
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
      wardUntil = 0;
      hasteUntil = 0;
      endHurtVisual();
      hideSwing();
      hideShield();
      clearLunge();
      clearBolts();
      endKnockback(s.player);
    }
  });

  const offHydrate = bus.on('sim:hydrated', () => {
    iframeUntil = 0;
    s.player.setData('iframeUntil', 0);
    hurtAt = 0;
    wardUntil = 0;
    hasteUntil = 0;
    endHurtVisual();
    hideSwing();
    hideShield();
    clearLunge();
    clearBolts();
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
    hideShield();
    clearLunge();
    clearBolts();
    blade?.destroy();
    slash?.destroy();
    shield.destroy();
    offEvent();
    offHydrate();
  };
}
