import { beforeEach, describe, expect, it } from 'vitest';
import { initialState } from '../lib/sim/reducer';
import { instantiate } from '../lib/sim/registry';
import { craftableNow, findRecipesFor } from '../lib/sim/recipes';
import { gameStore } from '../lib/sim/store';

describe('applyVerdict', () => {
  beforeEach(() => {
    gameStore.getState().hydrate(initialState());
  });

  it('applied: a live-legal proposal commits', () => {
    const state = structuredClone(gameStore.getState().state);
    state.player.tx = 3;
    gameStore.setState({ state });
    const outcome = gameStore.getState().applyVerdict({
      key: 't1:0',
      action: { type: 'OPEN_CONTAINER', entityId: 'chest_plain' },
      ok: true,
    });
    expect(outcome.status).toBe('applied');
    expect(gameStore.getState().state.entities.chest_plain.state).toBe('open');
  });

  it('duplicate: the same key applies at most once', () => {
    const state = structuredClone(gameStore.getState().state);
    state.player.tx = 3;
    gameStore.setState({ state });
    const proposal = {
      key: 't1:1',
      action: { type: 'OPEN_CONTAINER', entityId: 'chest_plain' } as const,
      ok: true,
    };
    expect(gameStore.getState().applyVerdict(proposal).status).toBe('applied');
    expect(gameStore.getState().applyVerdict(proposal).status).toBe('duplicate');
  });

  it('refused: a server-rejected proposal does not mutate', () => {
    const hp = gameStore.getState().state.player.hp;
    const outcome = gameStore.getState().applyVerdict({
      key: 't1:2',
      action: { type: 'GRANT_ITEM', itemId: 'sword_legendary', fromEntityId: 'chest_plain' },
      ok: false,
      reason: 'no_such_item',
    });
    expect(outcome).toEqual({ status: 'refused', reason: 'no_such_item' });
    expect(gameStore.getState().state.player.hp).toBe(hp);
  });

  it('diverged: live world moved, action is dropped', () => {
    const unlocked = structuredClone(gameStore.getState().state);
    unlocked.player.tx = 3;
    gameStore.setState({ state: unlocked });
    gameStore.getState().dispatch({ type: 'OPEN_CONTAINER', entityId: 'chest_plain' }, 'keyboard');
    const outcome = gameStore.getState().applyVerdict({
      key: 't1:3',
      action: { type: 'OPEN_CONTAINER', entityId: 'chest_plain' },
      ok: true,
    });
    expect(outcome.status).toBe('diverged');
    if (outcome.status === 'diverged') expect(outcome.reason).toBe('already_open');
  });
});

describe('recipes stub', () => {
  it('suggest_craft can name dim_draught when ingredients are held', () => {
    const state = initialState();
    state.player.bag.push(instantiate('mushroom_foul'), instantiate('ore_iron'));
    const now = craftableNow(state);
    expect(now.map((r) => r.id)).toEqual(['dim_draught']);
    expect(findRecipesFor(state, ['ore_iron']).map((r) => r.id)).toEqual(['dim_draught']);
  });
});
