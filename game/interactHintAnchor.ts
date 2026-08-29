// Overlay CSS pixels for the Enter-interact plaque. Phaser writes, React reads.
// Same pattern as playerAnchor — a fact with duration, not a bus moment.

export interface InteractHintAnchor {
  visible: boolean;
  x: number;
  y: number;
  name: string;
}

const hidden: InteractHintAnchor = { visible: false, x: 0, y: 0, name: '' };

let hint: InteractHintAnchor = hidden;
const listeners = new Set<() => void>();

export function setInteractHintAnchor(next: InteractHintAnchor): void {
  const same =
    hint.visible === next.visible &&
    hint.x === next.x &&
    hint.y === next.y &&
    hint.name === next.name;
  if (same) return;
  hint = next;
  listeners.forEach((fn) => fn());
}

export function readInteractHintAnchor(): InteractHintAnchor {
  return hint;
}

export function subscribeInteractHint(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function hideInteractHint(): void {
  setInteractHintAnchor(hidden);
}
