/**
 * Visual-only player hit: decaying whole-pixel jitter. Phaser applies this as a
 * one-frame offset and subtracts it before the next contact test so physics never
 * integrates the shake. No Phaser import — the 60fps path stays testable.
 */
export function hurtShakeOffset(
  elapsedMs: number,
  durationMs: number,
  amp: number,
): { x: number; y: number } {
  if (elapsedMs < 0 || elapsedMs >= durationMs) return { x: 0, y: 0 };
  const decay = 1 - elapsedMs / durationMs;
  return {
    x: Math.round(Math.sin(elapsedMs * 0.85) * amp * decay),
    y: Math.round(Math.cos(elapsedMs * 1.15) * (amp - 1) * decay),
  };
}
