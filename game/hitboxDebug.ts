// Hitbox overlay flag. React writes, Phaser reads. No Phaser import (AGENTS.md #7).

let visible = false;

export function isHitboxDebug(): boolean {
  return visible;
}

export function setHitboxDebug(on: boolean): void {
  visible = on;
}

export function toggleHitboxDebug(): boolean {
  visible = !visible;
  return visible;
}
