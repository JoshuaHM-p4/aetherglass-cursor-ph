// Read-only dungeon map. Rooms exist only after ENTER_PASSAGE, so the
// rooms dict *is* the discovered set — no second visited list.

import { ALL_FACINGS } from '../dungeon/const';
import type { Facing, GameState, PassageLock, RoomKind } from './types';

export type MiniFill = 'current' | 'cave' | 'fountain' | 'master';

export interface MiniRoom {
  id: string;
  gx: number;
  gy: number;
  fill: MiniFill;
  /** Unopened crates/chests (not floor pickups). */
  chests: number;
  /** Locked exits still on this room, for door ticks on the square's edge. */
  doors: Facing[];
}

export interface MiniTunnel {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface MiniMap {
  rooms: MiniRoom[];
  tunnels: MiniTunnel[];
}

export function fillOf(kind: RoomKind, current: boolean): MiniFill {
  if (current) return 'current';
  if (kind === 'fountain') return 'fountain';
  if (kind === 'master') return 'master';
  return 'cave';
}

function isLocked(lock: PassageLock): boolean {
  return lock === 'key' || lock === 'master';
}

export function minimapOf(state: GameState): MiniMap {
  const here = state.player.roomId;
  const known = state.dungeon.rooms;
  const rooms: MiniRoom[] = Object.values(known).map((room) => ({
    id: room.id,
    gx: room.gx,
    gy: room.gy,
    fill: fillOf(room.kind, room.id === here),
    chests: Object.values(state.entities).filter(
      (e) =>
        e.roomId === room.id &&
        e.kind === 'container' &&
        e.state !== 'open' &&
        !e.tags.includes('pickup'),
    ).length,
    doors: ALL_FACINGS.filter((dir) => {
      const passage = room.exits[dir];
      return Boolean(passage && isLocked(passage.lock));
    }),
  }));

  const tunnels: MiniTunnel[] = [];
  for (const room of Object.values(known)) {
    for (const dir of ALL_FACINGS) {
      const destId = room.exits[dir]?.to;
      if (!destId) continue;
      const dest = known[destId];
      if (!dest) continue;
      if (room.id > dest.id) continue;
      tunnels.push({ ax: room.gx, ay: room.gy, bx: dest.gx, by: dest.gy });
    }
  }

  return { rooms, tunnels };
}
