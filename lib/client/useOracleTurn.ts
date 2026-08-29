// lib/client/useOracleTurn.ts
//
// THE PANE'S ENTIRE API. One hook, six members.

'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bus } from '../../game/EventBus';
import { setIntroLocked, setPaneTyping, subscribePadTap } from '../../game/inputCapture';
import { emptyJournal, isTurnCommitted, record, type PaneJournal } from '../oracle/journal';
import type { ChoicesData, FocusData, OfferedChoice, TurnId, Verdict } from '../oracle/protocol';
import { verdictKey } from '../oracle/protocol';
import { gameStore, world } from '../sim/store';
import type { Action } from '../sim/types';
import {
  getActiveSessionId,
  getSession,
  putSession,
  setActiveSessionId,
  setSessionDismissHandler,
  type StoredPaneSession,
} from './paneSessions';
import { isRestatedNarration, shapePaneText } from './paneText';
import type { PrefetchController } from './prefetch';
import { createOracleTransport } from './transport';
import { INTRO_BEATS, INTRO_ENTITY_ID } from '../oracle/intro';

/** What the glass is doing. Drives the breathing blur and the input's disabled state. */
export type PaneStatus = 'asleep' | 'ready' | 'thinking' | 'streaming' | 'error';

export type ChoiceRack =
  | { status: 'pending'; turnId: TurnId; offerId: string; prompt: string;
      choices: readonly OfferedChoice[] }
  | { status: 'resolved'; turnId: TurnId; offerId: string; prompt: string;
      choices: readonly OfferedChoice[]; chosenId: string };

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
  rack: ChoiceRack | null;
  /** Entity the glass is currently speaking about, or null when parked. */
  activeEntityId: string | null;
  ask(text: string): void;
  choose(choiceId: string): void;
  look(entityId: string): void;
  retry(): void;
  /** Scripted fountain wake; Enter advances, cannot skip. Null when the live oracle is in charge. */
  introBeat: number | null;
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
  const chunks: string[] = [];
  for (const part of message.parts) {
    if (part.type === 'text' && part.text) chunks.push(part.text);
  }
  return shapePaneText(chunks.join('')).text;
}

