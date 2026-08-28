// lib/sim/reducer.ts
//
// The only place state changes. Pure, synchronous, framework-free.
//
// SHAPE: every case is `check` then `commit`. There is no `if` in the commit phase —
// if you find yourself testing a precondition below the `check` call, the guard in
// rules.ts is incomplete and that is where the test belongs. This split is what makes
// `GameStore.applyVerdict` possible: it can ask `check` alone, without committing.
//
// IDEMPOTENCY: not all actions are naturally idempotent (`DAMAGE` twice is 2x damage),
// and we do not pretend otherwise. Idempotency is enforced one level up, at the
// verdict boundary, where every pane-origin action carries a `${turnId}:${seq}` key
// that is applied at most once. See lib/sim/store.ts. The rule of thumb: actions
// arriving from the keyboard are user intent and SHOULD apply twice if pressed twice;
// actions arriving from the Pane are a replay of a decision already made and must not.

import type { Action, ActionResult, GameState, SimEvent } from './types';

/**
 * Validate, then apply. Never throws. On rejection returns the *same state object*
 * (referentially identical, so a store `set` is a no-op) plus a reason the model can
 * read aloud.
 *
 * The reason strings are a feature: `already_open` becomes "You have already emptied
 * it. I am not going to pretend otherwise." — ARCHITECTURE §2.
 */
export function applyAction(state: GameState, action: Action): ActionResult {
  throw new Error('not implemented');
  // TODO
  //   const verdict = check(state, action);
  //   if (!verdict.ok) return { state, ok: false, reason: verdict.reason, events: [] };
  //   const next = structuredClone(state);
  //   const events = commit(next, action);       // mutates the clone, returns events
  //   appendLog(next, events);                   // human-readable tail, capped at LOG_CAP
  //   return { state: next, ok: true, events };
}

/**
 * Apply a sequence as one transaction. All-or-nothing: if any action's guard fails,
 * the whole batch is rejected and state is untouched.
 *
 * Caller: `apply_effect`, which takes 1-3 effects. Without this, the Pane could
 * half-apply "you take 2 damage and gain the ore" — narrating a trade where only the
 * cost landed. Atomicity here is the difference between a bug the judges see and one
 * they don't.
 */
export function applyBatch(state: GameState, actions: readonly Action[]): ActionResult {
  throw new Error('not implemented');
}

/** Newest last, capped. `ContextPacket.recentEvents` is the tail of this. */
export const LOG_CAP = 20;

/**
 * SimEvent -> one terse past-tense line ("opened the rusted lockbox", "took 2 damage
 * from the slime"). This is the sim's own voice, not the Pane's; the Pane reads these
 * lines as facts it must not contradict.
 */
export function describeEvent(state: GameState, event: SimEvent): string {
  throw new Error('not implemented');
}

/** Hand-authored opening state for H1/H2, before LDtk exists. Cut list item 5 lands here. */
export function initialState(): GameState {
  throw new Error('not implemented');
}
