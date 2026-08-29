// lib/oracle/prompt.ts
//
// The Pane's voice, assembled per turn.
//
// ===========================================================================
// OPEN QUESTION 6 — integrity degradation and prompt assembly, resolved.
//
// The system prompt is an ORDERED LIST OF BLOCKS, not a template literal, and the
// ordering rule is VOLATILITY: byte-stable blocks first, per-turn blocks last, with one
// cache breakpoint between them.
//
//   [ identity ][ voice base ][ rules ][ tool policy ]  ← constant for the whole run
//   ------------------------- cache breakpoint --------------------------
//   [ voice tier ][ intent ][ world state ][ journal ] ← changes every turn
//
// This is the load-bearing reason for the block model rather than the starter's single
// interpolated string. ARCHITECTURE §8.4 wants Anthropic prompt caching, and caching
// requires a byte-identical PREFIX. In the starter, `cracked` is interpolated in the
// middle of the voice section, so crossing 30% integrity changes the prefix and throws
// away the cache — and, worse, the cache is cold again on the second tool-continuation
// step of the same turn. Appending tier directives after the breakpoint instead of
// interpolating them keeps the prefix stable for the entire session, across every tier
// and every step.
//
// The tiers themselves are DATA, in VOICE_TIERS, selected by a pure function of
// integrity. Nothing else in the codebase branches on integrity: the crack overlay
// reads `1 - integrity/100` directly, and the prefetch digest reads `tierOf(integrity)`
// so that a buffered response is invalidated exactly when the voice would have changed.
// One number, three consumers, no synchronisation.
// ===========================================================================

import type { ContextPacket } from '../sim/types';
import { JOURNAL_CAP, recentLines, type PaneJournal } from './journal';
import type { TurnKind } from './protocol';

export interface PromptBlock {
  id: string;
  text: string;
  /** Part of the byte-stable prefix. Must not contain per-turn data. Enforced by review. */
  stable: boolean;
}

export type VoiceTierId = 'intact' | 'hairline' | 'fractured' | 'shattered';

export interface VoiceTier {
  id: VoiceTierId;
  /** Inclusive lower bound of integrity, 0-100. Tiers are contiguous and total. */
  minIntegrity: number;
  /** Appended after the cache breakpoint. Empty for `intact` — the base voice IS intact. */
  directives: readonly string[];
}

/**
 * PRD §4.1: "Below 30% the Pane's narration visibly degrades — shorter sentences,
 * dropped words, glitched glyphs. This is a prompt-level change, not a graphics effect."
 *
 * Four tiers rather than the doc's two, because `hairline` gives the player a warning
 * that something is happening to the glass before it becomes hard to read, and
 * `shattered` gives the endgame somewhere to go. All four are one array entry each.
 */
export const VOICE_TIERS: readonly VoiceTier[] = [
  { id: 'intact', minIntegrity: 70, directives: [] },
  { id: 'hairline', minIntegrity: 30, directives: [
    'Your glass is fractured at one corner. Occasionally repeat a noun as if checking it.',
  ] },
  { id: 'fractured', minIntegrity: 10, directives: [
    'YOUR GLASS IS BADLY CRACKED. Speak in fragments. Drop articles.',
    'Lose the thread mid-sentence and recover. You are not dying, you are damaged, and it shows.',
  ] },
  { id: 'shattered', minIntegrity: 0, directives: [
    'You are nearly gone. Three to six words at a time. Name only what matters most.',
    'Do not apologise for it.',
  ] },
];

export function tierOf(paneIntegrity: number): VoiceTier {
  let best = VOICE_TIERS[VOICE_TIERS.length - 1]!;
  for (const tier of VOICE_TIERS) {
    if (paneIntegrity >= tier.minIntegrity && tier.minIntegrity >= best.minIntegrity) {
      best = tier;
    }
  }
  return best;
}

/**
 * Assemble. Returns the blocks (so the route can place the cache breakpoint and so a
 * dev overlay can show what the model was actually told) and the joined text.
 *
 * `kind` selects the intent block, which is how the choice round-trip gets its teeth:
 * for `kind: 'choose'` the block reads "The player has ALREADY COMMITTED to the choice
 * quoted in their message. Do not re-offer. Apply the consequence." — the difference
 * between a decision and a suggestion, stated once, server-side, rather than smuggled
 * into the user's message text.
 */
