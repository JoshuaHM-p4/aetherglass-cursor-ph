import { describe, expect, it } from 'vitest';
import { sanitizePlayerName } from '../lib/client/playerName';
import { APPEARANCES, appearanceOf, isAppearanceId } from '../lib/sim/appearances';
import { initialState } from '../lib/sim/reducer';

describe('player identity', () => {
  it('initialState has a default name and look', () => {
    const state = initialState();
    expect(state.player.name).toBe('wanderer');
    expect(state.player.appearance).toBe('wanderer');
  });

  it('closed appearance list stays Kenney full-body tiles', () => {
    expect(APPEARANCES.map((a) => a.id)).toEqual([
      'wanderer',
      'wright',
      'violet',
      'squire',
      'mage',
      'hood',
    ]);
    expect(isAppearanceId('wanderer')).toBe(true);
    expect(isAppearanceId('slime')).toBe(false);
    expect(appearanceOf('nope').id).toBe('wanderer');
  });

  it('sanitizePlayerName trims and caps', () => {
    expect(sanitizePlayerName('  ash   walker  ')).toBe('ash walker');
    expect(sanitizePlayerName('abcdefghijklmnop')).toBe('abcdefghijkl');
    expect(sanitizePlayerName('   ')).toBe('');
  });
});
