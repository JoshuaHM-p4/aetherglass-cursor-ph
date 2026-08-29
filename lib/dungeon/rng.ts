// Mulberry32. State lives on GameState.dungeon.rng so save/load is deterministic.

export interface Rng {
  state: number;
}

export function seedRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Advance and return [0, 1). */
export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(rng: Rng, p: number): boolean {
  return nextFloat(rng) < p;
}

export function nextInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(nextFloat(rng) * (hi - lo + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(nextFloat(rng) * items.length)]!;
}

/** Fisher–Yates. Returns a new array; does not mutate `items`. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
  }
  return next;
}
