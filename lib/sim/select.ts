// lib/sim/select.ts
//
// Read-only projections of GameState. Pure, synchronous, no imports outside lib/sim.
//
// WHY THIS FILE EXISTS: three different consumers need "the entities near the player"
// and "the item with this id" — rules.ts, context.ts, and the HUD. If each writes its
// own scan they will disagree about ties, about whether `dead` entities count, and
// about Chebyshev vs Manhattan distance. One definition, three callers.
//
// ACCESS-PATTERN NOTES (data structures first — see rationale.md §Shape):
//
//   entities: Record<string, Entity>   O(1) by id. This is the dominant pattern:
//     every guard, every verdict replay, and every focus_entity call is a lookup by
//     id. Correct as authored.
//
//   bag: Item[]                        Linear. Bag is capped at BAG_SLOTS = 12, and
//     the BagGrid renders it in slot order, so the array IS the render model. An id
//     index would be a second source of truth for membership and would need syncing
//     on every grant/consume. We do not add one, at any bag size this game will have.
//
//   nearby scan                        Linear over ~30 entities, called ONCE PER PANE
//     TURN — not per frame. Phaser never calls this: proximity in the 60fps path is
//     an arcade-physics overlap sensor on the sprite (game/systems/proximity.ts), so
//     the physics engine is the spatial index and the sim owns no geometry structures.

import type { Entity, GameState, Item } from './types';

export const BAG_SLOTS = 12;
export const NEARBY_LIMIT = 8;
/** Chebyshev tiles. Adjacency for interaction; also the prefetch trigger radius is 3. */
export const REACH_TILES = 1;

export interface RankedEntity extends Entity {
  /** Chebyshev distance in tiles from the player. */
  d: number;
}

/**
 * Nearest entities, ascending by distance, ties broken by id so the packet is
 * byte-stable for identical states (this matters: the prefetch digest hashes it).
 * Excludes nothing — a `dead` slime is still worth a sentence — but see the
 * `kinds` filter for callers that need to.
 */
export function nearestEntities(
  state: GameState,
  limit: number = NEARBY_LIMIT,
): RankedEntity[] {
  const { tx, ty } = state.player;
  return Object.values(state.entities)
    .filter((e) => e.roomId === state.player.roomId)
    .map((e): RankedEntity => ({ ...e, d: Math.max(Math.abs(e.tx - tx), Math.abs(e.ty - ty)) }))
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit);
}

/** Chebyshev tile distance from player to entity. Infinity if the id does not resolve. */
export function distanceTo(state: GameState, entityId: string): number {
  const entity = state.entities[entityId];
  if (!entity) return Infinity;
  if (entity.roomId !== state.player.roomId) return Infinity;
  const { tx, ty } = state.player;
  return Math.max(Math.abs(entity.tx - tx), Math.abs(entity.ty - ty));
}

/** True when the player could reach out and touch it. The precondition for every interaction. */
export function isAdjacent(state: GameState, entityId: string): boolean {
  return distanceTo(state, entityId) <= REACH_TILES;
}

/** The bag entry for an id, or undefined. Stacks are one entry with qty > 1. */
export function findItem(state: GameState, itemId: string): Item | undefined {
  return state.player.bag.find((item) => item.id === itemId);
}

/** Total quantity held of an id (0 when absent). */
export function heldQty(state: GameState, itemId: string): number {
  return findItem(state, itemId)?.qty ?? 0;
}

/** Occupied slots vs BAG_SLOTS. A new stackable id needs a free slot; a top-up does not. */
export function bagHasRoomFor(state: GameState, itemId: string): boolean {
  if (itemId === 'heart_container') return true;
  const existing = findItem(state, itemId);
  if (existing?.stackable) return true;
  return state.player.bag.length < BAG_SLOTS;
}

/**
 * Hearts for StatGlyphs: hpMax HP -> hpMax/2 containers at half-heart granularity.
 * Derived, never stored. PRD §4.1.
 */
export function hearts(state: GameState): Array<'full' | 'half' | 'empty'> {
  const { hp, hpMax } = state.player;
  const containers = Math.floor(hpMax / 2);
  return Array.from({ length: containers }, (_, i) => {
    const remaining = hp - i * 2;
    if (remaining >= 2) return 'full';
    if (remaining === 1) return 'half';
    return 'empty';
  });
}
