// lib/oracle/tools.ts
//
// The Pane's hands. Every mutating tool is a PROPOSAL — it dispatches into the sim,
// which validates and may refuse. Refusals come back as { ok: false, reason } and the
// model narrates them in character. Do not add a tool that writes state directly.
//
// AI SDK 6: the schema field is `inputSchema` (renamed from v5's `parameters`).

import { tool } from 'ai';
import { z } from 'zod';
import type { ContextPacket, Action, RejectReason } from '@/lib/sim/types';

type Dispatch = (a: Action) => { ok: boolean; reason?: RejectReason };
type Writer = { write: (p: { type: string; data: unknown }) => void };

/**
 * Build the toolset for one turn. The packet and dispatch are closed over, so tools
 * are always validated against the state that produced this exact request.
 *
 * `dispatch` runs on the client via the store; on the server, pass a shim that returns
 * the proposal for the client to apply (see ARCHITECTURE §4 on where you draw that line —
 * for a hackathon, applying client-side and echoing the result back is fine and faster).
 */
export function buildTools(packet: ContextPacket, dispatch: Dispatch, writer: Writer) {
  const isNearby = (id: string) => packet.nearby.some(e => e.id === id);
  const inBag = (id: string) => packet.inventory.some(i => i.id === id);
  const entity = (id: string) => packet.nearby.find(e => e.id === id);

  return {
    // ---------------------------------------------------------------- world

    focus_entity: tool({
      description:
        'Draw the player\'s eye to one nearby thing. Call this the instant you first mention ' +
        'something in the world — the light lands while your sentence is still being read. ' +
        'Only ids listed in nearby[] are valid. Use at most twice per reply.',
      inputSchema: z.object({
        entityId: z.string().describe('An id from nearby[]'),
        style: z.enum(['spotlight', 'pulse', 'shatter']).default('spotlight')
          .describe('spotlight: calm reveal. pulse: urgency. shatter: danger or breakage.'),
      }),
      execute: async ({ entityId, style }) => {
        if (!isNearby(entityId)) return { ok: false, reason: 'not_nearby' };
        writer.write({ type: 'data-focus', data: { entityId, style } });
        return { ok: true };
      },
    }),

    offer_choices: tool({
      description:
        'Present 2-4 courses of action as buttons. Call this whenever the player faces a real ' +
        'decision — a sealed container, a fight they would lose, a shrine that wants something. ' +
        'Choices must be grounded in what they are actually carrying. Never offer an option ' +
        'that requires an item absent from inventory[]. Do not offer choices for trivia.',
      inputSchema: z.object({
        prompt: z.string().max(160).describe('The question, in the Pane\'s voice'),
        choices: z.array(z.object({
          id: z.string(),
          label: z.string().max(70),
          risk: z.enum(['safe', 'costly', 'unknown']),
          usesItemId: z.string().optional().describe('Must be an id from inventory[]'),
        })).min(2).max(4),
      }),
      execute: async ({ prompt, choices }) => {
        const bad = choices.find(c => c.usesItemId && !inBag(c.usesItemId));
        if (bad) return { ok: false, reason: 'not_in_bag', offendingChoice: bad.id };
        writer.write({ type: 'data-choices', data: { prompt, choices } });
        return { ok: true };
      },
    }),

    // ---------------------------------------------------------------- mutations

    open_container: tool({
      description:
        'Open a chest, lockbox, or barrel the player is adjacent to. Only for kind="container". ' +
        'This may fail — if it does, say so plainly rather than pretending otherwise.',
      inputSchema: z.object({ entityId: z.string() }),
      execute: async ({ entityId }) => {
        if (!isNearby(entityId)) return { ok: false, reason: 'not_nearby' };
        if (entity(entityId)?.kind !== 'container') return { ok: false, reason: 'no_such_entity' };
        return dispatch({ type: 'OPEN_CONTAINER', entityId });
      },
    }),

    unlock: tool({
      description:
        'Use a carried item to defeat a lock, seal, or bar. The sim decides whether the item\'s ' +
        'tags suit the obstacle — a crowbar pries, a key turns, fire burns. Propose the attempt ' +
        'you think is best and narrate the outcome honestly, including failure.',
      inputSchema: z.object({
        entityId: z.string(),
        withItemId: z.string().describe('An id from inventory[]'),
      }),
      execute: async ({ entityId, withItemId }) => {
        if (!isNearby(entityId)) return { ok: false, reason: 'not_nearby' };
        if (!inBag(withItemId)) return { ok: false, reason: 'not_in_bag' };
        return dispatch({ type: 'UNLOCK', entityId, withItemId });
      },
    }),

    apply_effect: tool({
      description:
        'Apply the consequences of what just happened: damage, healing, an item gained or spent, ' +
        'a story flag. Call this once per turn at most, after the player has committed to ' +
        'something. Do not use it to hand out rewards for conversation alone.',
      inputSchema: z.object({
        effects: z.array(z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('damage'), amount: z.number().int().min(1).max(4),
                     source: z.string() }),
          z.object({ kind: z.literal('heal'), amount: z.number().int().min(1).max(6) }),
          z.object({ kind: z.literal('grant'), itemId: z.string(),
                     fromEntityId: z.string()
                       .describe('The entity this came from. Its contents[] gate what is grantable.') }),
          z.object({ kind: z.literal('consume'), itemId: z.string() }),
          z.object({ kind: z.literal('set_flag'), flag: z.string(), value: z.boolean() }),
        ])).min(1).max(3),
      }),
      execute: async ({ effects }) => {
        const results = effects.map(e => {
          switch (e.kind) {
            case 'damage':
              return dispatch({ type: 'DAMAGE', amount: e.amount, source: e.source });
            case 'heal':
              return dispatch({ type: 'HEAL', amount: e.amount });
            case 'grant':
              // rules.ts enforces: itemId must be in the source entity's contents[]
              return dispatch({ type: 'GRANT_ITEM', itemId: e.itemId,
                                fromEntityId: e.fromEntityId });
            case 'consume':
              return dispatch({ type: 'CONSUME_ITEM', itemId: e.itemId });
            case 'set_flag':
              return dispatch({ type: 'SET_FLAG', flag: e.flag, value: e.value });
          }
        });
        return { ok: results.every(r => r.ok), results };
      },
    }),

    // ---------------------------------------------------------------- read-only

    suggest_craft: tool({
      description:
        'Name one thing the player could make right now from what they carry. Read-only — you ' +
        'cannot craft on their behalf; they must do it at the bag. Only call this when asked, ' +
        'or when they are visibly stuck and holding the right materials.',
      inputSchema: z.object({
        materialIds: z.array(z.string()).describe('Ids from inventory[] to consider'),
      }),
      execute: async ({ materialIds }) => {
        const missing = materialIds.filter(id => !inBag(id));
        if (missing.length) return { ok: false, reason: 'not_in_bag', missing };
        return { ok: true, recipes: findRecipesFor(materialIds) };  // lib/sim/recipes.ts
      },
    }),

    identify: tool({
      description:
        'Read an item properly — its history, its hidden properties. Prefer the pre-baked lore ' +
        'over inventing new facts; the world has a history and you did not write it.',
      inputSchema: z.object({ itemId: z.string() }),
      execute: async ({ itemId }) => {
        if (!inBag(itemId)) return { ok: false, reason: 'not_in_bag' };
        return { ok: true, lore: getLore(itemId), hiddenTags: getHiddenTags(itemId) };
      },
    }),
  };
}

