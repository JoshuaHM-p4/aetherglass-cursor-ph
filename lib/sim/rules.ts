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

import { recipe } from './recipes';
import { isKnownItem } from './registry';
import { bagHasRoomFor, findItem, heldQty, isAdjacent } from './select';
import type { Action, GameState, ItemTag, RejectReason } from './types';

/** The result of asking permission. Never throws; failure is a value. */
export type CheckResult =
  | { ok: true }
  | { ok: false; reason: RejectReason };

export const PASS: CheckResult = { ok: true };
export function fail(reason: RejectReason): CheckResult {
  return { ok: false, reason };
}

type Guard<A extends Action> = (state: GameState, action: A) => CheckResult;

/**
 * Total over the Action union. Adding an Action without adding a guard fails to
 * compile — which is the point.
 */
type Guards = { [K in Action['type']]: Guard<Extract<Action, { type: K }>> };

/** Internal resolution of the hardcoded H1/H2 map. Collision is Phaser's job. */
const MAP_TX = 30;
const MAP_TY = 17;

export const guards: Guards = {
  /** Bounds and collision are Phaser's job; the sim only rejects impossible tiles. */
  MOVE: (_state, action) => {
    if (action.tx < 0 || action.tx >= MAP_TX || action.ty < 0 || action.ty >= MAP_TY) {
      return fail('not_nearby');
    }
    return PASS;
  },

  /** Clamped by DAMAGE_CAP_PER_TURN upstream in the schema; `already_dead` here. */
  DAMAGE: (state) => (state.player.hp <= 0 ? fail('already_dead') : PASS),
  HEAL: () => PASS,

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
  GRANT_ITEM: (state, action) => {
    if (!isKnownItem(action.itemId)) return fail('no_such_item');
    if (!action.fromEntityId) return fail('no_such_entity');
    const source = state.entities[action.fromEntityId];
    if (!source) return fail('no_such_entity');
    if (!source.contents?.includes(action.itemId)) return fail('not_in_contents');
    if (!bagHasRoomFor(state, action.itemId)) return fail('bag_full');
    return PASS;
  },

  CONSUME_ITEM: (state, action) => {
    const need = action.qty ?? 1;
    if (heldQty(state, action.itemId) < need) return fail('not_in_bag');
    return PASS;
  },

  /** not_nearby / wrong_kind / already_open / locked, in that order. */
  OPEN_CONTAINER: (state, action) => {
    const entity = state.entities[action.entityId];
    if (!entity) return fail('no_such_entity');
    if (!isAdjacent(state, action.entityId)) return fail('not_nearby');
    if (entity.kind !== 'container') return fail('wrong_kind');
    if (entity.state === 'open') return fail('already_open');
    if (entity.locked) return fail('locked');
    for (const id of entity.contents ?? []) {
      if (!isKnownItem(id)) return fail('no_such_item');
      if (!bagHasRoomFor(state, id)) return fail('bag_full');
    }
    return PASS;
  },

  /**
   * The tag-matching rule — the highest-leverage guard in the game. Delegates to
   * `defeatsSeal` so that adding an item with `pry` gives every `sealed` object in
   * the world a new solution with no new branch here. ARCHITECTURE §3.
   */
  UNLOCK: (state, action) => {
    const entity = state.entities[action.entityId];
    if (!entity) return fail('no_such_entity');
    if (!isAdjacent(state, action.entityId)) return fail('not_nearby');
    if (entity.kind !== 'container' && entity.kind !== 'door') return fail('wrong_kind');
    if (!entity.locked) return fail('already_open');
    const item = findItem(state, action.withItemId);
    if (!item) return fail('not_in_bag');
    const obstacle = entity.tags.some((t) => SEAL_TAGS.has(t)) ? entity.tags : ['locked'];
    return defeatsSeal(item.tags, obstacle);
  },

  CRAFT: (state, action) => {
    const rec = recipe(action.recipeId);
    if (!rec) return fail('no_such_item');
    for (const [id, qty] of Object.entries(rec.inputs)) {
      if (heldQty(state, id) < qty) return fail('missing_ingredients');
    }
    if (!bagHasRoomFor(state, rec.output)) return fail('bag_full');
    return PASS;
  },

  /** set_flag is restricted to a fixed enum: QUEST_FLAGS. Otherwise `unknown_flag`. */
  SET_FLAG: (_state, action) => (isQuestFlag(action.flag) ? PASS : fail('unknown_flag')),

  SET_ENTITY_STATE: (state, action) => {
    const entity = state.entities[action.entityId];
    if (!entity) return fail('no_such_entity');
    if (entity.state === 'dead') return fail('already_dead');
    return PASS;
  },
  DAMAGE_PANE: () => PASS,

  /** Keyboard-only in practice, but guarded identically: adjacency, kind, not already dead. */
  STRIKE_ENTITY: (state, action) => {
    const entity = state.entities[action.entityId];
    if (!entity) return fail('no_such_entity');
    if (!isAdjacent(state, action.entityId)) return fail('not_nearby');
    if (entity.kind !== 'enemy' && entity.kind !== 'elite') return fail('wrong_kind');
    if (entity.state === 'dead') return fail('already_dead');
    return PASS;
  },
};

/**
 * The single public entry point. Callers: `applyAction` (before committing) and
 * `GameStore.applyVerdict` (to re-validate a pane proposal against state that may
 * have moved since the packet was built). Both call sites want the same answer.
 */
export function check(state: GameState, action: Action): CheckResult {
  return (guards[action.type] as Guard<Action>)(state, action);
}

// ---------------------------------------------------------------- shared predicates
// Internal to this file's guards, exported only where a non-Action caller genuinely
// needs the same judgement (tools.ts `offer_choices`, the LDtk loader's validation).

const SEAL_TAGS = new Set(['sealed', 'locked', 'barred', 'runed', 'frozen']);

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
  const held = new Set(itemTags);
  const has = (tag: ItemTag) => held.has(tag);
  const present = [...SEAL_TAGS].filter((seal) => obstacleTags.includes(seal));
  if (present.length === 0) return PASS;
  for (const seal of present) {
    const ok =
      seal === 'sealed'
        ? has('pry') || has('burning') || (has('sharp') && has('heavy'))
        : seal === 'locked'
          ? has('key') || (has('pry') && obstacleTags.includes('fragile'))
          : seal === 'barred'
            ? has('heavy') || has('blunt')
            : seal === 'runed'
              ? has('arcane')
              : has('burning');
    if (!ok) return fail('wrong_tool');
  }
  return PASS;
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
  return (QUEST_FLAGS as readonly string[]).includes(flag);
}

/** Per-turn ceilings. ARCHITECTURE §4: "a single unlucky roll can't end the demo". */
export const LIMITS = {
  damagePerEffect: 4,
  healPerEffect: 6,
  effectsPerTurn: 3,
  grantsPerTurn: 1,
  focusCallsPerTurn: 2,
} as const;
