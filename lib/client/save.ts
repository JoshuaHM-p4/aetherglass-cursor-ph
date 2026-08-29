// Client-only localStorage. An explicit exception to AGENTS.md “no persistence”:
// no database, no auth. window is touched only inside these functions.

import { FOUNTAIN_ROOM_ID, FOUNTAIN_SPAWN } from '../dungeon/const';
import { applyAction } from '../sim/reducer';
import type { GameState } from '../sim/types';

export const SAVE_KEY = 'aetherglass.save.v1';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSave(): GameState | null {
  const raw = storage()?.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed?.dungeon?.rooms || !parsed.player?.roomId || !parsed.entities) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSave(state: GameState): void {
  storage()?.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearSave(): void {
  storage()?.removeItem(SAVE_KEY);
}

/** Fountain spawn, dungeon kept. Death refills hp; refresh does not unless already dead. */
export function atFountain(state: GameState, refillHp: boolean): GameState {
  const refill = refillHp || state.player.hp <= 0;
  const result = applyAction(state, { type: 'RETURN_FOUNTAIN', refillHp: refill });
  return result.ok ? result.state : state;
}

export function fountainSpawnOf(state: GameState): GameState {
  const next = structuredClone(state);
  next.player.roomId = FOUNTAIN_ROOM_ID;
  next.player.tx = FOUNTAIN_SPAWN.tx;
  next.player.ty = FOUNTAIN_SPAWN.ty;
  next.player.facing = 'down';
  return next;
}