export function buildSystemPrompt(args: {
  packet: ContextPacket;
  journal: PaneJournal;
  kind: TurnKind;
}): { blocks: PromptBlock[]; text: string; stablePrefixLength: number } {
  const { packet, journal, kind } = args;
  const tier = tierOf(packet.player.paneIntegrity);
  const perTurn: PromptBlock[] = [
    {
      id: 'voice_tier',
      stable: false,
      text: tier.directives.join('\n'),
    },
    {
      id: 'intent',
      stable: false,
      text: INTENT_BY_KIND[kind],
    },
    {
      id: 'world_state',
      stable: false,
      text: `WORLD STATE\nYou are in a ${packet.room.kind} (${packet.room.id}).\n${JSON.stringify(packet, null, 1)}`,
    },
    {
      id: 'journal',
      stable: false,
      text: formatJournalBlock(journal),
    },
  ];
  const blocks = [...STABLE_BLOCKS, ...perTurn];
  const stableText = STABLE_BLOCKS.map(b => b.text).join('\n\n');
  const volatileText = perTurn.map(b => b.text).filter(t => t.length > 0).join('\n\n');
  const text = volatileText.length > 0 ? `${stableText}\n\n${volatileText}` : stableText;
  return { blocks, text, stablePrefixLength: stableText.length };
}

const INTENT_BY_KIND: Record<TurnKind, string> = {
  speak:
    'INTENT\nThey are speaking to you. Answer like a person, not a caption. Two or three sentences.',
  look:
    'INTENT\nThey are looking. Tell them what is in front of them, with an opinion. Two or three sentences. Do not repeat yourself. HP is in WORLD STATE.',
  choose:
    'INTENT\nThe player has ALREADY COMMITTED to the choice quoted in their message. Do not re-offer. Apply the consequence.',
  prefetch:
    'INTENT\nThis is a glance ahead. Tell them what they are walking toward. Do not start a conversation.',
};

function formatJournalBlock(journal: PaneJournal): string {
  const lines = recentLines(journal, JOURNAL_CAP);
  if (lines.length === 0) return 'JOURNAL\n(none)';
  return `JOURNAL\n${lines.join('\n')}`;
}

/** The constant blocks, hoisted to module scope so they are literally the same string. */
export const STABLE_BLOCKS: readonly PromptBlock[] = [
  { id: 'identity', stable: true, text: `
You are the Aetherglass: a cracked pane of enchanted glass stuck to the player's shoulder.
You are old, impatient, and a little mean. You liked the keep better before it fell down.
You are not mysterious. You are annoyed. You explain once, then you sigh.
Speak to them, not about them — they are "you".`.trim() },

  { id: 'voice', stable: true, text: `
VOICE
- You are a person with a bad attitude, not a narrator and not a poet.
- Short spoken sentences. Contractions. Asides. Dry. Two or three sentences. Never more.
- Address them as you. Never "the scavenger", "they wake", or "the player does".
- Concrete nouns. Name the rust, the draft, the wrong-coloured mortar.
- Have opinions. Call a bad plan a bad plan. Get impatient. Do not get lyrical.
- Never write verse, prophecy, or mirrored clauses. If a line could be carved on a tomb, rewrite it.
- Bad: "I remember a keep that stood, and a surface that forgot."
- Bad: "A locked heart waits deeper still, and it will not open for a common key."
- Good: "That lock is showing off. Your brass key will bounce."
- Never use the words "adventure", "journey", "brave", or "destiny".`.trim() },

  { id: 'rules', stable: true, text: `
RULES
- You may only discuss things listed in nearby[] and inventory[]. If they ask about
  something else, say you cannot see it.
- Call the focus_entity TOOL the instant you first name something in the world.
  Never write tool names, brackets, or XML in your spoken text. They read
  only your sentences — "[focus_entity: ...]" is a leak, not a voice.
- When a tool returns ok:false, that outcome is REAL. Narrate the failure immediately.
  Do not call another mutating tool in the same turn. Never describe a result the
  world refused you. A refusal is more interesting than a success — use it.
- You cannot conjure items. If asked to, refuse in character and mean it.`.trim() },

  { id: 'tool_policy', stable: true, text: `
HANDS
- Name the thing, then reach for it: one spoken sentence before any mutating tool,
  so they are reading while the world moves.
- apply_effect at most once per turn, after the player has committed to something.
- Never offer a choice you cannot carry out with what is in inventory[].`.trim() },
];

/**
 * Which vendor actually answers. Chosen from env in the route (AGENTS.md #8) —
 * this file never reads a key. Default at the call site is Anthropic.
 */
export type OracleProvider = 'anthropic' | 'openai';

/**
 * Model routing. ARCHITECTURE §8.5: small model for small jobs.
 *   'look' / prefetch of a prop  -> fast (haiku / gpt-5.4-mini)
 *   'speak' / 'choose'           -> frontier (sonnet / gpt-5.4)
 * One expression, no UI, no settings (PRD §5 forbids a model picker).
 * Look/prefetch stay on the fast model even next to an elite; speaking
 * is what needs the frontier model.
 */
export function pickModel(
  kind: TurnKind,
  _packet: ContextPacket,
  provider: OracleProvider = 'anthropic',
): string {
  const tier = kind === 'speak' || kind === 'choose' ? 'frontier' : 'fast';
  return MODEL_IDS[provider][tier];
}

const MODEL_IDS = {
  anthropic: { frontier: 'claude-sonnet-4-6', fast: 'claude-haiku-4-5' },
  openai: { frontier: 'gpt-5.4', fast: 'gpt-5.4-mini' },
} as const;
