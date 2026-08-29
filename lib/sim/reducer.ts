// lib/sim/reducer.ts
//
// The only place state changes. Pure, synchronous, framework-free.
//
// SHAPE: every case is `check` then `commit`. There is no `if` in the commit phase —
// if you find yourself testing a precondition below the `check` call, the guard in
// rules.ts is incomplete and that is where the test belongs. This split is what makes
// `GameStore.applyVerdict` possible: it can ask `check` alone, without committing.
//
// IDEMPOTENCY: not all actions are naturally idempotent (`DAMAGE` twice is 2x damage),
// and we do not pretend otherwise. Idempotency is enforced one level up, at the
// verdict boundary, where every pane-origin action carries a `${turnId}:${seq}` key
// that is applied at most once. See lib/sim/store.ts. The rule of thumb: actions
// arriving from the keyboard are user intent and SHOULD apply twice if pressed twice;
// actions arriving from the Pane are a replay of a decision already made and must not.

import { ARRIVAL_TILE, CRAB_ID, FOUNTAIN_ROOM_ID, FOUNTAIN_SPAWN, facingFromDoorId } from '../dungeon/const';
import { bootFountain, ensureNeighbor } from '../dungeon/generate';
import { recipe } from './recipes';
import { instantiate } from './registry';
import { check, LIMITS, QUEST_FLAGS } from './rules';
import { findItem } from './select';
import type { Action, ActionResult, GameState, Item, SimEvent } from './types';

/**
 * Validate, then apply. Never throws. On rejection returns the *same state object*
 * (referentially identical, so a store `set` is a no-op) plus a reason the model can
 * read aloud.
 *
 * The reason strings are a feature: `already_open` becomes "You have already emptied
 * it. I am not going to pretend otherwise." — ARCHITECTURE §2.
 */
export function applyAction(state: GameState, action: Action): ActionResult {
  const verdict = check(state, action);
  if (!verdict.ok) return { state, ok: false, reason: verdict.reason, events: [] };
  const next = structuredClone(state);
  const events = commit(next, action);
  appendLog(next, events);
  return { state: next, ok: true, events };
}

/**
 * Apply a sequence as one transaction. All-or-nothing: if any action's guard fails,
 * the whole batch is rejected and state is untouched.
 *
 * Caller: `apply_effect`, which takes 1-3 effects. Without this, the Pane could
 * half-apply "you take 2 damage and gain the ore" — narrating a trade where only the
 * cost landed. Atomicity here is the difference between a bug the judges see and one
 * they don't.
 */
export function applyBatch(state: GameState, actions: readonly Action[]): ActionResult {
  let working = state;
  const events: SimEvent[] = [];
  for (const action of actions) {
    const step = applyAction(working, action);
    if (!step.ok) return { state, ok: false, reason: step.reason, events: [] };
    working = step.state;
    events.push(...step.events);
  }
  return { state: working, ok: true, events };
}

/** Newest last, capped. `ContextPacket.recentEvents` is the tail of this. */
export const LOG_CAP = 20;

function appendLog(state: GameState, events: readonly SimEvent[]): void {
  for (const event of events) {
    state.log.push(describeEvent(state, event));
  }
  if (state.log.length > LOG_CAP) {
    state.log.splice(0, state.log.length - LOG_CAP);
  }
}

function gainHeart(state: GameState): SimEvent {
  state.player.hpMax += 2;
  state.player.hp += 2;
  return { type: 'heart_gained', hpMax: state.player.hpMax };
}

function grant(state: GameState, itemId: string, qty: number): SimEvent[] {
  if (itemId === 'heart_container') {
    return [gainHeart(state), { type: 'item_gained', itemId }];
  }
  const existing = findItem(state, itemId);
  if (existing?.stackable) {
    existing.qty += qty;
    return [{ type: 'item_gained', itemId }];
  }
  state.player.bag.push(instantiate(itemId, qty));
  return [{ type: 'item_gained', itemId }];
}

