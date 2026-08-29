// lib/dungeon/generate.ts
//
// Pure, seedable, no Phaser/React. The reducer calls this from ENTER_PASSAGE commit
// and from initialState. Every keyed lock places a key in a room that is already
// reachable without that lock.

import {
  ALL_FACINGS,
  ARRIVAL_TILE,
  CAVE_CAP,
  CRAB_ID,
  EXIT_TILE,
  FOUNTAIN_ENTITY_ID,
  FOUNTAIN_PROP,
  FOUNTAIN_ROOM_ID,
  FOUNTAIN_SPAWN,
  GHOST_ID,
  GRID_DELTA,
  MASTER_ROOM_ID,
  OPPOSITE,
  ROOM_SIZE,
  doorId,
  roomIdAt,
} from './const';
import { chance, nextInt, pick, seedRng, type Rng } from './rng';
import type {
  DungeonState,
  Entity,
  Facing,
  GameState,
  Passage,
  PassageLock,
  Room,
} from '../sim/types';

const INTERIOR_LO = 2;
const INTERIOR_HI = ROOM_SIZE - 3;

function emptyExits(): Room['exits'] {
  return { up: null, down: null, left: null, right: null };
}

function ghostExists(state: GameState): boolean {
  return Boolean(state.dungeon.ghostId && state.entities[state.dungeon.ghostId]);
}

function occupiedTiles(state: GameState, roomId: string): Set<string> {
  const used = new Set<string>();
  used.add(`${FOUNTAIN_SPAWN.tx},${FOUNTAIN_SPAWN.ty}`);
  used.add(`${ARRIVAL_TILE.up.tx},${ARRIVAL_TILE.up.ty}`);
  used.add(`${ARRIVAL_TILE.down.tx},${ARRIVAL_TILE.down.ty}`);
  used.add(`${ARRIVAL_TILE.left.tx},${ARRIVAL_TILE.left.ty}`);
  used.add(`${ARRIVAL_TILE.right.tx},${ARRIVAL_TILE.right.ty}`);
  for (const entity of Object.values(state.entities)) {
    if (entity.roomId !== roomId) continue;
    used.add(`${entity.tx},${entity.ty}`);
  }
  return used;
}

function randomInterior(rng: Rng, used: Set<string>): { tx: number; ty: number } | null {
  for (let i = 0; i < 24; i++) {
    const tx = nextInt(rng, INTERIOR_LO, INTERIOR_HI);
    const ty = nextInt(rng, INTERIOR_LO, INTERIOR_HI);
    const key = `${tx},${ty}`;
    if (used.has(key)) continue;
    used.add(key);
    return { tx, ty };
  }
  return null;
}

function placeDoor(state: GameState, room: Room, dir: Facing, lock: PassageLock): void {
  if (lock === 'open') return;
  const tile = EXIT_TILE[dir];
  const id = doorId(room.id, dir);
  state.entities[id] = {
    id,
    kind: 'door',
    name: lock === 'master' ? 'master door' : 'locked door',
    tags: lock === 'master' ? ['master_lock'] : ['locked', 'key'],
    state: 'idle',
    tx: tile.tx,
    ty: tile.ty,
    roomId: room.id,
    locked: true,
    paneWorthy: lock === 'master',
    seed: lock === 'master' ? 'the lock is older than the wall' : 'a common lock, a common hunger',
  };
}

function addChest(
  state: GameState,
  roomId: string,
  rng: Rng,
  used: Set<string>,
  contents: string[],
  wood: boolean,
): Entity | null {
  const pos = randomInterior(rng, used);
  if (!pos) return null;
  const n = Object.values(state.entities).filter((e) => e.kind === 'container' && e.roomId === roomId).length;
  const id = `chest_${roomId}_${n}`;
  const entity: Entity = {
    id,
    kind: 'container',
    name: wood ? 'splintered crate' : 'stone chest',
    tags: wood ? ['wood'] : ['stone'],
    state: 'idle',
    tx: pos.tx,
    ty: pos.ty,
    roomId,
    contents,
    paneWorthy: true,
    seed: wood ? 'the slats remember a cellar' : 'cold iron bands',
  };
  state.entities[id] = entity;
  return entity;
}

