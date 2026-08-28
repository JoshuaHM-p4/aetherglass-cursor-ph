// lib/oracle/journal.ts
//
// The Pane's own short-term memory: things that happened in the conversation that the
// sim has no opinion about.
//
// WHY IT IS NOT IN GameState.log: the sim log is a record of state transitions. "I
// offered you three ways through the door" is not a state transition — nothing in the
// world changed — but the model must see it or it will offer the same three options
// again on the next turn (ARCHITECTURE §9, "Choices repeat"). Putting it in the sim log
// would mean the sim's truth depends on what the LLM said, which inverts the whole
// architecture.
//
// So: two per-actor histories, merged at the read boundary by buildContextPacket.
// The sim owns its log. The Pane owns this. Neither writes the other's.

import type { TurnId } from './protocol';

export type JournalKind =
  /** "offered: pry it with the crowbar / walk away / knock" */
  | 'offered'
  /** "the player committed to: pry it with the crowbar" — the choice round-trip. */
  | 'committed'
  /** "the world refused: grant sword_legendary (not_in_contents)" */
  | 'refused'
  /** "the world moved: the lockbox was already open by the time I finished speaking" */
  | 'diverged'
  /** "the glass took a hit; integrity 24" — tier transitions the model should feel. */
  | 'condition';

export interface JournalEntry {
  turnId: TurnId;
  kind: JournalKind;
  /** One terse line, already phrased for the model. No JSON in the prompt tail. */
  line: string;
}

/**
 * Ring buffer, capped. Client-owned, shipped up with every request. Not persisted —
 * a page reload starts a new conversation, which is correct for a 90-second demo.
 */
export interface PaneJournal {
  entries: readonly JournalEntry[];
}

export const JOURNAL_CAP = 12;

export function emptyJournal(): PaneJournal {
  throw new Error('not implemented');
}

export function record(journal: PaneJournal, entry: JournalEntry): PaneJournal {
  throw new Error('not implemented');
}

/** The tail that goes into the packet, newest last. Merged with the sim log tail. */
export function recentLines(journal: PaneJournal, n: number): string[] {
  throw new Error('not implemented');
}

/**
 * True once a 'committed' entry exists for this turn — the guard that makes the choice
 * round-trip idempotent under double-click. The rack reads this, not a boolean flag,
 * so there is one source of truth for "this offer is spent".
 */
export function isTurnCommitted(journal: PaneJournal, turnId: TurnId): boolean {
  throw new Error('not implemented');
}
