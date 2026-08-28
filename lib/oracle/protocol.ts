// lib/oracle/protocol.ts
//
// The wire between the client store and /api/oracle. INTERNAL to the oracle boundary:
// nothing outside lib/oracle, lib/client, and app/api/oracle imports this file. The
// Pane component never sees an `OracleRequest`; it sees `useOracleTurn()`.
//
// ===========================================================================
// OPEN QUESTION 1 — the proposal/application loop, resolved.
//
// DECISION: ship the snapshot up, run a throwaway fork of the sim inside the request,
// stream the accepted actions back down as verdicts, and replay them on the client.
//
//   client                         server (one HTTP request, one model turn)
//   ------                         ---------------------------------------
//   snapshot = world()      ──▶    fork = { ...snapshot }        (in-memory, per-request)
//   messages, journal              packet = buildContextPacket(fork, journal)
//                                  streamText(system, tools over fork)
//                                    tool execute
//                                      -> applyAction(fork, action)   ← SYNCHRONOUS
//                                      -> writer.write(data-verdict)  ← streams out now
//                                      -> return { ok, reason } to the model
//                                    model's next sentence sees the real outcome
//   applyVerdict(v) per part ◀──    (text + data parts interleaved, one stream)
//   commit to gameStore
//
// WHY THIS AND NOT THE ALTERNATIVES:
//
//   (a) "Server returns proposals, client applies and echoes back." The echo needs an
//       upstream channel while the response is still streaming. There isn't one. You
//       end up with a second HTTP request carrying the tool result and a full context
//       re-upload — the thing AGENTS.md forbids — and the model stalls for a round trip
//       mid-sentence, right in the 900ms budget.
//
//   (b) "Client applies via onToolCall / addToolResult." Same cost, made invisible by
//       the SDK: client-side tool execution ends the response, and the resubmission is
//       a fresh POST and a fresh model invocation. Two network legs and two prefills
//       per turn instead of one.
//
//   (c) THIS. The tool's `{ ok, reason }` is available in the same process, in the same
//       microtask, from a real reducer run against real state. Cost: the snapshot rides
//       up in the request body (~8KB for one floor) and the client re-runs the same pure
//       reducer to commit. Zero extra network legs, zero extra prefills.
//
// THE CONSISTENCY STORY. The fork is a DRY RUN; the client store is the COMMIT. The
// fork is garbage-collected with the request and is never read by anything but the model
// and the verdict stream. So the question is only: can the client's commit disagree with
// the fork's dry run? Yes, in exactly one situation — the player did something with the
// keyboard between snapshot and reveal. `applyVerdict` re-checks and, on disagreement,
// drops the action and journals it, so the Pane's next packet contains the correction.
// State never forks; only the narration can be briefly wrong, and the recovery is in
// character. See lib/sim/store.ts `VerdictOutcome`.
//
// ON "no second LLM round-trip per turn": a tool-continuation *step* inside one
// `streamText` call is not a round trip. `stopWhen: stepCountIs(4)` keeps the whole turn
// inside one HTTP response and one continuous UI message stream, and the system prefix
// is byte-identical across steps so steps 2+ are prompt-cache hits. What AGENTS.md
// forbids is a second request cycle per turn (plan-then-act, or client tool echo).
// ===========================================================================

import type { Action, RejectReason, SimEvent } from '../sim/types';

// ---------------------------------------------------------------- up

/** Opaque, client-generated, one per user-visible turn. Namespaces verdict keys. */
export type TurnId = string;

/** Why this turn is happening. Selects the model and the prompt's intent block. */
export type TurnKind =
  /** Player typed into the Pane. */
  | 'speak'
  /** Player pressed Enter on a paneWorthy entity, or walked into one. */
  | 'look'
  /** Player clicked a choice the Pane offered. A decision already taken. */
  | 'choose'
  /** Fired ahead of the player by proximity; may never be revealed. */
  | 'prefetch';

export interface OracleRequest {
  /** UIMessage[] from useChat. Converted with `await convertToModelMessages(...)`. */
  messages: unknown[];
  /**
   * The whole GameState. Not the packet.
   *
   * The packet is a *projection*; shipping both invites the two to drift, and the
   * ARCHITECTURE §9 failure "Pane narrates items you don't have" is exactly that drift.
   * The server derives the packet from this snapshot, so the state the tools mutate and
   * the state the model reads are the same object by construction. It also means the
   * fork exists at all, which is the whole design.
   */
  snapshot: unknown; // GameState — `unknown` on the wire; parsed at the boundary.
  /** The Pane's own memory of the last few turns. See journal.ts. */
  journal: JournalEntryWire[];
  turnId: TurnId;
  kind: TurnKind;
  /** Set when kind === 'choose'. Identify the offer AND the choice within it. */
  offerId?: string;
  choiceId?: string;
}

export interface JournalEntryWire {
  turnId: TurnId;
  line: string;
}

// ---------------------------------------------------------------- down (data parts)

/**
 * Three custom data parts, written with `writer.write({ type: 'data-x', data })` and
 * received via useChat's `onData`. Ordering within the stream is the ordering of the
 * model's tool calls, which is the ordering the player perceives.
 */
export type OracleDataPart =
  | { type: 'data-focus'; data: FocusData }
  | { type: 'data-choices'; data: ChoicesData }
  | { type: 'data-verdict'; data: Verdict };

export interface FocusData {
  /** An Entity.id === LDtk iid === Phaser sprite.name. One id space, no mapping. */
  entityId: string;
  style: 'spotlight' | 'pulse' | 'shatter';
}

export interface ChoicesData {
  turnId: TurnId;
  /**
   * Server-stamped, unique per offer_choices call (`${turnId}:${offerSeq}`), grafted
   * from the arena's candidate-2. `choose()` sends it back with the choiceId, and only
   * the CURRENT offer's id is accepted — so a click on a stale rack (one the model has
   * since replaced, or one revived by a replayed buffer) is a no-op rather than a
   * mystery mutation. turnId alone is not enough: one turn may offer twice.
   */
  offerId: string;
  prompt: string;
  choices: OfferedChoice[];
}

export interface OfferedChoice {
  id: string;
  label: string;
  risk: 'safe' | 'costly' | 'unknown';
  /** Validated present in the bag before the part is written. */
  usesItemId?: string;
}

/**
 * The simulation disposing. One per mutating tool call the model made, accepted or not.
 *
 * `ok: false` verdicts are streamed too, deliberately: the Pane's transcript renders
 * them as a struck-through proposal chip ("grant sword_legendary — refused:
 * not_in_contents"), which is demo beat 3 made visible rather than merely narrated.
 */
export interface Verdict {
  turnId: TurnId;
  /** Monotonic within the turn. `${turnId}:${seq}` is the idempotency key. */
  seq: number;
  /** The proposal, as a real Action. The client replays this through its own reducer. */
  action: Action;
  ok: boolean;
  reason?: RejectReason;
  /** What the fork produced. Advisory only — the client trusts its own reducer's events. */
  events: SimEvent[];
}

export function verdictKey(v: Pick<Verdict, 'turnId' | 'seq'>): string {
  return `${v.turnId}:${v.seq}`;
}
