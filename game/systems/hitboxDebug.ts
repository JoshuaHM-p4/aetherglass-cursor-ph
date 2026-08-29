// Debug overlay for contact boxes and the swing cone. Phaser reads the flag
// each frame; React writes it (same pattern as inputCapture).

import Phaser from 'phaser';
import type { Facing } from '../../lib/sim/types';
import { world } from '../../lib/sim/store';
import { ACTOR_BODY } from '../const';
import { isHitboxDebug } from '../hitboxDebug';
import { getHotbarSlot } from '../inputCapture';
import { SWING_CONE, swingReachPx } from './hitbox';

const PLAYER = 0x5dff8a;
const FOE = 0xff4a5a;
const PROP = 0xd0d4e0;
const CONE = 0xc9a86a;

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
  facing: Facing;
};

function facingRad(facing: Facing): number {
  if (facing === 'right') return 0;
  if (facing === 'down') return Math.PI / 2;
  if (facing === 'left') return Math.PI;
  return -Math.PI / 2;
}

function strokeBox(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha: number,
): void {
  g.lineStyle(1, color, alpha);
  g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w - 1, h - 1);
}

function fillBox(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha: number,
): void {
  g.fillStyle(color, alpha);
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawActor(
  g: Phaser.GameObjects.Graphics,
  sprite: Phaser.Physics.Arcade.Sprite,
  color: number,
): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | null;
  if (body && body.enable !== false) {
    fillBox(g, body.x, body.y, body.width, body.height, color, 0.22);
    strokeBox(g, body.x, body.y, body.width, body.height, color, 0.95);
  }
  const reach = ACTOR_BODY + 1;
  strokeBox(g, sprite.x - reach, sprite.y - reach, reach * 2, reach * 2, color, 0.45);
}

function drawCone(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  oy: number,
  facing: Facing,
  reachTiles: number,
): void {
  const mid = facingRad(facing);
  const half = SWING_CONE.halfAngle;
  const inner = SWING_CONE.innerPx;
  const outer = swingReachPx(reachTiles);
  const start = mid - half;
  const end = mid + half;
  g.lineStyle(1, CONE, 0.7);
  g.beginPath();
  g.arc(ox, oy, outer, start, end, false);
  g.strokePath();
  g.beginPath();
  g.arc(ox, oy, inner, start, end, false);
  g.strokePath();
  g.lineBetween(ox + Math.cos(start) * inner, oy + Math.sin(start) * inner, ox + Math.cos(start) * outer, oy + Math.sin(start) * outer);
  g.lineBetween(ox + Math.cos(end) * inner, oy + Math.sin(end) * inner, ox + Math.cos(end) * outer, oy + Math.sin(end) * outer);
}

function equippedReach(): number {
  const { player } = world();
  const itemId = player.hotbar[getHotbarSlot()];
  const item = itemId ? player.bag.find((i) => i.id === itemId) : undefined;
  return item?.stats?.reach ?? 1;
}

export function installHitboxDebug(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  const g = scene.add.graphics().setDepth(24);

  const onUpdate = () => {
    g.clear();
    if (!isHitboxDebug()) return;
    drawActor(g, s.player, PLAYER);
    drawCone(g, s.player.x, s.player.y, s.facing, equippedReach());
    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const entity = world().entities[sprite.name];
      if (!entity) continue;
      if (entity.kind === 'enemy' || entity.kind === 'elite') {
        if (entity.state === 'dead') continue;
        drawActor(g, sprite, FOE);
      } else {
        const body = sprite.body as Phaser.Physics.Arcade.Body | null;
        if (!body || body.checkCollision?.none) continue;
        strokeBox(g, body.x, body.y, body.width, body.height, PROP, 0.35);
      }
    }
  };

  scene.events.on('postupdate', onUpdate);
  return () => {
    scene.events.off('postupdate', onUpdate);
    g.destroy();
  };
}