function addFloorPickup(
  state: GameState,
  roomId: string,
  rng: Rng,
  used: Set<string>,
  itemId: string,
  name: string,
): void {
  const pos = randomInterior(rng, used);
  if (!pos) {
    const chest = Object.values(state.entities).find(
      (e) => e.kind === 'container' && e.roomId === roomId,
    );
    if (chest) {
      chest.contents = [...(chest.contents ?? []), itemId];
    }
    return;
  }
  const n = Object.values(state.entities).filter((e) => e.tags.includes('pickup') && e.roomId === roomId).length;
  const id = `loot_${roomId}_${n}`;
  state.entities[id] = {
    id,
    kind: 'container',
    name,
    tags: ['pickup', itemId],
    state: 'idle',
    tx: pos.tx,
    ty: pos.ty,
    roomId,
    contents: [itemId],
    paneWorthy: false,
  };
}

function addSlime(state: GameState, roomId: string, rng: Rng, used: Set<string>): void {
  if (state.dungeon.rooms[roomId]?.kind === 'fountain') return;
  const pos = randomInterior(rng, used);
  if (!pos) return;
  const n = Object.values(state.entities).filter((e) => e.tags.includes('slime') && e.roomId === roomId).length;
  const id = `slime_${roomId}_${n}`;
  state.entities[id] = {
    id,
    kind: 'enemy',
    name: 'cave slime',
    tags: ['slime', 'foul'],
    state: 'idle',
    tx: pos.tx,
    ty: pos.ty,
    roomId,
    hp: 3,
    hpMax: 3,
  };
}

function addSpider(state: GameState, roomId: string, rng: Rng, used: Set<string>): void {
  if (state.dungeon.rooms[roomId]?.kind === 'fountain') return;
  const pos = randomInterior(rng, used);
  if (!pos) return;
  const n = Object.values(state.entities).filter((e) => e.tags.includes('spider') && e.roomId === roomId).length;
  const id = `spider_${roomId}_${n}`;
  state.entities[id] = {
    id,
    kind: 'enemy',
    name: 'ceiling spider',
    tags: ['spider'],
    state: 'idle',
    tx: pos.tx,
    ty: pos.ty,
    roomId,
    hp: 2,
    hpMax: 2,
    seed: 'the floor-stain is not a stain',
  };
}

const BAT_PACK_CAP = 3;

function addBatPack(state: GameState, roomId: string, rng: Rng, used: Set<string>): void {
  if (state.dungeon.rooms[roomId]?.kind === 'fountain') return;
  const live = Object.values(state.entities).filter(
    (e) => e.tags.includes('bat') && e.roomId === roomId && e.state !== 'dead',
  ).length;
  const want = Math.min(BAT_PACK_CAP - live, nextInt(rng, 2, 3));
  for (let i = 0; i < want; i++) {
    const pos = randomInterior(rng, used);
    if (!pos) return;
    const n = Object.values(state.entities).filter((e) => e.tags.includes('bat') && e.roomId === roomId).length;
    const id = `bat_${roomId}_${n}`;
    state.entities[id] = {
      id,
      kind: 'enemy',
      name: 'cave bat',
      tags: ['bat', 'ethereal'],
      state: 'idle',
      tx: pos.tx,
      ty: pos.ty,
      roomId,
      hp: 2,
      hpMax: 2,
    };
  }
}

const RAT_DROPS = ['torch_stub', 'mushroom_foul', 'ore_iron', 'potion_dim'] as const;

function addRat(state: GameState, roomId: string, rng: Rng, used: Set<string>): void {
  if (state.dungeon.rooms[roomId]?.kind === 'fountain') return;
  const pos = randomInterior(rng, used);
  if (!pos) return;
  const n = Object.values(state.entities).filter((e) => e.tags.includes('rat') && e.roomId === roomId).length;
  const id = `rat_${roomId}_${n}`;
  const contents = chance(rng, 0.45) ? [pick(rng, RAT_DROPS)] : [];
  state.entities[id] = {
    id,
    kind: 'enemy',
    name: 'cave rat',
    tags: ['rat', 'passive', 'drops'],
    state: 'idle',
    tx: pos.tx,
    ty: pos.ty,
    roomId,
    hp: 1,
    hpMax: 1,
    contents,
  };
}

