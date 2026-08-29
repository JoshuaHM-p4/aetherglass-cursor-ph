// Slow door-guard. Hits with a short hammer cone. Contact itself does not hurt —
// the swing does. A wind-up cone telegraphs the strike.

import Phaser from 'phaser';
import { ROOM_SIZE } from '../../../lib/dungeon/const';
import { ITEM_REGISTRY } from '../../../lib/sim/registry';
import { world } from '../../../lib/sim/store';
import type { Facing } from '../../../lib/sim/types';
import { bus } from '../../EventBus';
import { TILE } from '../../const';
import { CYCLOPS_CONE, inSwingCone, SWING_CONE, swingReachPx } from '../hitbox';
import { beginKnockback, facingDir, isKnocking, KNOCK } from '../knockback';
import { playCyclopsWarn, playFoeVoice } from '../sound';
import { swingAngle, swingProgress, swordHand } from '../swingFx';
import { syncFoeTile } from './syncTile';

const WALK = 22;
const SYNC_MS = 400;
const TELEGRAPH_MS = 520;
const HAMMER = ITEM_REGISTRY.hammer.stats!;
const CONE_COLOR = 0xff7a18;

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
};

function cardinalToward(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

function facingRad(facing: Facing): number {
  if (facing === 'right') return 0;
  if (facing === 'down') return Math.PI / 2;
  if (facing === 'left') return Math.PI;
  return -Math.PI / 2;
}

function inCyclopsCone(ox: number, oy: number, px: number, py: number, facing: Facing): boolean {
  return inSwingCone(
    ox,
    oy,
    px,
    py,
    facing,
    CYCLOPS_CONE.reachTiles,
    CYCLOPS_CONE.targetRadiusPx,
    CYCLOPS_CONE.halfAngle,
    CYCLOPS_CONE.tipPx,
  );
}

function drawTelegraph(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  oy: number,
  facing: Facing,
  pulse: number,
): void {
  const mid = facingRad(facing);
  const half = CYCLOPS_CONE.halfAngle;
  const inner = SWING_CONE.innerPx;
  const outer = swingReachPx(CYCLOPS_CONE.reachTiles, CYCLOPS_CONE.tipPx);
  const start = mid - half;
  const end = mid + half;
  g.clear();
  g.fillStyle(CONE_COLOR, 0.18 + pulse * 0.22);
  const slices = 10;
  for (let i = 0; i < slices; i++) {
    const a0 = start + ((end - start) * i) / slices;
    const a1 = start + ((end - start) * (i + 1)) / slices;
    g.fillTriangle(
      ox + Math.cos(a0) * inner,
      oy + Math.sin(a0) * inner,
      ox + Math.cos(a0) * outer,
      oy + Math.sin(a0) * outer,
      ox + Math.cos(a1) * outer,
      oy + Math.sin(a1) * outer,
    );
    g.fillTriangle(
      ox + Math.cos(a0) * inner,
      oy + Math.sin(a0) * inner,
      ox + Math.cos(a1) * outer,
      oy + Math.sin(a1) * outer,
      ox + Math.cos(a1) * inner,
      oy + Math.sin(a1) * inner,
    );
  }
  g.lineStyle(1, CONE_COLOR, 0.55 + pulse * 0.4);
  g.beginPath();
  g.arc(ox, oy, outer, start, end, false);
  g.strokePath();
  g.lineBetween(
    ox + Math.cos(start) * inner,
    oy + Math.sin(start) * inner,
    ox + Math.cos(start) * outer,
    oy + Math.sin(start) * outer,
  );
  g.lineBetween(
    ox + Math.cos(end) * inner,
    oy + Math.sin(end) * inner,
    ox + Math.cos(end) * outer,
    oy + Math.sin(end) * outer,
  );
}

export function installCyclopsAi(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  const nextSync = new Map<string, number>();
  const hammers = new Map<string, Phaser.GameObjects.Image>();
  const cones = new Map<string, Phaser.GameObjects.Graphics>();
  const cooldownUntil = new Map<string, number>();
  const swingAt = new Map<string, number>();
  const swingFacing = new Map<string, Facing>();
  const windupAt = new Map<string, number>();
  const windupFacing = new Map<string, Facing>();

  const hammerOf = (id: string): Phaser.GameObjects.Image | null => {
    let img = hammers.get(id);
    if (img?.active) return img;
    const key = scene.textures.exists('tex-wield-hammer')
      ? 'tex-wield-hammer'
      : scene.textures.exists('tex-sword')
        ? 'tex-sword'
        : null;
    if (!key) return null;
    img = scene.add.image(0, 0, key).setVisible(false).setOrigin(0.5, 0.88).setDepth(12);
    hammers.set(id, img);
    return img;
  };

  const coneOf = (id: string): Phaser.GameObjects.Graphics => {
    let g = cones.get(id);
    if (g?.active) return g;
    g = scene.add.graphics().setDepth(11);
    cones.set(id, g);
    return g;
  };

  const hideCone = (id: string): void => {
    cones.get(id)?.clear().setVisible(false);
  };

  const poseHammer = (
    hammer: Phaser.GameObjects.Image | null,
    sprite: Phaser.Physics.Arcade.Sprite,
    facing: Facing,
    t: number,
  ): void => {
    if (!hammer) return;
    const hand = swordHand(facing);
    hammer
      .setPosition(sprite.x + hand.x, sprite.y + hand.y)
      .setAngle(swingAngle(facing, t))
      .setVisible(true)
      .setDepth(facing === 'up' ? 9 : 12);
  };

  const strike = (
    sprite: Phaser.Physics.Arcade.Sprite,
    facing: Facing,
    now: number,
    source: string,
  ): void => {
    hideCone(sprite.name);
    windupAt.delete(sprite.name);
    windupFacing.delete(sprite.name);
    swingAt.set(sprite.name, now);
    swingFacing.set(sprite.name, facing);
    cooldownUntil.set(sprite.name, now + (HAMMER.cooldownMs ?? 420) + TELEGRAPH_MS);
    playFoeVoice(sprite.name, ['cyclops']);
    if (!inCyclopsCone(sprite.x, sprite.y, s.player.x, s.player.y, facing)) return;
    const iframeUntil = (s.player.getData('iframeUntil') as number | undefined) ?? 0;
    if (now < iframeUntil || world().player.hp <= 0) return;
    const along = facingDir(facing);
    beginKnockback(s.player, along.x, along.y, KNOCK.playerSpeed * (HAMMER.knock ?? 1.8), now);
    bus.emit('world:player_hurt', { amount: HAMMER.damage ?? 4, source });
  };

  const onUpdate = () => {
    const roomId = world().player.roomId;
    const now = scene.time.now;
    const seen = new Set<string>();
    const max = ROOM_SIZE * TILE - 8;

    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const entity = world().entities[sprite.name];
      if (!entity || entity.state === 'dead' || !entity.tags.includes('cyclops')) continue;
      if (entity.roomId !== roomId || !sprite.body) continue;
      seen.add(sprite.name);
      sprite.setScale(1.2);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      const hammer = hammerOf(sprite.name);
      const swinging = swingAt.get(sprite.name);
      const winding = windupAt.get(sprite.name);
      const facing = swingFacing.get(sprite.name) ?? windupFacing.get(sprite.name) ?? 'down';

      if (swinging !== undefined) {
        hideCone(sprite.name);
        const t = swingProgress(now - swinging, HAMMER.swingMs ?? 280);
        poseHammer(hammer, sprite, facing, t);
        if (t >= 1) {
          swingAt.delete(sprite.name);
          hammer?.setVisible(false);
        }
        body.setVelocity(0, 0);
        continue;
      }

      if (winding !== undefined) {
        if (isKnocking(sprite, now)) {
          windupAt.delete(sprite.name);
          windupFacing.delete(sprite.name);
          hideCone(sprite.name);
          hammer?.setVisible(false);
          continue;
        }
        const face = windupFacing.get(sprite.name) ?? facing;
        const elapsed = now - winding;
        const pulse = 0.5 + 0.5 * Math.sin(now / 70);
        drawTelegraph(coneOf(sprite.name).setVisible(true), sprite.x, sprite.y, face, pulse);
        poseHammer(hammer, sprite, face, 0);
        body.setVelocity(0, 0);
        if (elapsed >= TELEGRAPH_MS) strike(sprite, face, now, entity.name);
        continue;
      }

      hideCone(sprite.name);
      if (isKnocking(sprite, now)) continue;
      sprite.x = Phaser.Math.Clamp(sprite.x, 8, max);
      sprite.y = Phaser.Math.Clamp(sprite.y, 8, max);

      const dx = s.player.x - sprite.x;
      const dy = s.player.y - sprite.y;
      const len = Math.hypot(dx, dy) || 1;
      const face = cardinalToward(dx, dy);
      const ready = now >= (cooldownUntil.get(sprite.name) ?? 0);
      const canHurt = world().player.hp > 0;

      if (ready && canHurt && inCyclopsCone(sprite.x, sprite.y, s.player.x, s.player.y, face)) {
        windupAt.set(sprite.name, now);
        windupFacing.set(sprite.name, face);
        body.setVelocity(0, 0);
        playCyclopsWarn();
        continue;
      }

      body.setVelocity((dx / len) * WALK, (dy / len) * WALK);
      const due = nextSync.get(sprite.name) ?? 0;
      if (now >= due) {
        nextSync.set(sprite.name, now + SYNC_MS);
        syncFoeTile(sprite, sprite.name);
      }
    }

    for (const [id, img] of hammers) {
      if (seen.has(id)) continue;
      img.destroy();
      hammers.delete(id);
    }
    for (const [id, g] of cones) {
      if (seen.has(id)) continue;
      g.destroy();
      cones.delete(id);
    }
  };

  scene.events.on('update', onUpdate);
  return () => {
    scene.events.off('update', onUpdate);
    for (const img of hammers.values()) img.destroy();
    hammers.clear();
    for (const g of cones.values()) g.destroy();
    cones.clear();
  };
}
