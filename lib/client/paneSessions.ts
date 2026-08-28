// Per-object Aetherglass conversations. Not sim truth — the Pane's memory,
// keyed by entity id. Walking away parks a session; Enter on that entity resumes it.

import { emptyJournal, type PaneJournal } from '../oracle/journal';

export interface StoredPaneSession {
  entityId: string;
  messages: unknown[];
  journal: PaneJournal;
  rack: unknown;
  frozenRefusals: Record<string, Array<{ action: string; reason: string }>>;
}

type Listener = () => void;

const sessions = new Map<string, StoredPaneSession>();
const listeners = new Set<Listener>();
let activeId: string | null = null;
let dismissHandler: (() => void) | null = null;

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function subscribePaneSessions(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveSessionId(): string | null {
  return activeId;
}

export function setActiveSessionId(id: string | null): void {
  if (activeId === id) return;
  activeId = id;
  notify();
}

export function getSession(entityId: string): StoredPaneSession | undefined {
  return sessions.get(entityId);
}

export function putSession(session: StoredPaneSession): void {
  sessions.set(session.entityId, session);
  notify();
}

export function parkedSessionIds(): string[] {
  return [...sessions.keys()].filter((id) => id !== activeId);
}

export function emptyStoredSession(entityId: string): StoredPaneSession {
  return {
    entityId,
    messages: [],
    journal: emptyJournal(),
    rack: null,
    frozenRefusals: {},
  };
}

/** Phaser calls this on the first movement frame. The Pane hook is the one that saves. */
export function setSessionDismissHandler(fn: (() => void) | null): void {
  dismissHandler = fn;
}

export function requestSessionDismiss(): void {
  dismissHandler?.();
}
