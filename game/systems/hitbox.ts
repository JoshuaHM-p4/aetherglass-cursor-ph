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

/** Visual scale of the dungeon crab (16px tile × this ≈ four tiles). */
export const CRAB_SCALE = 4;
/** Unscaled arcade box; × CRAB_SCALE ≈ 2.5 tiles so the room stays walkable. */
export const CRAB_BODY = 10;
export const CRAB_RADIUS_PX = 28;

function axis(facing: Facing): { x: number; y: number } {
  if (facing === 'right') return { x: 1, y: 0 };
  if (facing === 'left') return { x: -1, y: 0 };
  if (facing === 'down') return { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

export function swingReachPx(reachTiles: number, tipPx: number = SWING_CONE.tipPx): number {
  return TILE * Math.max(1, reachTiles) + tipPx;
}

/** How far a `bolt` travels, in pixels. No slash-tip padding. */
export function boltRangePx(reachTiles: number): number {
  return TILE * Math.max(1, reachTiles);
}

export const BOLT = {
  radiusPx: 5,
} as const;

/** Cyclops hammer: shorter tip and a tighter cone than the player's hammer. */
export const CYCLOPS_CONE = {
  reachTiles: 1,
  tipPx: 4,
  halfAngle: 0.55,
  targetRadiusPx: 7,
} as const;

/** True when a bolt disk overlaps an enemy disk. */
export function boltHits(
  bx: number,
  by: number,
  ex: number,
  ey: number,
  boltRadiusPx: number = BOLT.radiusPx,
  enemyRadiusPx: number = SWING_CONE.enemyRadiusPx,
): boolean {
  return Math.hypot(bx - ex, by - ey) <= boltRadiusPx + enemyRadiusPx;
}

/**
 * True when two equal `ACTOR_BODY` boxes are touching.
 * +1px so arcade separation (centres parked at body-size) still counts.
 * Sword reach is `inSwingCone` — do not widen this.
 */
export function inEnemyContact(
  px: number,
  py: number,
  ex: number,
  ey: number,
  reach: number = ACTOR_BODY + 1,
): boolean {
  return Math.abs(px - ex) <= reach && Math.abs(py - ey) <= reach;
}

export function foeRadiusPx(tags: readonly string[]): number {
  if (tags.includes('crab') || tags.includes('boss')) return CRAB_RADIUS_PX;
  return SWING_CONE.enemyRadiusPx;
}

export function foeContactReach(tags: readonly string[]): number {
  if (tags.includes('crab') || tags.includes('boss')) return CRAB_RADIUS_PX;
  return ACTOR_BODY + 1;
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
  halfAngle: number = SWING_CONE.halfAngle,
  tipPx: number = SWING_CONE.tipPx,
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
  if (dist > TILE * Math.max(1, reachTiles) + tipPx + radiusPx) return false;
  const dot = (qx * a.x + qy * a.y) / Math.max(dist, 0.001);
  return dot >= Math.cos(halfAngle);
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
