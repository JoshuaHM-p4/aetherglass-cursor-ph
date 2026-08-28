import type { Facing } from '../../lib/sim/types';

/** Tile-space rectangle in front of the player, sized by the equipped weapon's reach. */
export function swingHitbox(
  tx: number, ty: number, facing: Facing, reachTiles: number,
): { tx: number; ty: number; w: number; h: number } {
  const reach = Math.max(1, reachTiles);
  if (facing === 'right') return { tx: tx + 1, ty, w: reach, h: 1 };
  if (facing === 'left') return { tx: tx - reach, ty, w: reach, h: 1 };
  if (facing === 'down') return { tx, ty: ty + 1, w: 1, h: reach };
  return { tx, ty: ty - reach, w: 1, h: reach };
}
