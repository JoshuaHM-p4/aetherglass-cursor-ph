// lib/client/useOracleTurn.ts
//
// THE PANE'S ENTIRE API. This is the deep-interface bet of the design: one hook, six
// members, hiding the transport, the packet, the snapshot, verdict replay, the journal,
// the prefetch buffer, the choice round-trip, and the EventBus forwarding.
//
// `components/pane/Pane.tsx` imports this and nothing else from lib/. It never sees an
// `OracleRequest`, a `data-verdict`, a `ContextPacket`, or a `GameState`. If a wire type
// ever appears in this file's exports, the abstraction has failed.

'use client';

import { useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { emptyJournal } from '../oracle/journal';
import { world } from '../sim/store';
import type { OfferedChoice, TurnId } from '../oracle/protocol';
import type { PrefetchController } from './prefetch';
import { createOracleTransport } from './transport';

/** What the glass is doing. Drives the breathing blur and the input's disabled state. */
export type PaneStatus = 'asleep' | 'ready' | 'thinking' | 'streaming' | 'error';

/**
 * A choice rack, as the component renders it. `offerId` is the server-stamped identity
 * (grafted from arena candidate-2): a click is honored only when its offerId matches the
 * current rack's, so stale racks and replayed buffers cannot re-enter the chat.
 */
export type ChoiceRack =
  | { status: 'pending'; turnId: TurnId; offerId: string; prompt: string;
      choices: readonly OfferedChoice[] }
  | { status: 'resolved'; turnId: TurnId; offerId: string; prompt: string;
      choices: readonly OfferedChoice[]; chosenId: string };

/** One rendered line. `refusals` is what makes demo beat 3 visible rather than merely told. */
export interface PaneMessage {
  id: string;
  role: 'player' | 'pane';
  text: string;
  /** Struck-through chips: "grant sword_legendary — refused: not_in_contents". */
  refusals: ReadonlyArray<{ action: string; reason: string }>;
}

export interface OracleTurnApi {
  messages: readonly PaneMessage[];
  status: PaneStatus;
  /** Latest rack, or null. Only ever one on screen. */
  rack: ChoiceRack | null;

  /** Free text. PRD §3 "Speak". */
  ask(text: string): void;

  /**
   * OPEN QUESTION 3 — the choice round-trip, resolved.
   *
   * One call, four steps, in this order:
   *   1. mark the rack resolved (so a second click is a no-op — the type makes the
   *      resolved branch unable to be clicked, and `isTurnCommitted` is the runtime
   *      backstop for the in-flight window);
   *   2. record a `committed` journal entry ("the player committed to: pry it with the
   *      crowbar (costly, uses crowbar)") — this is what stops the model re-offering the
   *      same options, per ARCHITECTURE §9;
   *   3. `sendMessage({ text: choice.label }, { body: { kind: 'choose', offerId, choiceId } })`
   *      — the label becomes a normal player bubble, which is what it looks like from the
   *      player's side, while `kind: 'choose'` swaps in the prompt block that says the
   *      decision is already taken;
   *   4. discard any prefetch buffer (a buffered stream was generated before the
   *      commitment and cannot know about it).
   *
   * The choice does NOT touch the sim. Consequences arrive as verdicts on the next
   * response, through the same path as everything else — there is no second write path
   * into the world for buttons.
   */
  choose(choiceId: string): void;

  /** Pressed Enter on an entity. Claims any prefetched buffer for it. */
  look(entityId: string): void;

  retry(): void;
}

const PREFETCH_UNARMED: PrefetchController = {
  arm() {},
  disarm() {},
  claim() {
    return undefined;
  },
  stats() {
    return { hits: 0, misses: 0, wasted: 0 };
  },
};

function textOf(message: { parts: ReadonlyArray<{ type: string; text?: string }> }): string {
  let text = '';
  for (const part of message.parts) {
    if (part.type === 'text' && part.text !== undefined) {
      text += part.text;
    }
  }
  return text;
}

/**
 * Mount once, inside <Pane/>. Wires:
 *   useChat({ transport: createOracleTransport(...), onData })
 *
 * `onData` is the single place incoming parts fan out, and the fan-out is total:
 *   data-focus   -> bus.emit('pane:focus', data)
 *   data-choices -> setRack({ status: 'pending', ... })
 *   data-verdict -> gameStore.getState().applyVerdict(data)  ← the commit
 *                   + on 'diverged' or 'refused', journal.record(...)
 *
 * Note the asymmetry that makes the whole thing safe: parts flow one way, and the only
 * thing that ever writes GameState from this file is `applyVerdict`.
 */
export function useOracleTurn(): OracleTurnApi {
  const journalRef = useRef(emptyJournal());
  const transport = useMemo(
    () =>
      createOracleTransport({
        prefetch: PREFETCH_UNARMED,
        snapshot: () => world(),
        journal: () => [...journalRef.current.entries],
        nextTurnId: () => crypto.randomUUID(),
      }),
    [],
  );

  const { messages: uiMessages, sendMessage, status: chatStatus, regenerate } = useChat({
    transport,
  });

  const messages: PaneMessage[] = [];
  for (const message of uiMessages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    messages.push({
      id: message.id,
      role: message.role === 'user' ? 'player' : 'pane',
      text: textOf(message),
      refusals: [],
    });
  }

  let status: PaneStatus;
  if (chatStatus === 'submitted') status = 'thinking';
  else if (chatStatus === 'streaming') status = 'streaming';
  else if (chatStatus === 'error') status = 'error';
  else if (messages.length === 0) status = 'asleep';
  else status = 'ready';

  return {
    messages,
    status,
    rack: null,
    ask(text: string) {
      const trimmed = text.trim();
      if (trimmed === '') return;
      void sendMessage({ text: trimmed });
    },
    choose(_choiceId: string) {
      throw new Error('not implemented');
    },
    look(_entityId: string) {
      throw new Error('not implemented');
    },
    retry() {
      void regenerate();
    },
  };
}