function addCyclops(state: GameState, roomId: string, dir: Facing, used: Set<string>): void {
  if (state.dungeon.rooms[roomId]?.kind !== 'cave') return;
  const exit = EXIT_TILE[dir];
  let tx = exit.tx;
  let ty = exit.ty;
  if (dir === 'up') ty = 2;
  else if (dir === 'down') ty = ROOM_SIZE - 3;
  else if (dir === 'left') tx = 2;
  else tx = ROOM_SIZE - 3;
  const key = `${tx},${ty}`;
  if (used.has(key)) return;
  used.add(key);
  const id = `cyclops_${roomId}`;
  if (state.entities[id]) return;
  state.entities[id] = {
    id,
    kind: 'enemy',
    name: 'door cyclops',
    tags: ['cyclops', 'heavy'],
    state: 'idle',
    tx,
    ty,
    roomId,
    hp: 8,
    hpMax: 8,
    paneWorthy: true,
    seed: 'it keeps the master lock company',
  };
}

function addGhost(state: GameState, roomId: string, rng: Rng, used: Set<string>): void {
  if (state.dungeon.rooms[roomId]?.kind === 'fountain') return;
  const pos = randomInterior(rng, used) ?? { tx: 6, ty: 6 };
  used.add(`${pos.tx},${pos.ty}`);
  state.entities[GHOST_ID] = {
    id: GHOST_ID,
    kind: 'enemy',
    name: 'pale ghost',
    tags: ['ghost', 'ethereal'],
    state: 'idle',
    tx: pos.tx,
    ty: pos.ty,
    roomId,
    hp: 4,
    hpMax: 4,
    paneWorthy: true,
    seed: 'it does not respect the walls',
  };
  state.dungeon.ghostId = GHOST_ID;
}

function stashKey(state: GameState, roomId: string, rng: Rng): void {
  const chests = Object.values(state.entities).filter(
    (e) => e.kind === 'container' && e.roomId === roomId && !e.tags.includes('pickup'),
  );
  if (chests.length > 0) {
    const chest = pick(rng, chests);
    chest.contents = [...(chest.contents ?? []), 'key'];
  } else {
    const used = occupiedTiles(state, roomId);
    const chest = addChest(state, roomId, rng, used, ['key'], true);
    if (!chest) {
      addFloorPickup(state, roomId, rng, used, 'key', 'iron key');
    }
  }
  state.dungeon.keysPlaced += 1;
}

function stashMasterKey(state: GameState, roomId: string, rng: Rng): void {
  const used = occupiedTiles(state, roomId);
  const chests = Object.values(state.entities).filter(
    (e) => e.kind === 'container' && e.roomId === roomId && !e.tags.includes('pickup'),
  );
  if (chests.length > 0) {
    const chest = pick(rng, chests);
    chest.contents = [...(chest.contents ?? []), 'master_key'];
  } else {
    addFloorPickup(state, roomId, rng, used, 'master_key', 'master key');
  }
  state.dungeon.masterKeyPlaced = true;
}

function openPassage(to: string | null, lock: PassageLock = 'open'): Passage {
  return { to, lock };
}

/**
 * Place a keyed or master lock on `room.exits[dir]`. A keyed lock immediately
 * stashes one `key` in `keyRoomId` (already reachable; never behind this lock).
 */
function lockExit(
  state: GameState,
  room: Room,
  dir: Facing,
  lock: PassageLock,
  keyRoomId: string,
  rng: Rng,
): void {
  room.exits[dir] = openPassage(null, lock);
  placeDoor(state, room, dir, lock);
  if (lock === 'key') {
    state.dungeon.lockedDoorCount += 1;
    stashKey(state, keyRoomId, rng);
  }
  if (lock === 'master') {
    state.dungeon.masterDoorRoomId = room.id;
  }
}

function closeDanglingOpens(state: GameState): void {
  for (const room of Object.values(state.dungeon.rooms)) {
    for (const dir of ALL_FACINGS) {
      const passage = room.exits[dir];
      if (!passage || passage.to !== null || passage.lock === 'master') continue;
      if (passage.lock === 'key') {
        delete state.entities[doorId(room.id, dir)];
      }
      room.exits[dir] = null;
    }
  }
}

