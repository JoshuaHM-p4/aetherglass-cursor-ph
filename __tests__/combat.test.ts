import { describe, expect, it } from 'vitest';
import { swingHitbox } from '../game/systems/hitbox';

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
