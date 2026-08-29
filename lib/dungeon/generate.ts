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
import { chance, nextInt, pick, seedRng, shuffle, type Rng } from './rng';
import type {
  DungeonState,
  Entity,
  Facing,
  GameState,
  Passage,
  PassageLock,
  Room,
} from '../sim/types';
import { ITEM_IDS } from '../sim/registry';

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

function neighborId(room: Room, dir: Facing): string {
  const d = GRID_DELTA[dir];
  return roomIdAt(room.gx + d.gx, room.gy + d.gy);
}

function isUncarved(state: GameState, room: Room, dir: Facing): boolean {
  return !state.dungeon.rooms[neighborId(room, dir)];
}

function shouldPlaceMaster(state: GameState, rng: Rng): boolean {
  if (state.dungeon.masterDoorRoomId) return false;
  const { caveCount, cap } = state.dungeon;
  if (caveCount >= cap - 2) return true;
  if (caveCount < 3) return false;
  return chance(rng, 0.08 + (caveCount / cap) * 0.3);
}

function placeMasterDoor(
  state: GameState,
  room: Room,
  arrivedFrom: Facing,
  growthDir: Facing | null,
  rng: Rng,
): void {
  if (state.dungeon.masterDoorRoomId) return;
  const sides = ALL_FACINGS.filter((d) => d !== arrivedFrom && d !== growthDir);
  const hole = sides.find((d) => room.exits[d] === null);
  if (hole) {
    lockExit(state, room, hole, 'master', room.id, rng);
    return;
  }
  const openSide = sides.find((d) => room.exits[d]?.lock === 'open');
  if (openSide) {
    lockExit(state, room, openSide, 'master', room.id, rng);
    return;
  }
  if (sides[0]) lockExit(state, room, sides[0], 'master', room.id, rng);
}

function rollExtraExits(
  state: GameState,
  room: Room,
  arrivedFrom: Facing,
  rng: Rng,
): void {
  const remaining = shuffle(
    rng,
    ALL_FACINGS.filter((d) => d !== arrivedFrom),
  );
  const atCap = state.dungeon.caveCount >= state.dungeon.cap;
  if (atCap) {
    placeMasterDoor(state, room, arrivedFrom, null, rng);
    return;
  }

  // Always keep one open hole into uncarved grid so the fountain cannot
  // dead-end as "hub plus a single cave". Prefer a wall that is not already a room.
  const uncarved = remaining.filter((d) => isUncarved(state, room, d));
  const growthDir = (uncarved[0] ?? remaining[0])!;
  lockExit(state, room, growthDir, 'open', room.id, rng);

  for (const dir of remaining) {
    if (dir === growthDir) continue;
    if (!chance(rng, 0.5)) continue;
    const lock: PassageLock = chance(rng, 0.28) ? 'key' : 'open';
    lockExit(state, room, dir, lock, room.id, rng);
  }

  if (shouldPlaceMaster(state, rng)) {
    placeMasterDoor(state, room, arrivedFrom, growthDir, rng);
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

/** New Game name that stamps the showcase gauntlet instead of a random cave. */
export const DEBUG_PLAYER_NAME = 'Papes';

export function isDebugPlayerName(name: string): boolean {
  return name.trim().toLowerCase() === DEBUG_PLAYER_NAME.toLowerCase();
}

function makeCave(state: GameState, gx: number, gy: number): Room {
  const id = roomIdAt(gx, gy);
  const room: Room = { id, kind: 'cave', gx, gy, exits: emptyExits() };
  state.dungeon.rooms[id] = room;
  state.dungeon.caveCount += 1;
  return room;
}

function linkOpen(a: Room, aDir: Facing, b: Room): void {
  a.exits[aDir] = openPassage(b.id, 'open');
  b.exits[OPPOSITE[aDir]] = openPassage(a.id, 'open');
}

function put(state: GameState, used: Set<string>, entity: Entity): void {
  used.add(`${entity.tx},${entity.ty}`);
  state.entities[entity.id] = entity;
}

function chestAt(
  state: GameState,
  used: Set<string>,
  roomId: string,
  tx: number,
  ty: number,
  contents: string[],
  wood: boolean,
  extra?: Partial<Pick<Entity, 'name' | 'tags' | 'locked' | 'seed' | 'paneWorthy'>>,
): Entity {
  const n = Object.values(state.entities).filter((e) => e.kind === 'container' && e.roomId === roomId).length;
  const entity: Entity = {
    id: `chest_${roomId}_${n}`,
    kind: 'container',
    name: extra?.name ?? (wood ? 'splintered crate' : 'stone chest'),
    tags: extra?.tags ?? (wood ? ['wood'] : ['stone']),
    state: 'idle',
    tx,
    ty,
    roomId,
    contents,
    paneWorthy: extra?.paneWorthy ?? true,
    locked: extra?.locked,
    seed: extra?.seed ?? (wood ? 'the slats remember a cellar' : 'cold iron bands'),
  };
  put(state, used, entity);
  return entity;
}

function placedItemIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const entity of Object.values(state.entities)) {
    for (const id of entity.contents ?? []) ids.add(id);
  }
  return ids;
}

