import type { Facing } from '../../lib/sim/types';
import { ACTOR_BODY } from '../const';

const TILE = 16;

/** Pixel cone that matches the baked slash: a wide arc in front of the scavenger. */
export const SWING_CONE = {
  innerPx: 4,
  /** Extra past `reach` tiles so the tip covers the 32px slash (scaled up). */
  tipPx: 22,
  /** Half-angle in radians. Last slash frame uses ~1.16. */
  halfAngle: 1.16,
  /** Enemy body treated as a disk so a near-miss on the sprite still connects. */
  enemyRadiusPx: 14,
} as const;

function axis(facing: Facing): { x: number; y: number } {
  if (facing === 'right') return { x: 1, y: 0 };
  if (facing === 'left') return { x: -1, y: 0 };
  if (facing === 'down') return { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

export function swingReachPx(reachTiles: number): number {
  return TILE * Math.max(1, reachTiles) + SWING_CONE.tipPx;
}

/**
 * True when two equal `ACTOR_BODY` boxes are touching.
 * +1px so arcade separation (centres parked at body-size) still counts.
 * Sword reach is `inSwingCone` — do not widen this.
 */
export function inEnemyContact(px: number, py: number, ex: number, ey: number): boolean {
  const reach = ACTOR_BODY + 1;
  return Math.abs(px - ex) <= reach && Math.abs(py - ey) <= reach;
}

/**
 * True when a disk around a world-pixel point overlaps the swing cone.
 * Origin is the scavenger's sprite centre. `radiusPx` is the enemy hitbox.
 */
export function inSwingCone(
  ox: number,
  oy: number,
  px: number,
  py: number,
  facing: Facing,
  reachTiles: number,
  radiusPx: number = SWING_CONE.enemyRadiusPx,
): boolean {
  const a = axis(facing);
  const dx = px - ox;
  const dy = py - oy;
  // Closest point on the disk to the cone's spine, so a glancing sprite still counts.
  const along = dx * a.x + dy * a.y;
  const perpX = dx - along * a.x;
  const perpY = dy - along * a.y;
  const perp = Math.hypot(perpX, perpY);
  const pull = Math.min(radiusPx, perp);
  const scale = perp > 0.001 ? pull / perp : 0;
  const qx = dx - perpX * scale;
  const qy = dy - perpY * scale;
  const dist = Math.hypot(qx, qy);
  if (dist < Math.max(1, SWING_CONE.innerPx - radiusPx)) return false;
  if (dist > swingReachPx(reachTiles) + radiusPx) return false;
  const dot = (qx * a.x + qy * a.y) / Math.max(dist, 0.001);
  return dot >= Math.cos(SWING_CONE.halfAngle);
}

/** Tile-space AABB that contains the cone. Kept for debug / old callers. */
export function swingHitbox(
  tx: number,
  ty: number,
  facing: Facing,
  reachTiles: number,
): { tx: number; ty: number; w: number; h: number } {
  const reach = Math.max(1, reachTiles);
  if (facing === 'right') return { tx: tx + 1, ty: ty - 1, w: reach + 1, h: 3 };
  if (facing === 'left') return { tx: tx - reach - 1, ty: ty - 1, w: reach + 1, h: 3 };
  if (facing === 'down') return { tx: tx - 1, ty: ty + 1, w: 3, h: reach + 1 };
  return { tx: tx - 1, ty: ty - reach - 1, w: 3, h: reach + 1 };
}
