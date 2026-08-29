// Client-only localStorage. An explicit exception to AGENTS.md “no persistence”:
// no database, no auth. window is touched only inside these functions.
//
// Three slots. The active slot is what `writeSave` (called from the store on every
// commit) writes. No active slot → write is a no-op, so the dummy boot state never
// lands in a file.

import { DEFAULT_APPEARANCE } from '../sim/appearances';
import { FOUNTAIN_ROOM_ID, FOUNTAIN_SPAWN } from '../dungeon/const';
import { applyAction } from '../sim/reducer';
import type { GameState } from '../sim/types';

export const SAVE_KEY = 'aetherglass.save.v1';
export const SLOTS_KEY = 'aetherglass.saves.v2';
export const ACTIVE_KEY = 'aetherglass.activeSlot.v2';
export const SLOT_COUNT = 3;

export type SlotIndex = 0 | 1 | 2;

type SlotFile = {
  slots: [GameState | null, GameState | null, GameState | null];
};

const EMPTY_SLOTS: SlotFile['slots'] = [null, null, null];

const listeners = new Set<() => void>();
let cachedSlots: SlotFile['slots'] = EMPTY_SLOTS;
let hydrated = false;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function subscribeSaves(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function isSlotIndex(n: number): n is SlotIndex {
  return n === 0 || n === 1 || n === 2;
}

function looksLikeState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as GameState;
  return Boolean(parsed.dungeon?.rooms && parsed.player?.roomId && parsed.entities);
}

function normalizePlayer(state: GameState): GameState {
  if (typeof state.player.name !== 'string' || !state.player.name) {
    state.player.name = 'wanderer';
  }
  if (typeof state.player.appearance !== 'string' || !state.player.appearance) {
    state.player.appearance = DEFAULT_APPEARANCE;
  }
  return state;
}

function migrateLegacy(store: Storage): SlotFile | null {
  const raw = store.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GameState;
    if (!looksLikeState(parsed)) {
      store.removeItem(SAVE_KEY);
      return null;
    }
    const file: SlotFile = { slots: [normalizePlayer(parsed), null, null] };
    store.setItem(SLOTS_KEY, JSON.stringify(file));
    store.setItem(ACTIVE_KEY, '0');
    store.removeItem(SAVE_KEY);
    return file;
  } catch {
    store.removeItem(SAVE_KEY);
    return null;
  }
}

function readFile(): SlotFile {
  const store = storage();
  if (!store) return { slots: [null, null, null] };
  const raw = store.getItem(SLOTS_KEY);
  if (!raw) return migrateLegacy(store) ?? { slots: [null, null, null] };
  try {
    const parsed = JSON.parse(raw) as SlotFile;
    if (!Array.isArray(parsed?.slots) || parsed.slots.length !== SLOT_COUNT) {
      return migrateLegacy(store) ?? { slots: [null, null, null] };
    }
    const slots: SlotFile['slots'] = [null, null, null];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const entry = parsed.slots[i];
      slots[i] = looksLikeState(entry) ? normalizePlayer(entry) : null;
    }
    return { slots };
  } catch {
    return migrateLegacy(store) ?? { slots: [null, null, null] };
  }
}

function ensureHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  cachedSlots = readFile().slots;
}

function writeFile(file: SlotFile): void {
  storage()?.setItem(SLOTS_KEY, JSON.stringify(file));
  cachedSlots = file.slots;
  hydrated = true;
  notify();
}

export function listSlots(): SlotFile['slots'] {
  ensureHydrated();
  return cachedSlots;
}

/** Stable empty tuple for useSyncExternalStore's server snapshot. */
export function emptySlots(): SlotFile['slots'] {
  return EMPTY_SLOTS;
}

export function getActiveSlot(): SlotIndex | null {
  const raw = storage()?.getItem(ACTIVE_KEY);
  if (raw == null) return null;
  const n = Number(raw);
  return isSlotIndex(n) ? n : null;
}

export function setActiveSlot(index: SlotIndex): void {
  storage()?.setItem(ACTIVE_KEY, String(index));
}

export function loadSlot(index: SlotIndex): GameState | null {
  ensureHydrated();
  return cachedSlots[index];
}

/** Active slot, or null if the player is still on the title. */
export function loadSave(): GameState | null {
  const index = getActiveSlot();
  if (index === null) return null;
  return loadSlot(index);
}

export function writeSave(state: GameState): void {
  const index = getActiveSlot();
  if (index === null) return;
  ensureHydrated();
  const slots: SlotFile['slots'] = [cachedSlots[0], cachedSlots[1], cachedSlots[2]];
  slots[index] = state;
  writeFile({ slots });
}

export function clearSlot(index: SlotIndex): void {
  ensureHydrated();
  const slots: SlotFile['slots'] = [cachedSlots[0], cachedSlots[1], cachedSlots[2]];
  slots[index] = null;
  writeFile({ slots });
  if (getActiveSlot() === index) storage()?.removeItem(ACTIVE_KEY);
}

export function clearSave(): void {
  const store = storage();
  store?.removeItem(SLOTS_KEY);
  store?.removeItem(ACTIVE_KEY);
  store?.removeItem(SAVE_KEY);
  cachedSlots = EMPTY_SLOTS;
  hydrated = true;
  notify();
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
