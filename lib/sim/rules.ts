// lib/sim/rules.ts
//
// Law. Every precondition in Aetherglass is here, exactly once.
//
// ===========================================================================
// OPEN QUESTION 5 — the rules layer shape, resolved:
//
// There is ONE guard per Action type, held in a total, exhaustive table keyed by
// `Action['type']`. `check(state, action)` is the only export the rest of the codebase
// calls. The reducer's entire validation phase is one `check()` call. The tool layer
// does not validate at all.
//
// This is how the reducer and the tool layer "share" the rules without duplication:
// they don't share them, they share the *reducer*. The tool layer's `execute` calls
// `applyAction`, which calls `check`. There is no second path into the world, so
// there is nothing to keep in sync.
//
// The starter tools.ts opens with `isNearby` / `inBag` helpers closed over the packet
// and pre-checks them in every mutating tool. Those go away. They are a duplicate
// implementation of `not_nearby` and `not_in_bag` that reads a *projection* of the
// state (the packet) rather than the state, so they can and eventually will disagree
// with the guard that actually decides. Validate once, at the one boundary that
// commits. (The two surviving packet-shaped checks in tools.ts are for `offer_choices`
// and `suggest_craft`, neither of which produces an Action — see lib/oracle/tools.ts.)
//
// Types encode what they can: `Guards` is a mapped type over the Action union, so a
// new Action variant is a compile error until it has a guard. That is the invariant
// "no unguarded mutation" expressed as a type rather than a code review.
// ===========================================================================

import type { Action, GameState, ItemTag, RejectReason } from './types';

/** The result of asking permission. Never throws; failure is a value. */
export type CheckResult =
  | { ok: true }
  | { ok: false; reason: RejectReason };

export const PASS: CheckResult = { ok: true };
export function fail(reason: RejectReason): CheckResult {
  throw new Error('not implemented');
}

type Guard<A extends Action> = (state: GameState, action: A) => CheckResult;

/**
 * Total over the Action union. Adding an Action without adding a guard fails to
 * compile — which is the point.
 */
type Guards = { [K in Action['type']]: Guard<Extract<Action, { type: K }>> };

export const guards: Guards = {
  /** Bounds and collision are Phaser's job; the sim only rejects impossible tiles. */
  MOVE: () => { throw new Error('not implemented'); },

  /** Clamped by DAMAGE_CAP_PER_TURN upstream in the schema; `already_dead` here. */
  DAMAGE: () => { throw new Error('not implemented'); },
  HEAL: () => { throw new Error('not implemented'); },

  /**
   * CLOSED-WORLD GRANT (AGENTS.md #3). Three conjunctive conditions:
   *   1. `itemId` exists in ITEM_REGISTRY
   *   2. `fromEntityId` resolves, and the item id appears in that entity's
   *      `contents` (or its rewardPool, once shrines exist)
   *   3. the bag has room
   * Reasons: no_such_item / not_in_contents / bag_full. A grant with no
   * `fromEntityId` is rejected outright — there is no such thing as an item from
   * nowhere, and that rejection is the demo's third beat.
   */
  GRANT_ITEM: () => { throw new Error('not implemented'); },

  CONSUME_ITEM: () => { throw new Error('not implemented'); },

  /** not_nearby / wrong_kind / already_open / locked, in that order. */
  OPEN_CONTAINER: () => { throw new Error('not implemented'); },

  /**
   * The tag-matching rule — the highest-leverage guard in the game. Delegates to
   * `defeatsSeal` so that adding an item with `pry` gives every `sealed` object in
   * the world a new solution with no new branch here. ARCHITECTURE §3.
   */
  UNLOCK: () => { throw new Error('not implemented'); },

  CRAFT: () => { throw new Error('not implemented'); },

  /** set_flag is restricted to a fixed enum: QUEST_FLAGS. Otherwise `unknown_flag`. */
  SET_FLAG: () => { throw new Error('not implemented'); },

  SET_ENTITY_STATE: () => { throw new Error('not implemented'); },
  DAMAGE_PANE: () => { throw new Error('not implemented'); },

  /** Keyboard-only in practice, but guarded identically: adjacency, kind, not already dead. */
  STRIKE_ENTITY: () => { throw new Error('not implemented'); },
};

/**
 * The single public entry point. Callers: `applyAction` (before committing) and
 * `GameStore.applyVerdict` (to re-validate a pane proposal against state that may
 * have moved since the packet was built). Both call sites want the same answer.
 */
export function check(state: GameState, action: Action): CheckResult {
  throw new Error('not implemented');
}

// ---------------------------------------------------------------- shared predicates
// Internal to this file's guards, exported only where a non-Action caller genuinely
// needs the same judgement (tools.ts `offer_choices`, the LDtk loader's validation).

/**
 * Does this item's tag set defeat this obstacle's tag set? The whole of the
 * puzzle design lives in this table:
 *
 *   sealed  <- pry, sharp(heavy), burning
 *   locked  <- key (matching), pry(fragile only)
 *   barred  <- heavy, blunt
 *   runed   <- arcane
 *   frozen  <- burning
 *
 * Returns the reason on failure so UNLOCK can say `wrong_tool` vs `locked`.
 */
export function defeatsSeal(itemTags: ItemTag[], obstacleTags: string[]): CheckResult {
  throw new Error('not implemented');
}

/** Quest flags the Pane may set. ARCHITECTURE §4: "set_flag is restricted to a fixed enum". */
export const QUEST_FLAGS = [
  'troll_pacified',
  'troll_paid',
  'shrine_used',
  'lockbox_looted',
  'knows_the_seam',
] as const;
export type QuestFlag = (typeof QUEST_FLAGS)[number];

export function isQuestFlag(flag: string): flag is QuestFlag {
  throw new Error('not implemented');
}

/** Per-turn ceilings. ARCHITECTURE §4: "a single unlucky roll can't end the demo". */
export const LIMITS = {
  damagePerEffect: 4,
  healPerEffect: 6,
  effectsPerTurn: 3,
  grantsPerTurn: 1,
  focusCallsPerTurn: 2,
} as const;
