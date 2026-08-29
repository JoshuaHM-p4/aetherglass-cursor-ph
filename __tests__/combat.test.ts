import { describe, expect, it } from 'vitest';
import { boltHits, boltRangePx, inEnemyContact, inSwingCone } from '../game/systems/hitbox';
import { contactDamage } from '../game/systems/foeContact';
import { foeVoiceCue, weaponUseCue } from '../game/systems/combatSfx';
import { hurtShakeOffset } from '../game/systems/hurtFx';
import { slashAlpha, swingAngle, swingLunge, swingProgress } from '../game/systems/swingFx';
import { dirFromTo, facingDir, knockSpeedAt } from '../game/systems/knockback';

describe('inSwingCone', () => {
  const ox = 80;
  const oy = 80;

  it('hits in front of the player', () => {
    expect(inSwingCone(ox, oy, ox + 20, oy, 'right', 1)).toBe(true);
    expect(inSwingCone(ox, oy, ox - 20, oy, 'left', 1)).toBe(true);
    expect(inSwingCone(ox, oy, ox, oy + 20, 'down', 1)).toBe(true);
    expect(inSwingCone(ox, oy, ox, oy - 20, 'up', 1)).toBe(true);
  });

  it('hits diagonally inside the swipe arc', () => {
    expect(inSwingCone(ox, oy, ox + 16, oy + 16, 'right', 1)).toBe(true);
    expect(inSwingCone(ox, oy, ox + 16, oy - 16, 'right', 1)).toBe(true);
  });

  it('misses behind, beside, and past the tip', () => {
    expect(inSwingCone(ox, oy, ox - 16, oy, 'right', 1)).toBe(false);
    expect(inSwingCone(ox, oy, ox, oy + 20, 'right', 1)).toBe(false);
    expect(inSwingCone(ox, oy, ox + 80, oy, 'right', 1)).toBe(false);
  });

  it('treats the enemy as a disk so a glancing centre still connects', () => {
    expect(inSwingCone(ox, oy, ox + 8, oy + 20, 'right', 1, 0)).toBe(false);
    expect(inSwingCone(ox, oy, ox + 8, oy + 20, 'right', 1)).toBe(true);
  });

  it('respects a passed narrow or wide half-angle', () => {
    expect(inSwingCone(ox, oy, ox + 20, oy + 18, 'right', 1, 0, 0.5)).toBe(false);
    expect(inSwingCone(ox, oy, ox + 20, oy + 18, 'right', 1, 0, 1.4)).toBe(true);
  });

  it('the cyclops cone is shorter and tighter than a player hammer', () => {
    expect(inSwingCone(ox, oy, ox + 16, oy, 'right', 1, 7, 0.55, 4)).toBe(true);
    expect(inSwingCone(ox, oy, ox + 16, oy + 18, 'right', 1, 7, 0.55, 4)).toBe(false);
    expect(inSwingCone(ox, oy, ox + 16, oy + 18, 'right', 1, 14, 1.4)).toBe(true);
  });
});

describe('inEnemyContact', () => {
  const px = 80;
  const py = 80;

  it('hurts when the equal 6px bodies are touching', () => {
    expect(inEnemyContact(px, py, px + 6, py)).toBe(true);
    expect(inEnemyContact(px, py, px, py + 6)).toBe(true);
  });

  it('does not hurt when the boxes are apart', () => {
    expect(inEnemyContact(px, py, px + 8, py)).toBe(false);
    expect(inEnemyContact(px, py, px + 12, py)).toBe(false);
    expect(inEnemyContact(px, py, px + 16, py)).toBe(false);
  });
});

describe('staff bolt', () => {
  it('travels reach tiles with no slash-tip padding', () => {
    expect(boltRangePx(6)).toBe(96);
    expect(boltRangePx(1)).toBe(16);
  });

  it('hits when the bolt disk overlaps the foe', () => {
    expect(boltHits(80, 80, 80, 80)).toBe(true);
    expect(boltHits(80, 80, 90, 80)).toBe(true);
    expect(boltHits(80, 80, 120, 80)).toBe(false);
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

describe('knockback', () => {
  it('pushes the victim away from the attacker', () => {
    expect(dirFromTo(0, 0, 10, 0)).toEqual({ x: 1, y: 0 });
    expect(dirFromTo(10, 0, 0, 0)).toEqual({ x: -1, y: 0 });
  });

  it('sends a sword hit along the swing', () => {
    expect(facingDir('right')).toEqual({ x: 1, y: 0 });
    expect(facingDir('left')).toEqual({ x: -1, y: 0 });
    expect(facingDir('up')).toEqual({ x: 0, y: -1 });
    expect(facingDir('down')).toEqual({ x: 0, y: 1 });
  });

  it('decays to zero over the window', () => {
    expect(knockSpeedAt(-1, 180, 200)).toBe(0);
    expect(knockSpeedAt(0, 180, 200)).toBe(200);
    expect(knockSpeedAt(90, 180, 200)).toBe(100);
    expect(knockSpeedAt(180, 180, 200)).toBe(0);
  });
});

describe('contactDamage', () => {
  it('is a half-heart for common biters and nothing for rats or cyclops', () => {
    expect(contactDamage({ tags: ['slime'] })).toBe(1);
    expect(contactDamage({ tags: ['spider'] })).toBe(1);
    expect(contactDamage({ tags: ['bat', 'ethereal'] })).toBe(1);
    expect(contactDamage({ tags: ['rat', 'passive', 'drops'] })).toBeNull();
    expect(contactDamage({ tags: ['cyclops', 'heavy'] })).toBeNull();
  });
});

describe('combat sfx cues', () => {
  it('picks thump, axe, and magic from tags', () => {
    expect(weaponUseCue({ tags: ['blunt', 'heavy'] })).toBe('thump');
    expect(weaponUseCue({ tags: ['sharp', 'heavy'] })).toBe('axe');
    expect(weaponUseCue({ tags: ['arcane', 'bolt'] })).toBe('magic');
    expect(weaponUseCue({ tags: ['sharp'] })).toBe('swing');
    expect(weaponUseCue(undefined)).toBe('swing');
  });

  it('names foe voices from tags', () => {
    expect(foeVoiceCue(['bat', 'ethereal'])).toBe('bat');
    expect(foeVoiceCue(['spider'])).toBe('spider');
    expect(foeVoiceCue(['slime', 'foul'])).toBe('slime');
    expect(foeVoiceCue(['cyclops', 'heavy'])).toBe('cyclops');
    expect(foeVoiceCue(['rat', 'passive', 'drops'])).toBe('rat');
    expect(foeVoiceCue(['ghost'])).toBeNull();
  });
});
