// Whether the title overlay is up. Phaser stays mounted; the Overworld pauses.
// window is never touched. The bus carries the moment; this module carries the fact.

import { bus } from '../../game/EventBus';

let playing = false;
const listeners = new Set<() => void>();

export function isPlaying(): boolean {
  return playing;
}

export function subscribePlaying(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setPlaying(next: boolean): void {
  if (playing === next) return;
  playing = next;
  listeners.forEach((fn) => fn());
  bus.emit('menu:playing', { playing });
}
