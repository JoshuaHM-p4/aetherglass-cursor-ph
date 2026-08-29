// Nearest adjacent entity, same scoring Enter uses. Phaser-free so the hint
// overlay and the key binding cannot drift apart.

import { isAdjacent } from '../../lib/sim/select';
import type { Entity, Facing, GameState } from '../../lib/sim/types';

export function pickAdjacentEntity(
  state: GameState,
  facing: Facing,
  filter?: (entity: Entity) => boolean,
): Entity | null {
  let best: { entity: Entity; score: number } | null = null;
  for (const entity of Object.values(state.entities)) {
    if (entity.roomId !== state.player.roomId) continue;
    if (!isAdjacent(state, entity.id)) continue;
    if (filter && !filter(entity)) continue;
    const dx = entity.tx - state.player.tx;
    const dy = entity.ty - state.player.ty;
    const aligned =
      (facing === 'right' && dx >= 0) ||
      (facing === 'left' && dx <= 0) ||
      (facing === 'down' && dy >= 0) ||
      (facing === 'up' && dy <= 0);
    const score = Math.abs(dx) + Math.abs(dy) - (aligned ? 1 : 0);
    if (!best || score < best.score) best = { entity, score };
  }
  return best?.entity ?? null;
}

export function isPaneInteractable(entity: Entity): boolean {
  if (!entity.paneWorthy) return false;
  if (entity.state === 'dead') return false;
  if (entity.tags.includes('pickup') && entity.state === 'open') return false;
  return true;
}
