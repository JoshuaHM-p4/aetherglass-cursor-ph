import { describe, expect, it } from 'vitest';
import { swingHitbox } from '../game/systems/hitbox';
import { hurtShakeOffset } from '../game/systems/hurtFx';

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
