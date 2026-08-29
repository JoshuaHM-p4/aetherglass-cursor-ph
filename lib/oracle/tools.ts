// lib/oracle/tools.ts
//
// The Pane's hands. Every mutating tool is a PROPOSAL — it goes through `turn.propose`,
// which runs the real reducer against the fork and may refuse. Refusals come back as
// `{ ok: false, reason }` and the model narrates them in character.
//
// AI SDK 6: the schema field is `inputSchema` (renamed from v5's `parameters`).
//
// ===========================================================================
// WHAT CHANGED FROM THE STARTER, AND WHY
//
// 1. Signature is `buildTools(turn: TurnSim)`, not `(packet, dispatch, writer)`. Those
//    three arguments always travel together and always come from the same turn; binding
//    them into one object removes the possibility of a tool being handed a packet from
//    one turn and a dispatch from another. The writer is no longer a tool concern at all
//    for mutations — `propose` writes the verdict.
//
// 2. The `isNearby` / `inBag` pre-checks are DELETED from the mutating tools. They were a
//    second implementation of `not_nearby` and `not_in_bag` reading a projection of the
//    state instead of the state. rules.ts decides; tools ask. (They survive in
//    `offer_choices` and `suggest_craft`, which produce no Action and therefore have no
//    guard to defer to — those read the fork state directly, not the packet.)
//
// 3. Zod schemas remain the single source of truth for tool input shapes. Every type
//    below is `z.infer`red, never hand-written in parallel.
//
// 4. CAPABILITY BY TURN KIND (grafted from arena candidate-2). The toolset is derived
//    from `turn.kind`: 'speak' and 'choose' turns get the full set; 'look' and
//    'prefetch' turns get only the world/read-only tools (focus_entity, offer_choices,
//    suggest_craft, identify). A prefetched stream therefore cannot contain mutating
//    verdicts, which removes the entire "stale buffer commits a mutation" class
//    structurally — the demo never needed look-turns to mutate anyway: a look describes
//    and offers; the consequence lands on the 'choose' turn, which is never served from
//    a buffer (see lib/client/transport.ts). 'look' matches 'prefetch' so a digest miss
//    changes latency, never behavior.
//
// This leaves each tool doing three real jobs — shape the model's input, spend a budget,
// translate a domain result into a sentence the model can use — which is why these are
// not pass-through wrappers.
// ===========================================================================

import { tool } from 'ai';
import { z } from 'zod';
import { ITEM_IDS } from '../sim/registry';
import { findRecipesFor } from '../sim/recipes';
import { findItem } from '../sim/select';
import type { Action } from '../sim/types';
import { getHiddenTags, getLore } from './flavor';
import type { TurnSim } from './turn';

// ---------------------------------------------------------------- schemas

export const focusInput = z.object({
  entityId: z.string().describe('An id from nearby[]'),
  style: z.enum(['spotlight', 'pulse', 'shatter']).default('spotlight')
    .describe('spotlight: calm reveal. pulse: urgency. shatter: danger or breakage.'),
});

export const choiceInput = z.object({
  id: z.string(),
  label: z.string().max(70),
  risk: z.enum(['safe', 'costly', 'unknown']),
  usesItemId: z.string().optional().describe('Must be an id from inventory[]'),
});

export const offerChoicesInput = z.object({
  prompt: z.string().max(160).describe("The question, in the Pane's voice"),
  choices: z.array(choiceInput).min(2).max(4),
});

export const effectInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('damage'), amount: z.number().int().min(1).max(4), source: z.string() }),
  z.object({ kind: z.literal('heal'), amount: z.number().int().min(1).max(6) }),
  z.object({
    kind: z.literal('grant'),
    itemId: z.enum(ITEM_IDS).describe(
      'An id from this closed list. To empty a chest or crate, call open_container instead of inventing loot.',
    ),
    fromEntityId: z.string()
      .describe('The entity this came from. Its contents[] gate what is grantable.'),
  }),
  z.object({ kind: z.literal('consume'), itemId: z.string() }),
  z.object({ kind: z.literal('set_flag'), flag: z.string(), value: z.boolean() }),
]);

export const applyEffectInput = z.object({ effects: z.array(effectInput).min(1).max(3) });

export type FocusInput = z.infer<typeof focusInput>;
export type OfferChoicesInput = z.infer<typeof offerChoicesInput>;
export type EffectInput = z.infer<typeof effectInput>;

/** effect -> Action. The only mapping in the file, and it is total over the union. */
export function effectToAction(effect: EffectInput): Action {
  switch (effect.kind) {
    case 'damage':
      return { type: 'DAMAGE', amount: effect.amount, source: effect.source };
    case 'heal':
      return { type: 'HEAL', amount: effect.amount };
    case 'grant':
      return { type: 'GRANT_ITEM', itemId: effect.itemId, fromEntityId: effect.fromEntityId };
    case 'consume':
      return { type: 'CONSUME_ITEM', itemId: effect.itemId };
    case 'set_flag':
      return { type: 'SET_FLAG', flag: effect.flag, value: effect.value };
  }
}

// ---------------------------------------------------------------- toolset

/** 'speak' | 'choose' may mutate; 'look' | 'prefetch' may only observe and offer. */
export function canMutate(kind: TurnSim['kind']): boolean {
  return kind === 'speak' || kind === 'choose';
}

