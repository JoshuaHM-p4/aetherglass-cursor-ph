// Live mixer. Defaults live in const.ts; this module is the only writer.
// window is touched only inside hydrate/persist (AGENTS.md #7).

import { MUSIC_VOLUME, SFX_VOLUME } from '../const';

const KEY = 'aetherglass.volume.v1';

export type VolumeLevels = { sfx: number; music: number };
export const DEFAULT_VOLUME: VolumeLevels = { sfx: SFX_VOLUME, music: MUSIC_VOLUME };

let sfx = SFX_VOLUME;
let music = MUSIC_VOLUME;
let snapshot: VolumeLevels = { sfx, music };
let hydrated = false;
const listeners = new Set<() => void>();
const musicSinks = new Set<(volume: number) => void>();

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const raw = storage()?.getItem(KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<VolumeLevels>;
    if (typeof parsed.sfx === 'number') sfx = clamp(parsed.sfx);
    if (typeof parsed.music === 'number') music = clamp(parsed.music);
    snapshot = { sfx, music };
  } catch {
    /* keep defaults */
  }
}

function persist(): void {
  storage()?.setItem(KEY, JSON.stringify({ sfx, music }));
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function getSfxVolume(): number {
  hydrate();
  return sfx;
}

export function getMusicVolume(): number {
  hydrate();
  return music;
}

export function getVolumeLevels(): VolumeLevels {
  hydrate();
  return snapshot;
}

export function setSfxVolume(next: number): void {
  hydrate();
  sfx = clamp(next);
  snapshot = { sfx, music };
  persist();
  notify();
}

export function setMusicVolume(next: number): void {
  hydrate();
  music = clamp(next);
  snapshot = { sfx, music };
  persist();
  musicSinks.forEach((fn) => fn(music));
  notify();
}

export function resetVolume(): void {
  setSfxVolume(SFX_VOLUME);
  setMusicVolume(MUSIC_VOLUME);
}

/** Phaser and the title loop register here so the slider can retune whatever is playing. */
export function bindMusicVolume(fn: (volume: number) => void): () => void {
  musicSinks.add(fn);
  return () => musicSinks.delete(fn);
}

export function subscribeVolume(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
