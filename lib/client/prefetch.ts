// lib/client/prefetch.ts
//
// ===========================================================================
// OPEN QUESTION 4 — prefetch-on-proximity, resolved.
//
// DECISION: prefetch at the TRANSPORT layer, buffering raw UI-message chunks. The
// buffered stream is not "merged with useChat" — it is *handed to* useChat as the
// response to a send that hasn't happened yet.
//
//   1. Phaser's proximity sensor fires `world:proximity_enter` for a paneWorthy entity.
//   2. `PrefetchController.arm(entityId)` builds the packet, computes its digest, and
//      POSTs /api/oracle with kind:'prefetch'. The response body is piped into a
//      BufferedStream — an array of chunks plus a "still open" flag.
//   3. The player presses Enter. `useChat.sendMessage(...)` calls our transport's
//      `sendMessages`. The transport asks the controller for a buffer matching the
//      CURRENT digest. On a hit it returns `buffer.replay()`: a ReadableStream that
//      flushes every chunk received so far synchronously, then continues following the
//      live source. On a miss it does a normal fetch.
//
// WHERE THE BUFFERED STREAM LIVES: module scope, one slot (`current`), outside React.
// Not in a ref, not in the store. A ref dies with the component and the store is sim
// truth. One slot because there is one player and prefetching two things at once buys
// nothing but token spend.
//
// WHY SIDE EFFECTS DON'T LEAK EARLY: the buffer holds opaque chunks and never parses
// them. `onData` — and therefore `applyVerdict`, `pane:focus`, the ChoiceRack — only run
// when useChat consumes the stream, which only happens at reveal. So a prefetched turn
// that is never revealed cannot open a chest, spotlight anything, or damage the player.
// The gate is structural, not a boolean somebody has to remember to check. (The server's
// fork *did* run the actions — against a throwaway copy that is already garbage.)
//
// WHAT INVALIDATES: `digestPacket` mismatch (see lib/oracle/context.ts — semantic, so
// walking closer does not invalidate but picking up the crowbar does), a 20s TTL,
// `world:proximity_exit` (aborts in flight), and the Pane already being open.
// ===========================================================================

import type { ContextPacket } from '../sim/types';
import type { TurnId } from '../oracle/protocol';

/** An in-flight-or-complete response body, replayable exactly once. */
export interface BufferedStream<T> {
  /**
   * Everything received so far, then the live tail. Consuming transfers ownership; a
   * second call throws. Single-consumer by design — two consumers would mean two
   * useChat instances applying the same verdicts.
   */
  replay(): ReadableStream<T>;
  /** Chunks received so far. Non-zero means we genuinely bought latency. */
  buffered(): number;
  done(): boolean;
  abort(): void;
}

/** Tee a fetch body into a buffer that a later reader can replay from the beginning. */
export function bufferStream<T>(source: ReadableStream<T>): BufferedStream<T> {
  throw new Error('not implemented');
  // TODO  pump source -> chunks[]; on replay(), enqueue chunks[] then pipe the remainder.
}

export interface PrefetchSlot {
  turnId: TurnId;
  entityId: string;
  /** The digest at arm time. Compared against the digest at reveal time. */
  digest: string;
  armedAt: number;
  stream: BufferedStream<unknown>;
}

export const PREFETCH_TTL_MS = 20_000;
/** ARCHITECTURE §8.2: "within 3 tiles of a paneWorthy entity". */
export const PREFETCH_RADIUS_TILES = 3;

export interface PrefetchController {
  /**
   * Start a background turn for this entity. No-ops when: the Pane is open, a slot for
   * this entity+digest already exists, or the entity is not paneWorthy. Cancels any slot
   * for a different entity.
   */
  arm(entityId: string): void;

  /** Player left the radius. Aborts in flight and clears the slot. */
  disarm(entityId: string): void;

  /**
   * Called by the transport on send. Returns the buffered stream when the slot is still
   * valid for `digest`, otherwise undefined (and clears the stale slot).
   */
  claim(digest: string): BufferedStream<unknown> | undefined;

  /** Dev overlay + the "did prefetch help" measurement the demo rehearsal needs. */
  stats(): { hits: number; misses: number; wasted: number };
}

export function createPrefetchController(deps: {
  buildPacket: () => ContextPacket;
  post: (body: unknown, signal: AbortSignal) => Promise<Response>;
}): PrefetchController {
  throw new Error('not implemented');
}
