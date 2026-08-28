// Keyboard ownership when the glass or bag is open. Phaser reads this on the 60fps
// path; React writes it. No EventBus key — BusEvents is frozen.

let bagOpen = false;
let hotbarSlot = 0;

export function setBagOpen(open: boolean): void {
  bagOpen = open;
}

export function isBagOpen(): boolean {
  return bagOpen;
}

export function getHotbarSlot(): number {
  return hotbarSlot;
}

export function setHotbarSlot(slot: number): void {
  hotbarSlot = ((slot % 3) + 3) % 3;
}

export function cycleHotbar(dir: 1 | -1): number {
  setHotbarSlot(hotbarSlot + dir);
  return hotbarSlot;
}

/**
 * True when arrows / Space / WASD must not move or swing: the player is typing in
 * the Pane, clicking a choice, or looking at the bag.
 */
export function isWorldInputBlocked(): boolean {
  if (bagOpen) return true;
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el === document.body || el.tagName === 'CANVAS') return false;
  return Boolean(el.closest('[data-pane], [data-hud]'));
}