function consume(state: GameState, itemId: string, qty: number): void {
  const existing = findItem(state, itemId)!;
  existing.qty -= qty;
  if (existing.qty <= 0) {
    state.player.bag = state.player.bag.filter((item) => item !== existing);
    state.player.hotbar = state.player.hotbar.map((id) => (id === itemId ? null : id)) as typeof state.player.hotbar;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function commit(state: GameState, action: Action): SimEvent[] {
  switch (action.type) {
    case 'MOVE': {
      state.player.tx = action.tx;
      state.player.ty = action.ty;
      state.player.facing = action.facing;
      return [];
    }
    case 'DAMAGE': {
      const amount = clamp(action.amount, 0, LIMITS.damagePerEffect);
      const before = state.player.hp;
      state.player.hp = Math.max(0, state.player.hp - amount);
      const events: SimEvent[] = [{ type: 'damaged', amount, source: action.source }];
      if (before > 0 && state.player.hp <= 0) {
        events.push({ type: 'player_died', source: action.source });
      }
      return events;
    }
    case 'HEAL': {
      const amount = clamp(action.amount, 0, LIMITS.healPerEffect);
      const before = state.player.hp;
      state.player.hp = Math.min(state.player.hpMax, state.player.hp + amount);
      return [{ type: 'healed', amount: state.player.hp - before }];
    }
    case 'GRANT_ITEM': {
      const qty = action.qty ?? 1;
      return grant(state, action.itemId, qty);
    }
    case 'CONSUME_ITEM': {
      const qty = action.qty ?? 1;
      consume(state, action.itemId, qty);
      return [{ type: 'item_lost', itemId: action.itemId }];
    }
    case 'OPEN_CONTAINER': {
      const entity = state.entities[action.entityId];
      entity.state = 'open';
      const loot = entity.contents ?? [];
      const events: SimEvent[] = [{ type: 'container_opened', entityId: entity.id }];
      for (const itemId of loot) {
        events.push(...grant(state, itemId, 1));
      }
      return events;
    }
    case 'UNLOCK': {
      const entity = state.entities[action.entityId];
      entity.locked = false;
      entity.state = 'unlocked';
      const spendsKey =
        entity.tags.includes('master_lock') ||
        entity.tags.includes('key') ||
        action.withItemId === 'key' ||
        action.withItemId === 'master_key';
      const events: SimEvent[] = [
        { type: 'entity_state_changed', entityId: entity.id, state: 'unlocked' },
      ];
      if (spendsKey) {
        consume(state, action.withItemId, 1);
        events.push({ type: 'item_lost', itemId: action.withItemId });
      }
      const dir = facingFromDoorId(entity.id);
      if (dir) {
        const passage = state.dungeon.rooms[entity.roomId]?.exits[dir];
        if (passage) passage.lock = 'open';
      }
      return events;
    }
    case 'CRAFT': {
      const rec = recipe(action.recipeId)!;
      for (const [id, qty] of Object.entries(rec.inputs)) consume(state, id, qty);
      void grant(state, rec.output, rec.outputQty);
      return [{ type: 'crafted', recipeId: rec.id, itemId: rec.output }];
    }
    case 'SET_FLAG': {
      state.flags[action.flag] = action.value;
      return [{ type: 'flag_set', flag: action.flag, value: action.value }];
    }
    case 'SET_ENTITY_STATE': {
      const entity = state.entities[action.entityId];
      entity.state = action.state;
      return [{ type: 'entity_state_changed', entityId: entity.id, state: action.state }];
    }
    case 'DAMAGE_PANE': {
      state.player.paneIntegrity = clamp(state.player.paneIntegrity - action.amount, 0, 100);
      return [{ type: 'pane_cracked', integrity: state.player.paneIntegrity }];
    }
    case 'STRIKE_ENTITY': {
      const entity = state.entities[action.entityId];
      const amount = clamp(action.amount, 0, LIMITS.damagePerEffect);
      entity.hp = Math.max(0, (entity.hp ?? 0) - amount);
      const events: SimEvent[] = [
        { type: 'entity_struck', entityId: entity.id, amount, hpLeft: entity.hp },
      ];
      if (entity.hp <= 0) {
        entity.state = 'dead';
        events.push({ type: 'entity_state_changed', entityId: entity.id, state: 'dead' });
        if (entity.id === CRAB_ID) {
          state.flags.boss_dead = true;
          events.push({ type: 'flag_set', flag: 'boss_dead', value: true });
        }
      }
      return events;
    }
    case 'SET_HOTBAR': {
      state.player.hotbar = state.player.hotbar.map((id, i) => {
        if (i === action.slot) return action.itemId;
        if (action.itemId !== null && id === action.itemId) return null;
        return id;
      }) as typeof state.player.hotbar;
      return [];
    }
    case 'SWAP_BAG': {
      const bag = state.player.bag;
      const tmp = bag[action.a]!;
      bag[action.a] = bag[action.b]!;
      bag[action.b] = tmp;
      return [];
    }
    case 'ENTER_PASSAGE': {
      const dest = ensureNeighbor(state, state.player.roomId, action.dir);
      state.player.roomId = dest.id;
      const spawn = ARRIVAL_TILE[action.dir];
      state.player.tx = spawn.tx;
      state.player.ty = spawn.ty;
      state.player.facing = action.dir;
      return [{ type: 'room_entered', roomId: dest.id, kind: dest.kind }];
    }
    case 'GAIN_HEART': {
      return [gainHeart(state)];
    }
    case 'MOVE_ENTITY': {
      const entity = state.entities[action.entityId];
      entity.roomId = action.roomId;
      entity.tx = action.tx;
      entity.ty = action.ty;
      return [{ type: 'entity_moved', entityId: entity.id, roomId: action.roomId, tx: action.tx, ty: action.ty }];
    }
    case 'RETURN_FOUNTAIN': {
      state.player.roomId = FOUNTAIN_ROOM_ID;
      state.player.tx = FOUNTAIN_SPAWN.tx;
      state.player.ty = FOUNTAIN_SPAWN.ty;
      state.player.facing = 'down';
      if (action.refillHp) state.player.hp = state.player.hpMax;
      return [
        { type: 'returned_fountain' },
        { type: 'room_entered', roomId: FOUNTAIN_ROOM_ID, kind: 'fountain' },
      ];
    }
  }
}

/**
 * SimEvent -> one terse past-tense line ("opened the rusted lockbox", "took 2 damage
 * from the slime"). This is the sim's own voice, not the Pane's; the Pane reads these
 * lines as facts it must not contradict.
 */
export function describeEvent(state: GameState, event: SimEvent): string {
  const named = (id: string) => state.entities[id]?.name ?? id;
  switch (event.type) {
    case 'container_opened':
      return `opened the ${named(event.entityId)}`;
    case 'item_gained':
      return `gained ${event.itemId}`;
    case 'item_lost':
      return `lost ${event.itemId}`;
    case 'damaged':
      return `took ${event.amount} damage from the ${event.source}`;
    case 'healed':
      return `healed ${event.amount}`;
    case 'entity_state_changed':
      return `${named(event.entityId)} is ${event.state}`;
    case 'crafted':
      return `crafted ${event.itemId}`;
    case 'flag_set':
      return `${event.flag} set to ${event.value}`;
    case 'pane_cracked':
      return `the pane cracked (${event.integrity})`;
    case 'entity_struck':
      return `struck the ${named(event.entityId)} for ${event.amount}`;
    case 'player_died':
      return `fell to the ${event.source}`;
    case 'room_entered':
      return `entered ${event.kind} ${event.roomId}`;
    case 'heart_gained':
      return `gained a heart container (${event.hpMax})`;
    case 'entity_moved':
      return `${named(event.entityId)} moved`;
    case 'returned_fountain':
      return 'returned to the fountain';
  }
}

/** Seeded fountain. Tests pass a fixed seed; a hard reset rolls a new one. */
export const DEFAULT_SEED = 0xa37e11;

export function initialState(seed: number = DEFAULT_SEED): GameState {
  const boot = bootFountain(seed);
  const sword: Item = instantiate('sword_short');
  return {
    player: {
      hp: 6,
      hpMax: 6,
      paneIntegrity: 100,
      roomId: boot.player.roomId,
      tx: boot.player.tx,
      ty: boot.player.ty,
      facing: 'down',
      bag: [sword],
      hotbar: ['sword_short', null, null],
    },
    dungeon: boot.dungeon,
    entities: boot.entities,
    flags: Object.fromEntries(QUEST_FLAGS.map((flag) => [flag, false])),
    log: [],
    ui: { interactTargetId: null, paneOpen: false, bagOpen: false },
  };
}
