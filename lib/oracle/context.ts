// lib/oracle/context.ts
//
// GameState (+ the Pane's journal) -> the ~1200-token snapshot the model reads.
//
// Runs SERVER-SIDE, on the snapshot that arrived in the request, which is the same
// object the fork mutates. That is the structural fix for ARCHITECTURE §9's first
// failure mode ("packet built from stale state"): the packet and the tools cannot
// disagree because there is only one state object in the request.

import type { ContextPacket, GameState } from '../sim/types';
import type { PaneJournal } from './journal';

/**
 * Flat, small, regenerated every turn. Ids and tags carry the meaning; the model
 * reasons over tags, not names (ARCHITECTURE §3).
 *
 * `recentEvents` is the MERGE POINT for the two histories: the sim's log tail
 * interleaved with the Pane's journal tail, in wall order. This is the only place the
 * two actors' memories meet, and it is a read, so neither can corrupt the other.
 */
export function buildContextPacket(state: GameState, journal: PaneJournal): ContextPacket {
  throw new Error('not implemented');
  // TODO
  //   nearby: nearestEntities(state, NEARBY_LIMIT).map(e => ({ ...projection, distance: e.d }))
  //   recentEvents: interleave(state.log.slice(-5), recentLines(journal, 5))
  //   flags: pickPublicFlags(state.flags)   // QUEST_FLAGS only; no debug flags
}

/** Only flags the model is allowed to know about. Everything else is engine bookkeeping. */
export function pickPublicFlags(flags: Record<string, boolean>): Record<string, boolean> {
  throw new Error('not implemented');
}

/**
 * A stable content hash of everything in the packet that changes the model's answer.
 *
 * THIS IS THE PREFETCH INVALIDATOR (open question 4). `rev` is too strict — it bumps on
 * every MOVE, so a buffered response would die on the walk toward the chest it was
 * generated for. So we hash the *semantics*:
 *
 *   - nearby: [id, kind, state, tags, distanceBucket] for all 8
 *   - inventory: [id, qty] for all
 *   - hp bucket (per half-heart), integrity TIER (not the raw number)
 *   - focus id, public flags
 *
 * `distanceBucket` is `adjacent | near | far`, so wandering two tiles closer does not
 * invalidate a buffered stream, but picking up the crowbar does — which is exactly the
 * demo beat from PRD §4.4 ("picking up a crowbar changes the options on a door you've
 * already seen"). Integrity is bucketed by tier for the same reason: the prompt only
 * changes at tier boundaries, so only tier boundaries should invalidate.
 */
export function digestPacket(packet: ContextPacket): string {
  throw new Error('not implemented');
}

export type DistanceBucket = 'adjacent' | 'near' | 'far';
export function bucketDistance(d: number): DistanceBucket {
  throw new Error('not implemented');
}
