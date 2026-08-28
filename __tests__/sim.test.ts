import { describe, expect, it } from 'vitest';
import { applyAction, applyBatch, initialState } from '../lib/sim/reducer';
import { instantiate } from '../lib/sim/registry';
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
