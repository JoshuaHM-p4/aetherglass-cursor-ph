// lib/oracle/context.ts
//
// GameState (+ the Pane's journal) -> the ~1200-token snapshot the model reads.
//
// Runs SERVER-SIDE, on the snapshot that arrived in the request, which is the same
// object the fork mutates. That is the structural fix for ARCHITECTURE §9's first
// failure mode ("packet built from stale state"): the packet and the tools cannot
// disagree because there is only one state object in the request.

import { QUEST_FLAGS } from '../sim/rules';
import { NEARBY_LIMIT, nearestEntities } from '../sim/select';
import type { ContextPacket, GameState } from '../sim/types';
import { recentLines, type PaneJournal } from './journal';

const PUBLIC_FLAGS = new Set<string>(QUEST_FLAGS);

/**
 * Flat, small, regenerated every turn. Ids and tags carry the meaning; the model
 * reasons over tags, not names (ARCHITECTURE §3).
 *
 * `recentEvents` is the MERGE POINT for the two histories: the sim's log tail
 * interleaved with the Pane's journal tail, in wall order. This is the only place the
 * two actors' memories meet, and it is a read, so neither can corrupt the other.
 */
export function buildContextPacket(state: GameState, journal: PaneJournal): ContextPacket {
  return {
    player: {
      hp: state.player.hp,
      hpMax: state.player.hpMax,
      paneIntegrity: state.player.paneIntegrity,
      facing: state.player.facing,
      position: { x: state.player.tx, y: state.player.ty },
    },
    inventory: state.player.bag.map(i => ({
      id: i.id,
      name: i.name,
      tags: i.tags,
      qty: i.qty,
    })),
    nearby: nearestEntities(state, NEARBY_LIMIT).map(e => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      state: e.state,
      tags: e.tags,
      distance: e.d,
      ...(e.seed !== undefined ? { seed: e.seed } : {}),
    })),
    focus: state.ui.interactTargetId,
    recentEvents: interleave(state.log.slice(-5), recentLines(journal, 5)),
    flags: pickPublicFlags(state.flags),
    room: {
      id: state.player.roomId,
      kind: state.dungeon.rooms[state.player.roomId]?.kind ?? 'cave',
    },
  };
}

function interleave(simTail: readonly string[], journalTail: readonly string[]): string[] {
  return [...simTail, ...journalTail];
}

/** Only flags the model is allowed to know about. Everything else is engine bookkeeping. */
export function pickPublicFlags(flags: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (PUBLIC_FLAGS.has(key)) out[key] = value;
  }
  return out;
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