/**
 * Build the toolset for one turn. Descriptions state WHEN to call, not what the tool
 * does (ARCHITECTURE §9: "Model refuses to call tools / Description too vague").
 *
 * Returns the reduced set when `!canMutate(turn.kind)` — mutating tools are absent from
 * the object, not stubbed to refuse, so the model never sees hands it must not use.
 */
export function buildTools(turn: TurnSim) {
  let offerSeq = 0;

  const focus_entity = tool({
    description:
      "Draw the player's eye to one nearby thing. Call this the instant you first mention " +
      'something in the world — the light lands while your sentence is still being read. ' +
      'Only ids listed in nearby[] are valid. Use at most twice per reply.',
    inputSchema: focusInput,
    execute: async ({ entityId, style }) => {
      if (!turn.spend('focus')) return { ok: false, reason: 'not_nearby' };
      if (!turn.packet.nearby.some((e) => e.id === entityId)) {
        return { ok: false, reason: 'not_nearby' };
      }
      turn.writer.write({ type: 'data-focus', data: { entityId, style } });
      return { ok: true };
    },
  });

  const offer_choices = tool({
    description:
      'Present 2-4 courses of action as buttons. Call this whenever the player faces a real ' +
      'decision — a sealed container, a fight they would lose, a shrine that wants something. ' +
      'Choices must be grounded in what they are actually carrying. Never offer an option ' +
      'that requires an item absent from inventory[]. Do not offer choices for trivia.',
    inputSchema: offerChoicesInput,
    execute: async ({ prompt, choices }) => {
      const live = turn.state();
      const bad = choices.find((c) => c.usesItemId && !findItem(live, c.usesItemId));
      if (bad) return { ok: false, reason: 'not_in_bag', offendingChoice: bad.id };
      offerSeq += 1;
      const offerId = `${turn.turnId}:${offerSeq}`;
      turn.writer.write({
        type: 'data-choices',
        data: { turnId: turn.turnId, offerId, prompt, choices },
      });
      return { ok: true };
    },
  });

  const suggest_craft = tool({
    description:
      'Name one thing the player could make right now from what they carry. Read-only — you ' +
      'cannot craft on their behalf; they must do it at the bag. Only call this when asked, ' +
      'or when they are visibly stuck and holding the right materials.',
    inputSchema: z.object({
      materialIds: z.array(z.string()).describe('Ids from inventory[] to consider'),
    }),
    execute: async ({ materialIds }) => {
      const live = turn.state();
      const missing = materialIds.filter((id) => !findItem(live, id));
      if (missing.length > 0) return { ok: false, reason: 'not_in_bag', missing };
      return {
        ok: true,
        recipes: findRecipesFor(live, materialIds).map((r) => ({
          id: r.id,
          name: r.name,
          hint: r.hint,
          output: r.output,
        })),
      };
    },
  });

  const identify = tool({
    description:
      'Read an item properly — its history, its hidden properties. Prefer the pre-baked lore ' +
      'over inventing new facts; the world has a history and you did not write it.',
    inputSchema: z.object({ itemId: z.string() }),
    execute: async ({ itemId }) => {
      const item = findItem(turn.state(), itemId);
      if (!item) return { ok: false, reason: 'not_in_bag' };
      return {
        ok: true,
        name: item.name,
        tags: item.tags,
        lore: getLore(itemId),
        hiddenTags: getHiddenTags(itemId),
      };
    },
  });

  const readOnly = { focus_entity, offer_choices, suggest_craft, identify };
  if (!canMutate(turn.kind)) return readOnly;

  return {
    ...readOnly,
    open_container: tool({
      description:
        'Call this the moment they take, loot, rummage, or empty a chest, crate, or lockbox they are adjacent to. ' +
        'It yields whatever is actually inside. Only for kind="container". If it fails, say so plainly.',
      inputSchema: z.object({ entityId: z.string() }),
      execute: async ({ entityId }) => turn.propose({ type: 'OPEN_CONTAINER', entityId }),
    }),
    unlock: tool({
      description:
        "Use a carried item to defeat a lock, seal, or bar. The sim decides whether the item's " +
        'tags suit the obstacle — a crowbar pries, a key turns, fire burns. Propose the attempt ' +
        'you think is best and narrate the outcome honestly, including failure.',
      inputSchema: z.object({
        entityId: z.string(),
        withItemId: z.string().describe('An id from inventory[]'),
      }),
      execute: async ({ entityId, withItemId }) =>
        turn.propose({ type: 'UNLOCK', entityId, withItemId }),
    }),
    apply_effect: tool({
      description:
        'Apply the consequences of what just happened: damage, healing, an item gained or spent, ' +
        'a story flag. Call this once per turn at most, after the player has committed to ' +
        'something. Do not use it to hand out rewards for conversation alone.',
      inputSchema: applyEffectInput,
      execute: async ({ effects }) => {
        if (!turn.spend('effect')) return { ok: false, reason: 'already_open' };
        const actions = effects.map(effectToAction);
        for (const action of actions) {
          if (action.type === 'GRANT_ITEM' && !turn.spend('grant')) {
            return { ok: false, reason: 'not_in_contents' };
          }
        }
        return turn.proposeAll(actions);
      },
    }),
  };
}

export type PaneTools = ReturnType<typeof buildTools>;
