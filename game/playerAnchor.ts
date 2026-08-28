// Screen position of the scavenger, in CSS pixels relative to the overlay.
// Phaser writes this each frame; the Pane reads it. No EventBus — this is a fact
// with duration (where the sprite is), not a moment.

export interface PlayerAnchor {
  x: number;
  y: number;
  /** +1 = glass sits to the character's right (their shoulder). */
  facing: 1 | -1;
}

let anchor: PlayerAnchor = { x: 0, y: 0, facing: 1 };

export function setPlayerAnchor(next: PlayerAnchor): void {
  anchor = next;
}

export function readPlayerAnchor(): PlayerAnchor {
  return anchor;
}

/** CSS box for the glass, on the scavenger's facing shoulder, clamped to the overlay. */
export function paneBoxBesidePlayer(
  a: PlayerAnchor,
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  opts?: { gap?: number; pad?: number },
): { left: number; top: number } {
  const gap = opts?.gap ?? 28;
  const pad = opts?.pad ?? 12;
  const maxL = Math.max(pad, viewport.w - size.w - pad);
  const maxT = Math.max(pad, viewport.h - size.h - pad);
  let left = a.facing >= 0 ? a.x + gap : a.x - gap - size.w;
  if (left > maxL) left = a.x - gap - size.w;
  if (left < pad) left = a.x + gap;
  left = Math.min(Math.max(pad, left), maxL);
  const top = Math.min(Math.max(pad, a.y - size.h * 0.62), maxT);
  return { left, top };
}

/** World pixel -> overlay-local CSS pixel, accounting for FIT letterboxing and camera zoom. */
export function worldToOverlay(
  worldX: number,
  worldY: number,
  args: {
    viewX: number;
    viewY: number;
    viewW: number;
    viewH: number;
    canvasLeft: number;
    canvasTop: number;
    canvasW: number;
    canvasH: number;
    overlayLeft: number;
    overlayTop: number;
  },
): { x: number; y: number } {
  const sx = args.viewW === 0 ? 0 : (worldX - args.viewX) / args.viewW;
  const sy = args.viewH === 0 ? 0 : (worldY - args.viewY) / args.viewH;
  return {
    x: args.canvasLeft - args.overlayLeft + sx * args.canvasW,
    y: args.canvasTop - args.overlayTop + sy * args.canvasH,
  };
}
