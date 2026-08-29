// Phases through walls. Sim-ticks even while culled. Sprite only in the current room.
// Never enters the fountain room — the well is a sanctuary.

import Phaser from 'phaser';
import {
  ALL_FACINGS,
  ARRIVAL_TILE,
  EXIT_TILE,
  FOUNTAIN_ROOM_ID,
  GHOST_ID,
  ROOM_SIZE,
} from '../../../lib/dungeon/const';
import { gameStore, world } from '../../../lib/sim/store';
import { ACTOR_BODY, TILE } from '../../const';
import { isKnocking } from '../knockback';
import type { Facing, Room } from '../../../lib/sim/types';

const TICK_MS = 900;
const DRIFT = 18;

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
};

function isFountainRoom(roomId: string): boolean {
  if (roomId === FOUNTAIN_ROOM_ID) return true;
  return world().dungeon.rooms[roomId]?.kind === 'fountain';
}

function exitAwayFromFountain(room: Room): Facing | undefined {
  return ALL_FACINGS.find((dir) => {
    const exit = room.exits[dir];
    return Boolean(exit && exit.lock === 'open' && exit.to && !isFountainRoom(exit.to));
  });
}

export function installGhostAi(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  let nextTick = 0;
  let sprite: Phaser.Physics.Arcade.Sprite | null = null;

  const ensureSprite = (): Phaser.Physics.Arcade.Sprite | null => {
    const ghost = world().entities[GHOST_ID];
    const here = ghost && ghost.state !== 'dead' && ghost.roomId === world().player.roomId;
    if (!here) {
      sprite?.destroy();
      sprite = null;
      return null;
    }
    if (sprite?.active) return sprite;
    const tex = scene.textures.exists('tex-ghost') ? 'tex-ghost' : 'tex-slime';
    sprite = scene.physics.add.sprite(ghost.tx * TILE + 8, ghost.ty * TILE + 8, tex);
    sprite.name = GHOST_ID;
    sprite.setAlpha(0.72);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.pushable = false;
    body.checkCollision.none = true;
    body.setSize(ACTOR_BODY, ACTOR_BODY, true);
    s.entityLayer.add(sprite);
    return sprite;
  };

  const onUpdate = () => {
    const ghost = world().entities[GHOST_ID];
    const vis = ensureSprite();
    if (vis && ghost && !isKnocking(vis, scene.time.now)) {
      const body = vis.body as Phaser.Physics.Arcade.Body;
      const dx = s.player.x - vis.x;
      const dy = s.player.y - vis.y;
      const len = Math.hypot(dx, dy) || 1;
      body.setVelocity((dx / len) * DRIFT, (dy / len) * DRIFT);
    }

    const now = scene.time.now;
    if (now < nextTick) return;
    nextTick = now + TICK_MS;
    if (!ghost || ghost.state === 'dead') return;

    const room = world().dungeon.rooms[ghost.roomId];
    if (!room) return;
    const playerRoom = world().player.roomId;
    let tx = ghost.tx;
    let ty = ghost.ty;
    let roomId = ghost.roomId;

    const stepToward = (dir: Facing): void => {
      const edge = EXIT_TILE[dir];
      if (tx === edge.tx && ty === edge.ty) {
        const dest = room.exits[dir]!.to!;
        if (isFountainRoom(dest)) return;
        roomId = dest;
        const land = ARRIVAL_TILE[dir];
        tx = land.tx;
        ty = land.ty;
      } else {
        tx += Math.sign(edge.tx - tx);
        ty += Math.sign(edge.ty - ty);
      }
    };

    const wander = (): void => {
      tx += Math.sign(Math.random() - 0.5) || 1;
      ty += Math.sign(Math.random() - 0.5);
    };

    if (isFountainRoom(ghost.roomId)) {
      const leave = exitAwayFromFountain(room);
      if (leave) stepToward(leave);
    } else if (ghost.roomId === playerRoom) {
      const gx = Math.sign(world().player.tx - tx);
      const gy = Math.sign(world().player.ty - ty);
      if (Math.abs(world().player.tx - tx) >= Math.abs(world().player.ty - ty)) tx += gx;
      else ty += gy;
    } else if (isFountainRoom(playerRoom)) {
      wander();
    } else {
      const open = exitAwayFromFountain(room);
      if (open) stepToward(open);
      else wander();
    }

    tx = Phaser.Math.Clamp(tx, 0, ROOM_SIZE - 1);
    ty = Phaser.Math.Clamp(ty, 0, ROOM_SIZE - 1);
    if (isFountainRoom(roomId)) return;
    if (tx === ghost.tx && ty === ghost.ty && roomId === ghost.roomId) return;
    gameStore.getState().dispatch(
      { type: 'MOVE_ENTITY', entityId: GHOST_ID, roomId, tx, ty },
      'keyboard',
    );
    if (vis && roomId === playerRoom) {
      vis.setPosition(tx * TILE + 8, ty * TILE + 8);
    }
  };

  scene.events.on('update', onUpdate);
  return () => {
    scene.events.off('update', onUpdate);
    sprite?.destroy();
    sprite = null;
  };
}