/**
 * Fountain, three caves (every foe, container, door, shrine, and item), then the crab.
 * Call after `initialState` when the scavenger is named Papes. Does not grant into the bag.
 */
export function applyDebugDungeon(state: GameState): void {
  if (state.dungeon.rooms[MASTER_ROOM_ID]) return;

  const fountain = state.dungeon.rooms[FOUNTAIN_ROOM_ID];
  if (!fountain) return;

  const a = makeCave(state, 0, -1);
  const b = makeCave(state, 0, -2);
  const c = makeCave(state, 0, -3);

  linkOpen(fountain, 'up', a);
  linkOpen(a, 'up', b);

  b.exits.up = openPassage(c.id, 'key');
  placeDoor(state, b, 'up', 'key');
  c.exits.down = openPassage(b.id, 'open');
  state.dungeon.lockedDoorCount += 1;
  state.dungeon.keysPlaced += 1;

  c.exits.up = openPassage(null, 'master');
  placeDoor(state, c, 'up', 'master');
  state.dungeon.masterDoorRoomId = c.id;
  const master = generateMasterRoom(state, c.id, 'down');
  c.exits.up!.to = master.id;

  const usedA = occupiedTiles(state, a.id);
  put(state, usedA, {
    id: `slime_${a.id}_0`,
    kind: 'enemy',
    name: 'cave slime',
    tags: ['slime', 'foul'],
    state: 'idle',
    tx: 3,
    ty: 3,
    roomId: a.id,
    hp: 3,
    hpMax: 3,
  });
  put(state, usedA, {
    id: `spider_${a.id}_0`,
    kind: 'enemy',
    name: 'ceiling spider',
    tags: ['spider'],
    state: 'idle',
    tx: 8,
    ty: 3,
    roomId: a.id,
    hp: 2,
    hpMax: 2,
    seed: 'the floor-stain is not a stain',
  });
  put(state, usedA, {
    id: `rat_${a.id}_0`,
    kind: 'enemy',
    name: 'cave rat',
    tags: ['rat', 'passive', 'drops'],
    state: 'idle',
    tx: 3,
    ty: 8,
    roomId: a.id,
    hp: 1,
    hpMax: 1,
  });
  put(state, usedA, {
    id: GHOST_ID,
    kind: 'enemy',
    name: 'pale ghost',
    tags: ['ghost', 'ethereal'],
    state: 'idle',
    tx: 8,
    ty: 8,
    roomId: a.id,
    hp: 4,
    hpMax: 4,
    paneWorthy: true,
    seed: 'it does not respect the walls',
  });
  state.dungeon.ghostId = GHOST_ID;
  chestAt(state, usedA, a.id, 3, 5, [
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
    'crowbar',
  ], true);
  chestAt(state, usedA, a.id, 8, 5, [
    'potion_dim',
    'potion_red',
    'potion_blue',
    'potion_green',
    'mushroom_foul',
    'key',
    'key_brass',
  ], false);

  const usedB = occupiedTiles(state, b.id);
  for (let i = 0; i < 3; i++) {
    put(state, usedB, {
      id: `bat_${b.id}_${i}`,
      kind: 'enemy',
      name: 'cave bat',
      tags: ['bat', 'ethereal'],
      state: 'idle',
      tx: 3 + i,
      ty: 3,
      roomId: b.id,
      hp: 2,
      hpMax: 2,
    });
  }
  put(state, usedB, {
    id: `shrine_${b.id}`,
    kind: 'shrine',
    name: 'stone shrine',
    tags: ['arcane', 'shrine'],
    state: 'idle',
    tx: 8,
    ty: 3,
    roomId: b.id,
    paneWorthy: true,
    seed: 'it is quiet on purpose',
  });
  chestAt(state, usedB, b.id, 8, 8, ['pane_shard'], false, {
    name: 'rusted lockbox',
    tags: ['sealed', 'iron'],
    locked: true,
    paneWorthy: true,
    seed: 'a cold draft comes from the seam',
  });
  chestAt(state, usedB, b.id, 5, 8, ['ore_iron', 'torch_stub', 'master_key'], true);
  state.dungeon.masterKeyPlaced = true;
  const lootN = Object.values(state.entities).filter((e) => e.tags.includes('pickup') && e.roomId === b.id).length;
  put(state, usedB, {
    id: `loot_${b.id}_${lootN}`,
    kind: 'container',
    name: 'heart container',
    tags: ['pickup', 'heart_container'],
    state: 'idle',
    tx: 3,
    ty: 8,
    roomId: b.id,
    contents: ['heart_container'],
    paneWorthy: false,
  });

  const usedC = occupiedTiles(state, c.id);
  addCyclops(state, c.id, 'up', usedC);
  const missing = ITEM_IDS.filter((id) => !placedItemIds(state).has(id));
  if (missing.length) chestAt(state, usedC, c.id, 3, 5, missing, false);
}

export function applyDebugDungeonIfNamed(state: GameState): void {
  if (isDebugPlayerName(state.player.name)) applyDebugDungeon(state);
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
