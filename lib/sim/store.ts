// lib/sim/store.ts
//
// The one authoritative copy of the world, and the commit point for both writers.
//
// NOTE ON IMPORTS: this uses `zustand/vanilla`, not `zustand`. AGENTS.md forbids
// lib/sim/** from importing react, and Phaser must be able to read this store without
// dragging React into the scene graph. The React binding is a four-line file outside
// lib/sim (components/useGame.ts).
//
// ===========================================================================
// TWO WRITERS, ONE WORLD (the "shared state" discipline point)
//
// The keyboard writes through `dispatch(action, 'keyboard')`. The Pane writes through
// `applyVerdict(v)`, which re-checks and then dispatches with origin 'pane'. We cannot
// split GameState per actor — there is exactly one dungeon — so the split we do make
// is between *truth* and *the Pane's opinion of truth*:
//
//   sim truth        -> this store (GameState + rev)
//   Pane-side state  -> PaneJournal, pending choices, prefetch buffer. Lives in
//                       lib/oracle/journal.ts and lib/client/*, never in GameState.
//                       Merged into the model's view only at the read boundary, by
//                       buildContextPacket(state, journal).
//
// That is why `GameState.ui` holds `paneOpen` but not `pendingChoices`: whether the
// glass is lit is a fact about the world that Phaser dims for; which buttons are on
// screen is a fact about one chat turn.
// ===========================================================================

import { createStore } from 'zustand/vanilla';
import { bus } from '../../game/EventBus';
import { applyAction, initialState } from './reducer';
import { check } from './rules';
import type {
  Action, ActionOrigin, GameState, RejectReason, SimEvent,
} from './types';

/**
 * Monotonic. Increments only when state actually changed — a rejected action does not
 * bump it. Used for: Phaser's dirty check, and as the identity half of the prefetch
 * digest (lib/client/prefetch.ts).
 */
export type Rev = number;

export interface DispatchResult {
  ok: boolean;
  reason?: RejectReason;
  events: SimEvent[];
  rev: Rev;
}

/**
 * What `applyVerdict` needs. Structurally a subset of the wire `Verdict`, redeclared here
 * rather than imported, because lib/sim must not depend on lib/oracle — the sim is the
 * bottom of the stack and knows nothing about the Pane. `useOracleTurn` maps
 * `Verdict -> AdjudicatedProposal` in one line at the boundary, which is also where the
 * `${turnId}:${seq}` key is formed.
 */
export interface AdjudicatedProposal {
  /** Idempotency key. `verdictKey(v)`. Applied at most once per store lifetime. */
  key: string;
  action: Action;
  ok: boolean;
  reason?: RejectReason;
}

/** What happened to a proposal the server accepted, once the real world got a look. */
export type VerdictOutcome =
  /** Applied. The common case. */
  | { status: 'applied'; events: SimEvent[] }
  /** Already applied this exact `${turnId}:${seq}`. Silently fine. */
  | { status: 'duplicate' }
  /** The server's fork rejected it too — nothing to apply, the model already knows. */
  | { status: 'refused'; reason: RejectReason }
  /**
   * The server's fork accepted it but the live world has moved on (the player opened
   * the chest by hand while the Pane was mid-sentence). NOT applied. A line goes into
   * the journal so the Pane learns about it next turn and can correct itself in
   * character — which reads as the Pane being fallible, not as a bug.
   */
  | { status: 'diverged'; reason: RejectReason };

export interface GameStore {
  state: GameState;
  rev: Rev;

  /**
   * The keyboard's door in. Validates via the reducer, replaces state, then fans every
   * SimEvent onto the EventBus as `sim:event` so Phaser can spark and shake.
   */
  dispatch(action: Action, origin: ActionOrigin): DispatchResult;

  /**
   * The Pane's door in. Idempotent per verdict key. Re-runs `check` against live state
   * before committing — the server's fork was a dry run against a snapshot that is by
   * now up to a few hundred milliseconds old.
   */
  applyVerdict(proposal: AdjudicatedProposal): VerdictOutcome;

  /** Boot / LDtk load. Resets rev to 0 and the applied-verdict set. */
  hydrate(state: GameState): void;

  /** Enter on an adjacent entity. Not an Action: the target is UI fact, not world fact. */
  setInteractTarget(entityId: string | null): void;
}

export const gameStore = createStore<GameStore>((set, get) => {
  const appliedKeys = new Set<string>();
  return {
    state: initialState(),
    rev: 0,
    dispatch(action, _origin) {
      const { state, rev } = get();
      const result = applyAction(state, action);
      if (!result.ok) {
        return { ok: false, reason: result.reason, events: result.events, rev };
      }
      const nextRev = rev + 1;
      set({ state: result.state, rev: nextRev });
      for (const event of result.events) bus.emit('sim:event', event);
      return { ok: true, events: result.events, rev: nextRev };
    },
    applyVerdict(proposal) {
      if (appliedKeys.has(proposal.key)) return { status: 'duplicate' as const };
      appliedKeys.add(proposal.key);
      if (!proposal.ok) {
        return { status: 'refused' as const, reason: proposal.reason ?? 'no_such_entity' };
      }
      const live = check(get().state, proposal.action);
      if (!live.ok) {
        bus.emit('sim:desync', {
          entityId: entityIdOf(proposal.action),
          action: proposal.action.type,
          reason: live.reason,
        });
        return { status: 'diverged' as const, reason: live.reason };
      }
      const result = get().dispatch(proposal.action, 'pane');
      return { status: 'applied' as const, events: result.events };
    },
    hydrate(state) {
      appliedKeys.clear();
      set({ state, rev: 0 });
      bus.emit('sim:hydrated', { entityCount: Object.keys(state.entities).length });
    },
    setInteractTarget(entityId) {
      const next = structuredClone(get().state);
      next.ui.interactTargetId = entityId;
      set({ state: next, rev: get().rev + 1 });
    },
  };
});

/**
 * Convenience for the 90% of readers that want the world and not the plumbing.
 * `gameStore.getState().state` reads badly at every call site.
 */
export function world(): GameState {
  return gameStore.getState().state;
}

function entityIdOf(action: Action): string | null {
  if ('entityId' in action) return action.entityId;
  if ('fromEntityId' in action) return action.fromEntityId ?? null;
  return null;
}
