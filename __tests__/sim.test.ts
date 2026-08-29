import { describe, expect, it } from 'vitest';
import { applyAction, applyBatch, initialState } from '../lib/sim/reducer';
import { instantiate, ITEM_REGISTRY } from '../lib/sim/registry';
import { BAG_SLOTS } from '../lib/sim/select';

describe('sim failure modes', () => {
  it('open a locked chest → locked', () => {
    const state = initialState();
    const result = applyAction(state, { type: 'OPEN_CONTAINER', entityId: 'chest_lockbox' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('locked');
    expect(result.state).toBe(state);
  });

  it('open a chest twice → already_open', () => {
    const state = initialState();
    state.player.tx = 3;
    const first = applyAction(state, { type: 'OPEN_CONTAINER', entityId: 'chest_plain' });
    expect(first.ok).toBe(true);
    const second = applyAction(first.state, { type: 'OPEN_CONTAINER', entityId: 'chest_plain' });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('already_open');
  });

  it('pry with the crowbar → ok + item_gained', () => {
    const state = initialState();
    state.player.bag.push(instantiate('crowbar'));
    const unlocked = applyAction(state, {
      type: 'UNLOCK',
      entityId: 'chest_lockbox',
      withItemId: 'crowbar',
    });
    expect(unlocked.ok).toBe(true);
    const opened = applyAction(unlocked.state, {
      type: 'OPEN_CONTAINER',
      entityId: 'chest_lockbox',
    });
    expect(opened.ok).toBe(true);
    expect(opened.events).toContainEqual({ type: 'item_gained', itemId: 'crowbar' });
  });

  it('pry with the mushroom → wrong_tool', () => {
    const state = initialState();
    state.player.bag.push(instantiate('mushroom_foul'));
    const result = applyAction(state, {
      type: 'UNLOCK',
      entityId: 'chest_lockbox',
      withItemId: 'mushroom_foul',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('wrong_tool');
  });

  it('grant an item not in contents → not_in_contents', () => {
    const state = initialState();
    const result = applyAction(state, {
      type: 'GRANT_ITEM',
      itemId: 'potion_dim',
      fromEntityId: 'chest_plain',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_in_contents');
  });

  it('grant an unregistered id → no_such_item', () => {
    const state = initialState();
    const result = applyAction(state, {
      type: 'GRANT_ITEM',
      itemId: 'sword_legendary',
      fromEntityId: 'chest_plain',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_such_item');
  });

  it('grant into a full bag → bag_full', () => {
    const state = initialState();
    state.player.tx = 3;
    while (state.player.bag.length < BAG_SLOTS) {
      state.player.bag.push(instantiate('crowbar'));
    }
    const result = applyAction(state, {
      type: 'GRANT_ITEM',
      itemId: 'torch_stub',
      fromEntityId: 'chest_plain',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bag_full');
  });

  it('SET_HOTBAR parks a held item and clears a slot', () => {
    const state = initialState();
    state.player.bag.push(instantiate('crowbar'));
    const parked = applyAction(state, { type: 'SET_HOTBAR', slot: 1, itemId: 'crowbar' });
    expect(parked.ok).toBe(true);
    expect(parked.state.player.hotbar).toEqual(['wooden_sword', 'crowbar', null]);
    const cleared = applyAction(parked.state, { type: 'SET_HOTBAR', slot: 0, itemId: null });
    expect(cleared.ok).toBe(true);
    expect(cleared.state.player.hotbar).toEqual([null, 'crowbar', null]);
  });

  it('SET_HOTBAR moves an equipped item instead of duplicating it', () => {
    const state = initialState();
    state.player.bag.push(instantiate('crowbar'));
    const first = applyAction(state, { type: 'SET_HOTBAR', slot: 1, itemId: 'crowbar' });
    const moved = applyAction(first.state, { type: 'SET_HOTBAR', slot: 2, itemId: 'crowbar' });
    expect(moved.ok).toBe(true);
    expect(moved.state.player.hotbar).toEqual(['wooden_sword', null, 'crowbar']);
    const ontoSword = applyAction(moved.state, { type: 'SET_HOTBAR', slot: 0, itemId: 'crowbar' });
    expect(ontoSword.state.player.hotbar).toEqual(['crowbar', null, null]);
  });

  it('SET_HOTBAR rejects an item that is not in the bag', () => {
    const state = initialState();
    const result = applyAction(state, { type: 'SET_HOTBAR', slot: 2, itemId: 'crowbar' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_in_bag');
  });

  it('SWAP_BAG exchanges two occupied cells', () => {
    const state = initialState();
    state.player.bag.push(instantiate('crowbar'));
    const result = applyAction(state, { type: 'SWAP_BAG', a: 0, b: 1 });
    expect(result.ok).toBe(true);
    expect(result.state.player.bag.map((item) => item.id)).toEqual(['crowbar', 'wooden_sword']);
  });

  it('CONSUME_ITEM clears matching hotbar refs', () => {
    const state = initialState();
    const result = applyAction(state, { type: 'CONSUME_ITEM', itemId: 'wooden_sword' });
    expect(result.ok).toBe(true);
    expect(result.state.player.bag).toEqual([]);
    expect(result.state.player.hotbar).toEqual([null, null, null]);
  });

  it('HEAL then CONSUME_ITEM for potion_red', () => {
    const state = initialState();
    state.player.hp = 2;
    state.player.bag.push(instantiate('potion_red'));
    const healed = applyAction(state, { type: 'HEAL', amount: 6 });
    expect(healed.ok).toBe(true);
    expect(healed.state.player.hp).toBe(6);
    const drunk = applyAction(healed.state, { type: 'CONSUME_ITEM', itemId: 'potion_red' });
    expect(drunk.ok).toBe(true);
    expect(drunk.state.player.bag.some((item) => item.id === 'potion_red')).toBe(false);
  });

  it('DAMAGE that empties hp emits player_died', () => {
    const state = initialState();
    state.player.hp = 3;
    const result = applyAction(state, { type: 'DAMAGE', amount: 4, source: 'slime' });
    expect(result.ok).toBe(true);
    expect(result.state.player.hp).toBe(0);
    expect(result.events).toContainEqual({ type: 'player_died', source: 'slime' });
  });

  it('DAMAGE on a corpse → already_dead', () => {
    const state = initialState();
    state.player.hp = 1;
    const dead = applyAction(state, { type: 'DAMAGE', amount: 4, source: 'slime' });
    expect(dead.ok).toBe(true);
    const again = applyAction(dead.state, { type: 'DAMAGE', amount: 1, source: 'slime' });
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('already_dead');
  });

  it('STRIKE_ENTITY reaches three tiles away', () => {
    const state = initialState();
    state.entities.dummy_slime = {
      id: 'dummy_slime',
      kind: 'enemy',
      name: 'cave slime',
      tags: ['slime', 'foul'],
      state: 'idle',
      tx: state.player.tx + 3,
      ty: state.player.ty,
      roomId: state.player.roomId,
      hp: 3,
      hpMax: 3,
    };
    const result = applyAction(state, {
      type: 'STRIKE_ENTITY',
      entityId: 'dummy_slime',
      amount: 1,
      withItemId: null,
    });
    expect(result.ok).toBe(true);
  });

  it('STRIKE_ENTITY misses four tiles away', () => {
    const state = initialState();
    state.entities.dummy_slime = {
      id: 'dummy_slime',
      kind: 'enemy',
      name: 'cave slime',
      tags: ['slime', 'foul'],
      state: 'idle',
      tx: state.player.tx + 4,
      ty: state.player.ty,
      roomId: state.player.roomId,
      hp: 3,
      hpMax: 3,
    };
    const result = applyAction(state, {
      type: 'STRIKE_ENTITY',
      entityId: 'dummy_slime',
      amount: 1,
      withItemId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_nearby');
  });

  it('STRIKE_ENTITY with a bolt item reaches its travel distance', () => {
    const state = initialState();
    state.player.bag.push(instantiate('staff'));
    state.entities.dummy_slime = {
      id: 'dummy_slime',
      kind: 'enemy',
      name: 'cave slime',
      tags: ['slime', 'foul'],
      state: 'idle',
      tx: state.player.tx + 6,
      ty: state.player.ty,
      roomId: state.player.roomId,
      hp: 3,
      hpMax: 3,
    };
    const result = applyAction(state, {
      type: 'STRIKE_ENTITY',
      entityId: 'dummy_slime',
      amount: 2,
      withItemId: 'staff',
    });
    expect(result.ok).toBe(true);
  });

  it('STRIKE_ENTITY with a bolt item misses beyond travel', () => {
    const state = initialState();
    state.player.bag.push(instantiate('staff'));
    state.entities.dummy_slime = {
      id: 'dummy_slime',
      kind: 'enemy',
      name: 'cave slime',
      tags: ['slime', 'foul'],
      state: 'idle',
      tx: state.player.tx + 9,
      ty: state.player.ty,
      roomId: state.player.roomId,
      hp: 3,
      hpMax: 3,
    };
    const result = applyAction(state, {
      type: 'STRIKE_ENTITY',
      entityId: 'dummy_slime',
      amount: 2,
      withItemId: 'staff',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_nearby');
  });

  it('applyBatch with a bad second effect → nothing applied', () => {
    const state = initialState();
    const hp = state.player.hp;
    const result = applyBatch(state, [
      { type: 'HEAL', amount: 2 },
      { type: 'GRANT_ITEM', itemId: 'sword_legendary', fromEntityId: 'chest_plain' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.state.player.hp).toBe(hp);
  });
});

describe('item registry', () => {
  it('keeps iron sword combat stats', () => {
    expect(ITEM_REGISTRY.sword_short.stats).toMatchObject({
      damage: 2,
      reach: 1,
      cooldownMs: 260,
      swingMs: 180,
      cone: 1.16,
      knock: 1,
    });
  });

  it('registers weapons, shields, and potions', () => {
    const ids = [
      'wooden_sword',
      'sword_short',
      'saber',
      'knife',
      'hammer',
      'axe',
      'staff',
      'pole',
      'shield_wood',
      'shield_iron',
      'potion_dim',
      'potion_red',
      'potion_blue',
      'potion_green',
    ];
    for (const id of ids) {
      expect(ITEM_REGISTRY[id], id).toBeTruthy();
    }
    expect(ITEM_REGISTRY.potion_red.stats?.heal).toBe(6);
    expect(ITEM_REGISTRY.shield_iron.kind).toBe('shield');
    expect(ITEM_REGISTRY.staff.tags).toContain('arcane');
    expect(ITEM_REGISTRY.staff.tags).toContain('bolt');
  });
});

describe('enemy drops', () => {
  it('killing a rat grants its pre-rolled contents', () => {
    const state = initialState();
    state.entities.rat_test = {
      id: 'rat_test',
      kind: 'enemy',
      name: 'cave rat',
      tags: ['rat', 'passive', 'drops'],
      state: 'idle',
      tx: state.player.tx + 1,
      ty: state.player.ty,
      roomId: state.player.roomId,
      hp: 1,
      hpMax: 1,
      contents: ['ore_iron'],
    };
    const result = applyAction(state, {
      type: 'STRIKE_ENTITY',
      entityId: 'rat_test',
      amount: 1,
      withItemId: null,
    });
    expect(result.ok).toBe(true);
    expect(result.state.entities.rat_test.state).toBe('dead');
    expect(result.events).toContainEqual({ type: 'item_gained', itemId: 'ore_iron' });
    expect(result.state.player.bag.some((item) => item.id === 'ore_iron')).toBe(true);
  });

  it('killing a cyclops grants its potion', () => {
    const state = initialState();
    state.entities.cyclops_test = {
      id: 'cyclops_test',
      kind: 'enemy',
      name: 'door cyclops',
      tags: ['cyclops', 'heavy', 'drops'],
      state: 'idle',
      tx: state.player.tx + 1,
      ty: state.player.ty,
      roomId: state.player.roomId,
      hp: 1,
      hpMax: 1,
      contents: ['potion_red'],
    };
    const result = applyAction(state, {
      type: 'STRIKE_ENTITY',
      entityId: 'cyclops_test',
      amount: 1,
      withItemId: null,
    });
    expect(result.ok).toBe(true);
    expect(result.events).toContainEqual({ type: 'item_gained', itemId: 'potion_red' });
    expect(result.state.player.bag.some((item) => item.id === 'potion_red')).toBe(true);
  });
});
