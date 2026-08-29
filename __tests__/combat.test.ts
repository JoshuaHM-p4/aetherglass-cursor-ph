import { describe, expect, it } from 'vitest';
import { swingHitbox } from '../game/systems/hitbox';
import { hurtShakeOffset } from '../game/systems/hurtFx';
import { slashAlpha, swingAngle, swingLunge, swingProgress } from '../game/systems/swingFx';

describe('swingHitbox', () => {
  it('faces right as a 1xN strip in front of the player', () => {
    expect(swingHitbox(5, 5, 'right', 1)).toEqual({ tx: 6, ty: 5, w: 1, h: 1 });
  });
  it('faces left from the far edge of the reach', () => {
    expect(swingHitbox(5, 5, 'left', 2)).toEqual({ tx: 3, ty: 5, w: 2, h: 1 });
  });
  it('faces down', () => {
    expect(swingHitbox(5, 5, 'down', 1)).toEqual({ tx: 5, ty: 6, w: 1, h: 1 });
  });
  it('faces up', () => {
    expect(swingHitbox(5, 5, 'up', 1)).toEqual({ tx: 5, ty: 4, w: 1, h: 1 });
  });
});

describe('hurtShakeOffset', () => {
  it('is still at the start and after the window', () => {
    expect(hurtShakeOffset(-1, 260, 3)).toEqual({ x: 0, y: 0 });
    expect(hurtShakeOffset(260, 260, 3)).toEqual({ x: 0, y: 0 });
  });

  it('returns whole pixels that decay toward zero', () => {
    const early = hurtShakeOffset(20, 260, 3);
    const late = hurtShakeOffset(250, 260, 3);
    expect(Number.isInteger(early.x) && Number.isInteger(early.y)).toBe(true);
    expect(Math.abs(late.x) + Math.abs(late.y)).toBeLessThanOrEqual(
      Math.abs(early.x) + Math.abs(early.y) + 1,
    );
    expect(Math.abs(early.x)).toBeLessThanOrEqual(3);
  });
});

describe('swing pose', () => {
  it('progress is 0 before the swing and 1 after', () => {
    expect(swingProgress(-1, 220)).toBe(0);
    expect(swingProgress(0, 220)).toBe(0);
    expect(swingProgress(220, 220)).toBe(1);
    expect(swingProgress(400, 220)).toBe(1);
  });

  it('sweeps the blade across the facing arc', () => {
    const start = swingAngle('right', 0);
    const mid = swingAngle('right', 0.5);
    const end = swingAngle('right', 1);
    expect(mid).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(mid);
    expect(swingAngle('left', 1)).toBeLessThan(swingAngle('left', 0));
  });

  it('lunges whole pixels toward the swing and rests at the ends', () => {
    expect(swingLunge('right', 0)).toEqual({ x: 0, y: 0 });
    expect(swingLunge('right', 1)).toEqual({ x: 0, y: 0 });
    const mid = swingLunge('right', 0.35);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.y).toBe(0);
    expect(Number.isInteger(mid.x)).toBe(true);
    expect(swingLunge('left', 0.35).x).toBeLessThan(0);
  });

  it('fades the slash in and out', () => {
    expect(slashAlpha(0)).toBe(0);
    expect(slashAlpha(0.3)).toBe(1);
    expect(slashAlpha(1)).toBe(0);
  });
});