function rollExtraExits(
  state: GameState,
  room: Room,
  arrivedFrom: Facing,
  rng: Rng,
): void {
  const remaining = ALL_FACINGS.filter((d) => d !== arrivedFrom);
  const atCap = state.dungeon.caveCount >= state.dungeon.cap;
  if (atCap) {
    if (!state.dungeon.masterDoorRoomId) {
      lockExit(state, room, remaining[0]!, 'master', room.id, rng);
    }
    return;
  }

  let rolledMaster = false;

  for (const dir of remaining) {
    if (!chance(rng, 0.5)) continue;
    let lock: PassageLock = 'open';
    if (!state.dungeon.masterDoorRoomId && !rolledMaster && chance(rng, 0.05)) {
      lock = 'master';
      rolledMaster = true;
    } else if (chance(rng, 0.28)) {
      lock = 'key';
    }
    lockExit(state, room, dir, lock, room.id, rng);
  }
}

function rollLoot(state: GameState, roomId: string, rng: Rng): void {
  const used = occupiedTiles(state, roomId);
  const heart = chance(rng, 0.1);
  if (chance(rng, 0.4)) {
    const contents: string[] = [];
    if (heart) contents.push('heart_container');
    else {
      const commons = [
        'torch_stub',
        'mushroom_foul',
        'ore_iron',
        'potion_dim',
        'potion_red',
        'wooden_sword',
      ] as const;
      const rares = ['axe', 'hammer', 'sword_short'] as const;
      if (chance(rng, 0.1)) contents.push(pick(rng, rares));
      else if (chance(rng, 0.55)) contents.push(pick(rng, commons));
    }
    addChest(state, roomId, rng, used, contents, chance(rng, 0.45));
  } else if (heart) {
    addFloorPickup(state, roomId, rng, used, 'heart_container', 'heart container');
  }

  if (chance(rng, 0.5)) addSlime(state, roomId, rng, used);
  if (chance(rng, 0.38)) addSpider(state, roomId, rng, used);
  if (chance(rng, 0.32)) addBatPack(state, roomId, rng, used);
  if (chance(rng, 0.28)) addRat(state, roomId, rng, used);

  if (!ghostExists(state) && chance(rng, 0.15)) addGhost(state, roomId, rng, used);

  if (!state.dungeon.masterKeyPlaced) {
    if (state.dungeon.masterDoorRoomId) {
      stashMasterKey(state, roomId, rng);
    } else if (chance(rng, 0.05)) {
      stashMasterKey(state, roomId, rng);
    }
  }
}

function generateMasterRoom(state: GameState, fromRoomId: string, arrivedFrom: Facing): Room {
  const from = state.dungeon.rooms[fromRoomId]!;
  const travel = OPPOSITE[arrivedFrom];
  const d = GRID_DELTA[travel];
  const room: Room = {
    id: MASTER_ROOM_ID,
    kind: 'master',
    gx: from.gx + d.gx,
    gy: from.gy + d.gy,
    exits: emptyExits(),
  };
  room.exits[arrivedFrom] = openPassage(fromRoomId, 'open');
  state.dungeon.rooms[room.id] = room;
  state.entities[CRAB_ID] = {
    id: CRAB_ID,
    kind: 'elite',
    name: 'dungeon crab',
    tags: ['crab', 'elite', 'boss'],
    state: 'idle',
    tx: 6,
    ty: 6,
    roomId: room.id,
    hp: 16,
    hpMax: 16,
    paneWorthy: true,
    seed: 'it waits in the heart of the stone',
  };
  return room;
}

function generateCave(state: GameState, fromRoomId: string, travel: Facing, rng: Rng): Room {
  const from = state.dungeon.rooms[fromRoomId]!;
  const d = GRID_DELTA[travel];
  const gx = from.gx + d.gx;
  const gy = from.gy + d.gy;
  const id = roomIdAt(gx, gy);
  const existing = state.dungeon.rooms[id];
  if (existing) return existing;

  const arrivedFrom = OPPOSITE[travel];
  const room: Room = {
    id,
    kind: 'cave',
    gx,
    gy,
    exits: emptyExits(),
  };
  room.exits[arrivedFrom] = openPassage(fromRoomId, 'open');
  state.dungeon.rooms[id] = room;
  state.dungeon.caveCount += 1;

  rollLoot(state, id, rng);
  rollExtraExits(state, room, arrivedFrom, rng);
  const masterDir = ALL_FACINGS.find((dir) => room.exits[dir]?.lock === 'master');
  if (masterDir) addCyclops(state, id, masterDir, occupiedTiles(state, id));
  if (state.dungeon.caveCount >= state.dungeon.cap) closeDanglingOpens(state);
  return room;
}

/**
 * Carve the neighbor through `fromRoom.exits[dir]` if it does not exist yet,
 * then link both sides. Mutates `state` (the reducer clone).
 */
