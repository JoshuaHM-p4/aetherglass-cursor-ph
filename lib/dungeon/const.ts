// Shared dungeon geometry. Sim, generator, and Phaser all read these so a door
// cannot drift off the opening it belongs to.

import type { Facing } from '../sim/types';

export const ROOM_SIZE = 12;
export const CAVE_CAP = 16;
export const FOUNTAIN_ROOM_ID = 'r_0_0';
export const FOUNTAIN_ENTITY_ID = 'fountain_00';
export const CRAB_ID = 'crab_master';
export const GHOST_ID = 'ghost_01';
export const MASTER_ROOM_ID = 'r_master';

export const OPPOSITE: Record<Facing, Facing> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export const GRID_DELTA: Record<Facing, { gx: number; gy: number }> = {
  up: { gx: 0, gy: -1 },
  down: { gx: 0, gy: 1 },
  left: { gx: -1, gy: 0 },
  right: { gx: 1, gy: 0 },
};

/** Centre cell of a doorway. The walkable mouth is this ± EXIT_SPAN along the wall. */
export const EXIT_TILE: Record<Facing, { tx: number; ty: number }> = {
  up: { tx: 6, ty: 0 },
  down: { tx: 6, ty: 11 },
  left: { tx: 0, ty: 6 },
  right: { tx: 11, ty: 6 },
};

/** Extra cells on each side of EXIT_TILE. Visual gap stays 1 tile; walk/collision use this span. */
export const EXIT_SPAN = 1;

/** Interior tile the player lands on after travelling `dir`. */
export const ARRIVAL_TILE: Record<Facing, { tx: number; ty: number }> = {
  up: { tx: 6, ty: 10 },
  down: { tx: 6, ty: 1 },
  left: { tx: 10, ty: 6 },
  right: { tx: 1, ty: 6 },
};

export const FOUNTAIN_SPAWN = { tx: 6, ty: 6 } as const;
export const FOUNTAIN_PROP = { tx: 6, ty: 5 } as const;

export const ALL_FACINGS: readonly Facing[] = ['up', 'down', 'left', 'right'];

export function roomIdAt(gx: number, gy: number): string {
  return `r_${gx}_${gy}`;
}

export function parseRoomId(id: string): { gx: number; gy: number } | null {
  const m = /^r_(-?\d+)_(-?\d+)$/.exec(id);
  if (!m) return null;
  return { gx: Number(m[1]), gy: Number(m[2]) };
}

export function doorId(roomId: string, dir: Facing): string {
  return `door_${roomId}_${dir}`;
}

export function facingFromDoorId(id: string): Facing | null {
  for (const dir of ALL_FACINGS) {
    if (id.endsWith(`_${dir}`)) return dir;
  }
  return null;
}

export function isExitTile(tx: number, ty: number, dir: Facing): boolean {
  const e = EXIT_TILE[dir];
  if (dir === 'up' || dir === 'down') {
    return ty === e.ty && Math.abs(tx - e.tx) <= EXIT_SPAN;
  }
  return tx === e.tx && Math.abs(ty - e.ty) <= EXIT_SPAN;
}

/** The three (or fewer) cells that make up a doorway on `dir`. */
export function exitMouthCells(dir: Facing): Array<{ tx: number; ty: number }> {
  const e = EXIT_TILE[dir];
  const cells: Array<{ tx: number; ty: number }> = [];
  for (let d = -EXIT_SPAN; d <= EXIT_SPAN; d++) {
    const tx = dir === 'up' || dir === 'down' ? e.tx + d : e.tx;
    const ty = dir === 'left' || dir === 'right' ? e.ty + d : e.ty;
    if (tx < 0 || tx >= ROOM_SIZE || ty < 0 || ty >= ROOM_SIZE) continue;
    cells.push({ tx, ty });
  }
  return cells;
}

export function exitDirAt(tx: number, ty: number): Facing | null {
  for (const dir of ALL_FACINGS) {
    if (isExitTile(tx, ty, dir)) return dir;
  }
  return null;
}
