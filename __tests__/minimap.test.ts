import { describe, expect, it } from 'vitest';
import { EXIT_TILE, FOUNTAIN_ROOM_ID } from '../lib/dungeon/const';
import { applyAction, initialState } from '../lib/sim/reducer';
import { fillOf, minimapOf } from '../lib/sim/minimap';

describe('minimap', () => {
  it('boots with only the fountain, marked current and blue when left', () => {
    const state = initialState(1);
    const map = minimapOf(state);
    expect(map.rooms).toHaveLength(1);
    expect(map.rooms[0]?.id).toBe(FOUNTAIN_ROOM_ID);
    expect(map.rooms[0]?.fill).toBe('current');
    expect(map.tunnels).toHaveLength(0);
    expect(fillOf('fountain', false)).toBe('fountain');
    expect(fillOf('master', false)).toBe('master');
    expect(fillOf('cave', false)).toBe('cave');
  });

  it('adds a cave and a tunnel after walking north, and keeps the fountain', () => {
    const boot = initialState(1);
    const edge = EXIT_TILE.up;
    const atDoor = applyAction(boot, { type: 'MOVE', facing: 'up', tx: edge.tx, ty: edge.ty });
    expect(atDoor.ok).toBe(true);
    const next = applyAction(atDoor.state, { type: 'ENTER_PASSAGE', dir: 'up' });
    expect(next.ok).toBe(true);

    const map = minimapOf(next.state);
    expect(map.rooms).toHaveLength(2);
    const fountain = map.rooms.find((r) => r.id === FOUNTAIN_ROOM_ID);
    const cave = map.rooms.find((r) => r.id !== FOUNTAIN_ROOM_ID);
    expect(fountain?.fill).toBe('fountain');
    expect(cave?.fill).toBe('current');
    expect(map.tunnels).toHaveLength(1);
  });

  it('does not list a room that has not been entered', () => {
    const map = minimapOf(initialState(3));
    expect(map.rooms.every((r) => r.id === FOUNTAIN_ROOM_ID)).toBe(true);
  });
});