export function ensureNeighbor(state: GameState, fromRoomId: string, dir: Facing): Room {
  const from = state.dungeon.rooms[fromRoomId];
  if (!from) throw new Error(`ensureNeighbor: missing room ${fromRoomId}`);
  const passage = from.exits[dir];
  if (!passage) throw new Error(`ensureNeighbor: no passage ${fromRoomId} ${dir}`);
  if (passage.to) {
    const dest = state.dungeon.rooms[passage.to];
    if (!dest) throw new Error(`ensureNeighbor: dangling to ${passage.to}`);
    return dest;
  }

  const rng = seedRng(state.dungeon.rng);
  const dest =
    passage.lock === 'master'
      ? generateMasterRoom(state, fromRoomId, OPPOSITE[dir])
      : generateCave(state, fromRoomId, dir, rng);
  state.dungeon.rng = rng.state;

  passage.to = dest.id;
  const reverse = OPPOSITE[dir];
  const back = dest.exits[reverse];
  if (!back) dest.exits[reverse] = openPassage(fromRoomId, 'open');
  else back.to = fromRoomId;
  return dest;
}

export function bootFountain(seed: number): {
  dungeon: DungeonState;
  entities: Record<string, Entity>;
  player: { roomId: string; tx: number; ty: number };
} {
  const rng = seedRng(seed);
  const fountain: Room = {
    id: FOUNTAIN_ROOM_ID,
    kind: 'fountain',
    gx: 0,
    gy: 0,
    exits: emptyExits(),
  };
  fountain.exits.up = openPassage(null, 'open');

  const dungeon: DungeonState = {
    seed,
    rng: rng.state,
    rooms: { [FOUNTAIN_ROOM_ID]: fountain },
    cap: CAVE_CAP,
    masterDoorRoomId: null,
    masterKeyPlaced: false,
    lockedDoorCount: 0,
    keysPlaced: 0,
    caveCount: 0,
    ghostId: null,
  };

  const entities: Record<string, Entity> = {
    [FOUNTAIN_ENTITY_ID]: {
      id: FOUNTAIN_ENTITY_ID,
      kind: 'prop',
      name: 'aether fountain',
      tags: ['fountain', 'arcane', 'light'],
      state: 'idle',
      tx: FOUNTAIN_PROP.tx,
      ty: FOUNTAIN_PROP.ty,
      roomId: FOUNTAIN_ROOM_ID,
      paneWorthy: true,
      seed: 'the glass remembers this well',
    },
    chest_lockbox: {
      id: 'chest_lockbox',
      kind: 'container',
      name: 'rusted lockbox',
      tags: ['sealed', 'iron'],
      state: 'idle',
      tx: 5,
      ty: 6,
      roomId: FOUNTAIN_ROOM_ID,
      locked: true,
      contents: ['crowbar', 'ore_iron'],
      paneWorthy: true,
      seed: 'a cold draft comes from the seam',
    },
    chest_plain: {
      id: 'chest_plain',
      kind: 'container',
      name: 'splintered crate',
      tags: ['wood'],
      state: 'idle',
      tx: 3,
      ty: 6,
      roomId: FOUNTAIN_ROOM_ID,
      contents: ['torch_stub'],
    },
  };

  return {
    dungeon,
    entities,
    player: { roomId: FOUNTAIN_ROOM_ID, tx: FOUNTAIN_SPAWN.tx, ty: FOUNTAIN_SPAWN.ty },
  };
}

/** Unspent keys in bag + unopened contents vs remaining keyed passages. */
export function keyInvariantHolds(state: GameState): boolean {
  let locked = 0;
  for (const room of Object.values(state.dungeon.rooms)) {
    for (const dir of ALL_FACINGS) {
      if (room.exits[dir]?.lock === 'key') locked += 1;
    }
  }
  let keys = 0;
  for (const item of state.player.bag) {
    if (item.id === 'key') keys += item.qty;
  }
  for (const entity of Object.values(state.entities)) {
    if (entity.state === 'open') continue;
    for (const id of entity.contents ?? []) {
      if (id === 'key') keys += 1;
    }
  }
  return keys >= locked && state.dungeon.keysPlaced + keysInBag(state) >= state.dungeon.lockedDoorCount;
}

function keysInBag(state: GameState): number {
  return state.player.bag.find((i) => i.id === 'key')?.qty ?? 0;
}
