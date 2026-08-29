// lib/client/transport.ts
//
// A ChatTransport that (a) builds the request body from live sim state at send time and
// (b) short-circuits to a prefetched buffer when one is valid.
//
// This is the ONE seam that makes prefetch invisible to everything above it. `useChat`
// asks a transport for a stream; whether that stream started 4 seconds ago on proximity
// or 4 milliseconds ago on Enter is not the Pane's business. No branching in the
// component, no "revealBuffered()" API, no second message list to merge.
//
// H0 verdict on the sketch's `ChatTransportLike`: the installed SDK (ai@6.0.271) drifted
// past it — `sendMessages` takes required `trigger`/`chatId`/`messageId` and must return
// `ReadableStream<UIMessageChunk>`, not raw response bytes. So this file takes the
// sketch's own sanctioned fallback: `DefaultChatTransport` + `prepareSendMessagesRequest`
// (known-stable), which owns the fetch and the SSE→chunk parsing. The H9 prefetch claim
// branch wraps the returned transport's `sendMessages` (buffering chunk streams produced
// by this same transport), so the seam survives the fallback.

import { DefaultChatTransport, type ChatTransport, type UIMessage } from 'ai';
import type { PrefetchController } from './prefetch';
import type { TurnKind } from '../oracle/protocol';
import { pruneIncompleteToolParts } from '../oracle/messages';

export interface OracleTransportDeps {
  prefetch: PrefetchController;
  /** Reads the live store. Called at send time, never in a useEffect (ARCHITECTURE §9). */
  snapshot: () => unknown;
  journal: () => unknown;
  nextTurnId: () => string;
}

/**
 * `body.kind` defaults to 'speak'. `choose()` passes 'choose' + choiceId; the look/enter
 * path passes 'look'. The transport never invents a kind — the caller's intent is data,
 * not something to infer from message text.
 */
export function createOracleTransport(
  deps: OracleTransportDeps,
): ChatTransport<UIMessage> {
  // TODO H9: wrap sendMessages with prefetch.claim(digestPacket(...)); never replay a
  // buffer when kind === 'choose'.
  return new DefaultChatTransport<UIMessage>({
    api: ORACLE_ENDPOINT,
    prepareSendMessagesRequest: ({ messages, body }) => ({
      body: {
        kind: DEFAULT_TURN_KIND,
        ...body,
        messages: pruneIncompleteToolParts(messages),
        snapshot: deps.snapshot(),
        journal: deps.journal(),
        turnId: deps.nextTurnId(),
      },
    }),
  });
}

export const ORACLE_ENDPOINT = '/api/oracle';
export const DEFAULT_TURN_KIND: TurnKind = 'speak';