// ------------------------------------------------------------------ prompt

export function buildSystemPrompt(packet: ContextPacket): string {
  const cracked = packet.player.paneIntegrity < 30;

  return `
You are the Aetherglass: a cracked pane of enchanted glass that floats at a scavenger's
shoulder in a collapsed keep. You see what they see. You are old, precise, and faintly
condescending — you have watched better people than this one die in these corridors.

VOICE
- Two or three sentences. Never more. You are a companion, not a narrator.
- Concrete nouns over atmosphere. Name the rust, the draft, the wrong-coloured mortar.
- You have opinions. Say when a plan is stupid.
- Never use the words "adventure", "journey", "brave", or "destiny".
${cracked ? `
- YOUR GLASS IS BADLY CRACKED. Speak in fragments. Drop articles. Lose the thread mid-
  sentence and recover. You are not dying, you are damaged, and it shows.` : ''}

RULES
- You may only discuss things listed in nearby[] and inventory[]. If they ask about something
  else, say you cannot see it.
- Call focus_entity the instant you first name something in the world.
- When a tool returns ok:false, that outcome is REAL. Narrate the failure. Never describe a
  result the world refused you. A refusal is more interesting than a success — use it.
- You cannot conjure items. If asked to, refuse in character and mean it.

WORLD STATE
${JSON.stringify(packet, null, 1)}
`.trim();
}
