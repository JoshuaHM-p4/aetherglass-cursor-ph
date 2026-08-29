import Phaser from 'phaser';
import { ROOM_SIZE } from '../../../lib/dungeon/const';
import { gameStore, world } from '../../../lib/sim/store';
import { TILE } from '../../const';

export function syncFoeTile(sprite: Phaser.GameObjects.Sprite, entityId: string): void {
  const entity = world().entities[entityId];
  if (!entity || entity.state === 'dead') return;
  const tx = Phaser.Math.Clamp(Math.round((sprite.x - 8) / TILE), 0, ROOM_SIZE - 1);
  const ty = Phaser.Math.Clamp(Math.round((sprite.y - 8) / TILE), 0, ROOM_SIZE - 1);
  if (tx === entity.tx && ty === entity.ty && entity.roomId === world().player.roomId) return;
  gameStore.getState().dispatch(
    { type: 'MOVE_ENTITY', entityId, roomId: entity.roomId, tx, ty },
    'keyboard',
  );
}
