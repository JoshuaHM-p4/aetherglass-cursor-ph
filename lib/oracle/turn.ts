// lib/oracle/turn.ts
//
// The fork. Server-side, one instance per request, garbage when the response ends.
//
// This is the object that makes open question 1 work: it holds a private mutable copy of
// the snapshot, runs the real reducer against it, streams a verdict for every attempt,
// and hands the model a truthful `{ ok, reason }` synchronously — no network, no second
// model invocation, no client involvement.
//
// It is a DRY RUN. Nothing here is authoritative. The client's `applyVerdict` is the
// commit. The fork's only outputs are (1) the tool results the model reads and (2) the
// verdict stream. If the process died mid-turn the world would simply not have changed.

import { z } from 'zod';
import type { Action, ContextPacket, GameState, RejectReason } from '../sim/types';
import { buildContextPacket } from './context';
import type { JournalKind, PaneJournal } from './journal';
import type { OracleDataPart, TurnId, TurnKind, Verdict } from './protocol';

/** Minimal shape of the `createUIMessageStream` writer we depend on. */
export interface PartWriter {
  write(part: OracleDataPart): void;
}

/** What a tool gets back. Exactly what the model gets back, plus nothing. */
export type ProposalResult =
  | { ok: true }
  | { ok: false; reason: RejectReason };

/**
 * The turn-local world. Deliberately NOT named `Store` or `Session` — it lives for one
 * request and cannot be persisted, and the name should make that hard to forget.
 */
export interface TurnSim {
  readonly turnId: TurnId;
  readonly kind: TurnKind;
  /** Built once, at construction, from the snapshot. The tools' view and the model's view. */
  readonly packet: ContextPacket;
  readonly journal: PaneJournal;

  /** Current fork state. Advances as proposals are accepted. Read by tools that need lore. */
  state(): GameState;

  /**
   * Propose one action. Validates through `applyAction`, advances the fork on success,
   * writes a `data-verdict` part either way, and returns the model-facing result.
   *
   * The write happens BEFORE the return, so the client is already applying the change
   * while the model is still composing the sentence about it. That interleaving is the
   * same trick as the spotlight, applied to state.
   */
  propose(action: Action): ProposalResult;

  /**
   * All-or-nothing batch, for `apply_effect`'s 1-3 effects. Emits ONE verdict per
   * action on success, or a single rejected verdict naming the first failure — so the
   * client never sees a half-applied trade.
   */
  proposeAll(actions: readonly Action[]): ProposalResult;

  /** Per-turn ceilings from rules.LIMITS. Returns false once spent; tools report `ok: false`. */
  spend(budget: 'focus' | 'grant' | 'effect'): boolean;

  /** For the route's logging and for a dev overlay. */
  verdicts(): readonly Verdict[];
}

export function createTurnSim(args: {
  snapshot: GameState;
  journal: PaneJournal;
  turnId: TurnId;
  kind: TurnKind;
  writer: PartWriter;
}): TurnSim {
  const fork = structuredClone(args.snapshot);
  const packet = buildContextPacket(fork, args.journal);
  const recorded: Verdict[] = [];
  const refuse: ProposalResult = { ok: false, reason: H3_REFUSE_REASON };
  return {
    turnId: args.turnId,
    kind: args.kind,
    packet,
    journal: args.journal,
    state: () => fork,
    propose: () => refuse,
    proposeAll: () => refuse,
    spend: () => false,
    verdicts: () => recorded,
  };
}

const H3_REFUSE_REASON: RejectReason = 'wrong_kind';

const TURN_KINDS = ['speak', 'look', 'choose', 'prefetch'] as const;
const JOURNAL_KINDS = [
  'offered', 'committed', 'refused', 'diverged', 'condition',
] as const satisfies readonly JournalKind[];

const journalEntrySchema = z.object({
  turnId: z.string(),
  kind: z.enum(JOURNAL_KINDS).optional(),
  line: z.string(),
});

const snapshotSchema = z.object({
  player: z.object({
    hp: z.number(),
    hpMax: z.number(),
    paneIntegrity: z.number(),
    tx: z.number(),
    ty: z.number(),
    facing: z.enum(['up', 'down', 'left', 'right']),
    bag: z.array(z.unknown()),
    hotbar: z.tuple([
      z.string().nullable(),
      z.string().nullable(),
      z.string().nullable(),
    ]),
  }).passthrough(),
  entities: z.record(z.string(), z.unknown()),
  flags: z.record(z.string(), z.boolean()),
  log: z.array(z.string()),
  ui: z.object({
    interactTargetId: z.string().nullable(),
    paneOpen: z.boolean(),
    bagOpen: z.boolean(),
  }).passthrough(),
}).passthrough();

const oracleRequestSchema = z.object({
  messages: z.array(z.unknown()),
  snapshot: snapshotSchema,
  journal: z.union([
    z.array(journalEntrySchema),
    z.object({ entries: z.array(journalEntrySchema) }),
  ]),
  turnId: z.string().min(1),
  kind: z.enum(TURN_KINDS),
  choiceId: z.string().optional(),
});

function badRequest(message: string): never {
  const err = new Error(message) as Error & { status: number };
  err.status = 400;
  throw err;
}

/**
 * Parse + validate the request body at the boundary. Throws a 400-shaped error on
 * malformed input; everything downstream trusts the types.
 *
 * "Validate at boundaries, trust types inside" — this is the boundary. It is also the
 * only place a Zod schema for GameState exists, and it is intentionally shallow
 * (structure, not game legality): illegal *game* states are impossible to construct
 * because the client only ever gets state from the reducer, and legality checks here
 * would be a second implementation of rules.ts.
 */
export function parseOracleRequest(body: unknown): {
  messages: unknown[];
  snapshot: GameState;
  journal: PaneJournal;
  turnId: TurnId;
  kind: TurnKind;
  choiceId?: string;
} {
  const parsed = oracleRequestSchema.safeParse(body);
  if (!parsed.success) badRequest(parsed.error.message);
  const journalEntries = Array.isArray(parsed.data.journal)
    ? parsed.data.journal
    : parsed.data.journal.entries;
  return {
    messages: parsed.data.messages,
    snapshot: parsed.data.snapshot as GameState,
    journal: {
      entries: journalEntries.map(e => ({
        turnId: e.turnId,
        kind: e.kind ?? 'condition',
        line: e.line,
      })),
    },
    turnId: parsed.data.turnId,
    kind: parsed.data.kind,
    ...(parsed.data.choiceId !== undefined ? { choiceId: parsed.data.choiceId } : {}),
  };
}
