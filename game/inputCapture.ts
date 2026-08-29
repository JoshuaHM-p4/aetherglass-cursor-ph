// Keyboard ownership when the glass or bag is open. Phaser reads this on the 60fps
// path; React writes it. No EventBus key — BusEvents is frozen.

import { isPlaying } from '../lib/client/play';
import { world } from '../lib/sim/store';

let bagOpen = false;
let settingsOpen = false;
let hotbarSlot = 0;
/** True while the glass is holding the keyboard (focused speak field or thinking). */
let paneTyping = false;

export function setBagOpen(open: boolean): void {
  bagOpen = open;
}

export function setSettingsOpen(open: boolean): void {
  settingsOpen = open;
}

export function setPaneTyping(on: boolean): void {
  paneTyping = on;
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
 * the Pane, clicking a choice, looking at the bag, or has fallen.
 */
/** True while a room wipe is swapping the 12×12. */
let roomWiping = false;

export function setRoomWiping(on: boolean): void {
  roomWiping = on;
}

export function isWorldInputBlocked(): boolean {
  if (!isPlaying()) return true;
  if (roomWiping) return true;
  if (world().player.hp <= 0) return true;
  if (bagOpen || settingsOpen || paneTyping) return true;
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el === document.body || el.tagName === 'CANVAS') return false;
  return Boolean(el.closest('[data-pane], [data-hud]'));
}