function describeAction(action: Action): string {
  if (action.type === 'GRANT_ITEM') return `grant ${action.itemId}`;
  if (action.type === 'OPEN_CONTAINER') return `open ${action.entityId}`;
  if (action.type === 'UNLOCK') return `unlock ${action.entityId}`;
  return action.type.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asFocus(data: unknown): FocusData | null {
  if (!isRecord(data) || typeof data.entityId !== 'string') return null;
  if (data.style !== 'spotlight' && data.style !== 'pulse' && data.style !== 'shatter') return null;
  return { entityId: data.entityId, style: data.style };
}

function asChoices(data: unknown): ChoicesData | null {
  if (!isRecord(data)) return null;
  if (typeof data.turnId !== 'string' || typeof data.offerId !== 'string') return null;
  if (typeof data.prompt !== 'string' || !Array.isArray(data.choices)) return null;
  return data as unknown as ChoicesData;
}

function asVerdict(data: unknown): Verdict | null {
  if (!isRecord(data)) return null;
  if (typeof data.turnId !== 'string' || typeof data.seq !== 'number') return null;
  if (!isRecord(data.action) || typeof data.action.type !== 'string') return null;
  if (typeof data.ok !== 'boolean') return null;
  return data as unknown as Verdict;
}

function cloneMessages(messages: UIMessage[]): UIMessage[] {
  try {
    return structuredClone(messages);
  } catch {
    return JSON.parse(JSON.stringify(messages)) as UIMessage[];
  }
}

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

  const [rack, setRack] = useState<ChoiceRack | null>(null);
  const rackRef = useRef(rack);
  rackRef.current = rack;
  const [activeEntityId, setActiveEntity] = useState<string | null>(getActiveSessionId);
  const [introBeat, setIntroBeat] = useState<number | null>(null);
  const introBeatRef = useRef<number | null>(null);
  introBeatRef.current = introBeat;

  const frozenRefusals = useRef<Record<string, Array<{ action: string; reason: string }>>>({});
  const liveRefusals = useRef<Array<{ action: string; reason: string }>>([]);
  const lastPaneId = useRef<string | null>(null);
  const recoveredFocus = useRef(new Set<string>());
  const streamOwnerRef = useRef<string | null>(null);
  /** After the scripted wake, ignore the same Enter that would otherwise open an empty look. */
  const muteInteractUntil = useRef(0);
  const closeSessionRef = useRef<() => void>(() => {});
  const [, bump] = useState(0);

  const freezeRefusals = () => {
    const id = lastPaneId.current;
    if (id && liveRefusals.current.length > 0) {
      frozenRefusals.current[id] = liveRefusals.current;
      liveRefusals.current = [];
    }
  };

  const { messages: uiMessages, sendMessage, status: chatStatus, regenerate, setMessages } =
    useChat({
      transport,
      onData: (part) => {
        if (part.type === 'data-focus') {
          const data = asFocus(part.data);
          if (data) bus.emit('pane:focus', data);
          return;
        }
        if (part.type === 'data-choices') {
          const data = asChoices(part.data);
          if (!data) return;
          journalRef.current = record(journalRef.current, {
            turnId: data.turnId,
            kind: 'offered',
            line: `offered: ${data.choices.map((c) => c.label).join(' / ')}`,
          });
          setRack({
            status: 'pending',
            turnId: data.turnId,
            offerId: data.offerId,
            prompt: data.prompt,
            choices: data.choices,
          });
          return;
        }
        if (part.type !== 'data-verdict') return;
        const verdict = asVerdict(part.data);
        if (!verdict) return;
        const outcome = gameStore.getState().applyVerdict({
          key: verdictKey(verdict),
          action: verdict.action,
          ok: verdict.ok,
          reason: verdict.reason,
        });
        if (outcome.status === 'diverged') {
          journalRef.current = record(journalRef.current, {
            turnId: verdict.turnId,
            kind: 'diverged',
            line: `the world moved: ${verdict.action.type} (${outcome.reason})`,
          });
        }
        if (outcome.status === 'refused' || !verdict.ok) {
          const reason =
            verdict.reason ?? (outcome.status === 'refused' ? outcome.reason : 'no_such_entity');
          const chip = { action: describeAction(verdict.action), reason };
          journalRef.current = record(journalRef.current, {
            turnId: verdict.turnId,
            kind: 'refused',
            line: `the world refused: ${chip.action} (${reason})`,
          });
          // Invented ids are for the journal, not the glass. Demo beat 3 is
          // not_in_contents (a real wish the world refused), not no_such_item.
          if (verdict.action.type === 'GRANT_ITEM' && reason === 'no_such_item') {
            bump((n) => n + 1);
            return;
          }
          liveRefusals.current = [...liveRefusals.current, chip];
          bump((n) => n + 1);
        }
      },
    });

  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;
  const chatStatusRef = useRef(chatStatus);
  chatStatusRef.current = chatStatus;
  const uiMessagesRef = useRef(uiMessages);
  uiMessagesRef.current = uiMessages;
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  const capture = (entityId: string): StoredPaneSession => {
    freezeRefusals();
    return {
      entityId,
      messages: cloneMessages(uiMessagesRef.current),
      journal: { entries: [...journalRef.current.entries] },
      rack: rackRef.current,
      frozenRefusals: { ...frozenRefusals.current },
    };
  };

  const restore = (session: StoredPaneSession) => {
    journalRef.current = session.journal;
    frozenRefusals.current = { ...session.frozenRefusals };
    liveRefusals.current = [];
    setRack((session.rack as ChoiceRack | null) ?? null);
    setMessagesRef.current(session.messages as UIMessage[]);
  };

  const parkCurrent = () => {
    const id = getActiveSessionId();
    if (!id) return;
    putSession(capture(id));
  };

  closeSessionRef.current = () => {
    const id = getActiveSessionId();
    if (id) putSession(capture(id));
    streamOwnerRef.current = null;
    setActiveSessionId(null);
    setActiveEntity(null);
    setRack(null);
    setMessagesRef.current([]);
    journalRef.current = emptyJournal();
    frozenRefusals.current = {};
    liveRefusals.current = [];
    setPaneTyping(false);
    bus.emit('pane:focus_clear', {});
    bus.emit('pane:awake', { open: false, reason: 'closed' });
    bump((n) => n + 1);
  };

  const lookAt = (entityId: string) => {
    if (performance.now() < muteInteractUntil.current) return;
    const streaming =
      chatStatusRef.current === 'submitted' || chatStatusRef.current === 'streaming';
    const entity = world().entities[entityId];
    if (!entity) return;

    if (!world().flags.intro_done && entityId === INTRO_ENTITY_ID) {
      if (introBeatRef.current !== null) {
        bus.emit('pane:awake', { open: true, reason: 'interact' });
        bus.emit('pane:focus', { entityId, style: 'spotlight' });
        return;
      }
      parkCurrent();
      setActiveSessionId(entityId);
      setActiveEntity(entityId);
      streamOwnerRef.current = entityId;
      freezeRefusals();
      setRack(null);
      setMessagesRef.current([]);
      setIntroBeat(0);
      setPaneTyping(true);
      setIntroLocked(true);
      bus.emit('pane:awake', { open: true, reason: 'interact' });
      bus.emit('pane:focus', { entityId, style: 'spotlight' });
      bus.emit('pane:intro', { cue: 'hey' });
      return;
    }

    if (introBeatRef.current !== null) return;

    if (streaming) {
      if (streamOwnerRef.current === entityId) {
        setActiveSessionId(entityId);
        setActiveEntity(entityId);
        bus.emit('pane:awake', { open: true, reason: 'interact' });
        bus.emit('pane:focus', { entityId, style: 'spotlight' });
      }
      return;
    }

    if (getActiveSessionId() === entityId) {
      bus.emit('pane:awake', { open: true, reason: 'interact' });
      bus.emit('pane:focus', { entityId, style: 'spotlight' });
      return;
    }

    parkCurrent();
    const existing = getSession(entityId);
    setActiveSessionId(entityId);
    setActiveEntity(entityId);
    streamOwnerRef.current = entityId;
    freezeRefusals();
    bus.emit('pane:awake', { open: true, reason: 'interact' });
    bus.emit('pane:focus', { entityId, style: 'spotlight' });

    if (existing && existing.messages.length > 0) {
      restore(existing);
      return;
    }

    journalRef.current = emptyJournal();
    frozenRefusals.current = {};
    liveRefusals.current = [];
    setRack(null);
    setMessagesRef.current([]);
    void sendRef.current(
      { text: `I look at the ${entity.name}.` },
      { body: { kind: 'look' } },
    );
  };
  const lookRef = useRef(lookAt);
  lookRef.current = lookAt;

  useEffect(() => bus.on('world:interact', ({ entityId }) => lookRef.current(entityId)), []);

  useEffect(() => {
    const tryIntro = () => {
      if (introBeatRef.current !== null) return;
      if (world().flags.intro_done) return;
      lookRef.current(INTRO_ENTITY_ID);
    };
    tryIntro();
    const offReady = bus.on('world:ready', tryIntro);
    const offPlaying = bus.on('menu:playing', ({ playing }) => {
      if (playing) tryIntro();
    });
    return () => {
      offReady();
      offPlaying();
      setIntroLocked(false);
    };
  }, []);

  useEffect(() => {
    if (introBeat === null) return;
    setPaneTyping(true);
    setIntroLocked(true);
    const finish = () => {
      gameStore.getState().dispatch({ type: 'SET_FLAG', flag: 'intro_done', value: true }, 'keyboard');
      // Dismiss used to no-op here: introBeatRef was still set because setState
      // had not re-rendered. That left an empty AETHERGLASS pane on screen.
      introBeatRef.current = null;
      setIntroBeat(null);
      setPaneTyping(false);
      bus.emit('pane:intro', { cue: 'done' });
      muteInteractUntil.current = performance.now() + 450;
      closeSessionRef.current();
      let unlocked = false;
      const unlock = () => {
        if (unlocked) return;
        unlocked = true;
        window.removeEventListener('keyup', onEnterUp, true);
        setIntroLocked(false);
      };
      const onEnterUp = (event: KeyboardEvent) => {
        if (event.key === 'Enter') unlock();
      };
      window.addEventListener('keyup', onEnterUp, true);
      window.setTimeout(unlock, 450);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (introBeat + 1 >= INTRO_BEATS.length) {
        finish();
        return;
      }
      setIntroBeat(introBeat + 1);
    };
    window.addEventListener('keydown', onKey, true);
    const offPad = subscribePadTap((tap) => {
      if (tap !== 'enter') return;
      onKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      offPad();
    };
  }, [introBeat]);

  useEffect(() => {
    setSessionDismissHandler(() => {
      if (introBeatRef.current !== null) return;
      closeSessionRef.current();
    });
    return () => setSessionDismissHandler(null);
  }, []);

  useEffect(() => {
    if (chatStatus === 'ready' || chatStatus === 'error') {
      const owner = streamOwnerRef.current;
      if (owner && getActiveSessionId() !== owner) {
        putSession(capture(owner));
      }
    }
  }, [chatStatus]);

  useEffect(() => {
    for (const message of uiMessages) {
      if (message.role !== 'assistant') continue;
      if (recoveredFocus.current.has(message.id)) continue;
      const raw = message.parts
        .map((part) => (part.type === 'text' && part.text ? part.text : ''))
        .join('');
      const { focus } = shapePaneText(raw);
      if (!focus) continue;
      recoveredFocus.current.add(message.id);
      bus.emit('pane:focus', focus);
    }
  }, [uiMessages]);

  const sessionOpen = activeEntityId !== null;
  const messages: PaneMessage[] = [];
  if (introBeat !== null) {
    for (let i = 0; i <= introBeat; i++) {
      const beat = INTRO_BEATS[i];
      if (!beat) continue;
      messages.push({ id: `intro-${beat.id}`, role: 'pane', text: beat.text, refusals: [] });
    }
  } else if (sessionOpen) {
    for (const message of uiMessages) {
      if (message.role !== 'user' && message.role !== 'assistant') continue;
      const role = message.role === 'user' ? 'player' : 'pane';
      const text = textOf(message);
      if (role === 'pane') {
        const prev = messages.at(-1);
        if (prev?.role === 'pane' && isRestatedNarration(prev.text, text)) continue;
        lastPaneId.current = message.id;
      }
      const live = role === 'pane' && message.id === lastPaneId.current ? liveRefusals.current : [];
      messages.push({
        id: message.id,
        role,
        text,
        refusals: frozenRefusals.current[message.id] ?? live,
      });
    }
  }

  let status: PaneStatus;
  if (!sessionOpen) status = 'asleep';
  else if (introBeat !== null) status = 'ready';
  else if (chatStatus === 'submitted') status = 'thinking';
  else if (chatStatus === 'streaming') status = 'streaming';
  else if (chatStatus === 'error') status = 'error';
  else if (messages.length === 0) status = 'asleep';
  else status = 'ready';

  const ask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === '') return;
      if (!getActiveSessionId()) return;
      freezeRefusals();
      streamOwnerRef.current = getActiveSessionId();
      bus.emit('pane:awake', { open: true, reason: 'typed' });
      void sendMessage({ text: trimmed });
    },
    [sendMessage],
  );

  const choose = useCallback(
    (choiceId: string) => {
      const current = rackRef.current;
      if (!current || current.status !== 'pending') return;
      if (current.offerId !== rackRef.current?.offerId) return;
      if (isTurnCommitted(journalRef.current, current.turnId)) return;
      const choice = current.choices.find((c) => c.id === choiceId);
      if (!choice) return;
      setRack({ ...current, status: 'resolved', chosenId: choiceId });
      journalRef.current = record(journalRef.current, {
        turnId: current.turnId,
        kind: 'committed',
        line: `the player committed to: ${choice.label} (${choice.risk}${
          choice.usesItemId ? `, uses ${choice.usesItemId}` : ''
        })`,
      });
      freezeRefusals();
      streamOwnerRef.current = getActiveSessionId();
      void sendMessage(
        { text: choice.label },
        { body: { kind: 'choose', offerId: current.offerId, choiceId } },
      );
    },
    [sendMessage],
  );

  return {
    messages,
    status,
    rack: sessionOpen ? rack : null,
    activeEntityId,
    ask,
    choose,
    look(entityId: string) {
      lookAt(entityId);
    },
    retry() {
      void regenerate();
    },
    introBeat,
  };
}

export type { PaneJournal };
