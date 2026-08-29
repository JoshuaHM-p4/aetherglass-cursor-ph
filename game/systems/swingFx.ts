/**
 * Sword-swing pose. Phaser applies the lunge the same way as hurt-shake: add in
 * postupdate, subtract in preupdate, so arcade never integrates it. No Phaser
 * import — the 60fps path stays testable.
 */
import type { Facing } from '../../lib/sim/types';

export const SWING_FX = {
  durationMs: 220,
  lungePx: 2,
} as const;

const ANGLE: Record<Facing, { start: number; end: number }> = {
  right: { start: -80, end: 120 },
  left: { start: 80, end: -120 },
  down: { start: 15, end: 165 },
  up: { start: -15, end: -165 },
};

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function easeOut(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function swingProgress(elapsedMs: number, durationMs: number = SWING_FX.durationMs): number {
  return clamp01(elapsedMs / durationMs);
}

/** Blade angle in degrees. The sword texture points up at 0. */
export function swingAngle(facing: Facing, t: number): number {
  const { start, end } = ANGLE[facing];
  return start + (end - start) * easeOut(clamp01(t));
}

export function swingLunge(
  facing: Facing,
  t: number,
  amp = SWING_FX.lungePx,
): { x: number; y: number } {
  const p = clamp01(t);
  if (p <= 0 || p >= 1) return { x: 0, y: 0 };
  const envelope = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
  const px = Math.round(amp * envelope);
  if (facing === 'right') return { x: px, y: 0 };
  if (facing === 'left') return { x: -px, y: 0 };
  if (facing === 'down') return { x: 0, y: px };
  return { x: 0, y: -px };
}

/** Grip, relative to the scavenger's sprite centre. */
export function swordHand(facing: Facing): { x: number; y: number } {
  if (facing === 'right') return { x: 5, y: 2 };
  if (facing === 'left') return { x: -5, y: 2 };
  if (facing === 'down') return { x: 3, y: 5 };
  return { x: 3, y: -3 };
}

export function slashPlace(facing: Facing): { x: number; y: number; angle: number } {
  if (facing === 'right') return { x: 8, y: 1, angle: 0 };
  if (facing === 'left') return { x: -8, y: 1, angle: 180 };
  if (facing === 'down') return { x: 1, y: 8, angle: 90 };
  return { x: 1, y: -8, angle: -90 };
}

export function slashAlpha(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  if (t < 0.12) return t / 0.12;
  if (t < 0.55) return 1;
  return 1 - (t - 0.55) / 0.45;
}
