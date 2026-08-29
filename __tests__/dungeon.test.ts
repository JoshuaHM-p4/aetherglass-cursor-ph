import { describe, expect, it } from 'vitest';
import { ALL_FACINGS, EXIT_TILE, FOUNTAIN_ROOM_ID } from '../lib/dungeon/const';
import { keyInvariantHolds } from '../lib/dungeon/generate';
import { applyAction, initialState } from '../lib/sim/reducer';
import type { Facing, GameState } from '../lib/sim/types';
import { isPaneInteractable, pickAdjacentEntity } from '../game/systems/interactTarget';

function enter(state: GameState, dir: Facing) {
  const edge = EXIT_TILE[dir];
  const moved = applyAction(state, { type: 'MOVE', facing: dir, tx: edge.tx, ty: edge.ty });
  expect(moved.ok).toBe(true);
  return applyAction(moved.state, { type: 'ENTER_PASSAGE', dir });
}

function explore(seed: number, steps: number): GameState {
  let state = initialState(seed);
  const visited = new Set<string>([state.player.roomId]);
  for (let i = 0; i < steps; i++) {
    const room = state.dungeon.rooms[state.player.roomId];
    if (!room) break;
    let taken: Facing | null = null;
    for (const dir of ALL_FACINGS) {
      const passage = room.exits[dir];
      if (!passage || passage.lock !== 'open') continue;
      if (passage.to && visited.has(passage.to)) continue;
      taken = dir;
      break;
    }
    if (!taken) {
      for (const dir of ALL_FACINGS) {
        const passage = room.exits[dir];
        if (passage?.lock === 'open') {
          taken = dir;
          break;
        }
      }
    }
    if (!taken) break;
    const result = enter(state, taken);
    if (!result.ok) break;
    state = result.state;
    visited.add(state.player.roomId);
    expect(keyInvariantHolds(state), `seed ${seed} after ${visited.size} rooms`).toBe(true);
  }
  return state;
}

describe('dungeon generation', () => {
  it('boots a fountain with no enemies', () => {
    const state = initialState(1);
    const foes = Object.values(state.entities).filter(
      (e) => e.kind === 'enemy' || e.kind === 'elite',
    );
    expect(foes).toHaveLength(0);
  });

  it('ghost cannot move into the fountain', () => {
    const carved = enter(initialState(7), 'up').state;
    carved.entities.ghost_01 = {
      id: 'ghost_01',
      kind: 'enemy',
      name: 'pale ghost',
      tags: ['ghost', 'ethereal'],
      state: 'idle',
      tx: 6,
      ty: 6,
      roomId: carved.player.roomId,
      hp: 4,
      hpMax: 4,
    };
    const result = applyAction(carved, {
      type: 'MOVE_ENTITY',
      entityId: 'ghost_01',
      roomId: FOUNTAIN_ROOM_ID,
      tx: 6,
      ty: 6,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_nearby');
  });

  it('boots a fountain with a north opening and the scavenger below it', () => {
    const state = initialState(1);
    expect(state.player.roomId).toBe(FOUNTAIN_ROOM_ID);
    expect(state.player).toMatchObject({ tx: 6, ty: 6 });
    const room = state.dungeon.rooms[FOUNTAIN_ROOM_ID];
    expect(room?.kind).toBe('fountain');
    expect(room?.exits.up?.lock).toBe('open');
    expect(room?.exits.down).toBeNull();
    expect(state.entities.fountain_00?.paneWorthy).toBe(true);
  });

  it('picks the fountain for an Aetherglass hint when facing it', () => {
    const state = initialState(1);
    const target = pickAdjacentEntity(state, 'up', isPaneInteractable);
    expect(target?.id).toBe('fountain_00');
  });

  it('ENTER_PASSAGE carves a cave and lands the player on the opposite interior tile', () => {
    const result = enter(initialState(7), 'up');
    expect(result.ok).toBe(true);
    expect(result.state.player.roomId).not.toBe(FOUNTAIN_ROOM_ID);
    expect(result.state.player).toMatchObject({ tx: 6, ty: 10 });
    expect(result.state.dungeon.rooms[result.state.player.roomId]?.kind).toBe('cave');
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'room_entered', kind: 'cave' }),
    );
  });

  it('never places a ghost or slime in the fountain across many seeds', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const state = explore(seed, 28);
      for (const entity of Object.values(state.entities)) {
        if (entity.kind !== 'enemy' && entity.kind !== 'elite') continue;
        expect(entity.roomId, `${entity.id} seed ${seed}`).not.toBe(FOUNTAIN_ROOM_ID);
        expect(state.dungeon.rooms[entity.roomId]?.kind).not.toBe('fountain');
      }
    }
  });

  it('keeps a reachable key for every keyed lock across many seeds', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const state = explore(seed, 28);
      expect(keyInvariantHolds(state), `seed ${seed}`).toBe(true);
      expect(state.dungeon.caveCount).toBeLessThanOrEqual(state.dungeon.cap);
    }
  });

  it('forces a master door by the cave cap', () => {
    let found = false;
    for (let seed = 1; seed <= 40; seed++) {
      const state = explore(seed, 40);
      if (state.dungeon.masterDoorRoomId) {
        found = true;
        const room = state.dungeon.rooms[state.dungeon.masterDoorRoomId];
        const master = ALL_FACINGS.some((d) => room?.exits[d]?.lock === 'master');
        expect(master).toBe(true);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('GAIN_HEART raises hpMax and hp by one container', () => {
    const state = initialState(1);
    const result = applyAction(state, { type: 'GAIN_HEART' });
    expect(result.ok).toBe(true);
    expect(result.state.player.hpMax).toBe(8);
    expect(result.state.player.hp).toBe(8);
  });

  it('GRANT of a heart_container does not occupy a bag slot', () => {
    const state = initialState(1);
    state.entities.chest_plain.contents = ['heart_container'];
    const bagLen = state.player.bag.length;
    const result = applyAction(state, {
      type: 'GRANT_ITEM',
      itemId: 'heart_container',
      fromEntityId: 'chest_plain',
    });
    expect(result.ok).toBe(true);
    expect(result.state.player.bag).toHaveLength(bagLen);
    expect(result.state.player.hpMax).toBe(8);
    expect(result.events).toContainEqual({ type: 'heart_gained', hpMax: 8 });
  });

  it('UNLOCK on a keyed door consumes one stackable key', () => {
    const state = initialState(1);
    const carved = enter(state, 'up').state;
    const door = Object.values(carved.entities).find(
      (e) => e.kind === 'door' && e.tags.includes('key') && e.locked,
    );
    if (!door) return;
    carved.player.bag.push({
      id: 'key',
      name: 'iron key',
      kind: 'key',
      tags: ['key'],
      qty: 1,
      stackable: true,
    });
    carved.player.tx = door.tx;
    carved.player.ty = door.ty;
    carved.player.roomId = door.roomId;
    const result = applyAction(carved, { type: 'UNLOCK', entityId: door.id, withItemId: 'key' });
    expect(result.ok).toBe(true);
    expect(result.state.player.bag.find((i) => i.id === 'key')).toBeUndefined();
    expect(result.state.entities[door.id]?.locked).toBe(false);
  });
});
