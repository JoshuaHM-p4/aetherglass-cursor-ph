// Hop toward the player. Cannot leave the current room. Arcade collides with walls.

import Phaser from 'phaser';
import { ROOM_SIZE } from '../../../lib/dungeon/const';
import { world } from '../../../lib/sim/store';
import { TILE } from '../../const';

const HOP_MS = 720;
const HOP_SPEED = 55;

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
  walls: Phaser.Physics.Arcade.StaticGroup;
};

export function installSlimeAi(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  const hopAt = new Map<string, number>();

  const onUpdate = () => {
    const roomId = world().player.roomId;
    const now = scene.time.now;
    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const entity = world().entities[sprite.name];
      if (!entity || entity.state === 'dead' || !entity.tags.includes('slime')) continue;
      if (entity.roomId !== roomId) continue;
      if (!sprite.body) continue;
      const due = hopAt.get(sprite.name) ?? 0;
      if (now < due) continue;
      hopAt.set(sprite.name, now + HOP_MS);
      const dx = s.player.x - sprite.x;
      const dy = s.player.y - sprite.y;
      const len = Math.hypot(dx, dy) || 1;
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity((dx / len) * HOP_SPEED, (dy / len) * HOP_SPEED);
      scene.time.delayedCall(220, () => {
        if (sprite.active) body.setVelocity(0, 0);
      });
      const max = ROOM_SIZE * TILE - 8;
      sprite.x = Phaser.Math.Clamp(sprite.x, 8, max);
      sprite.y = Phaser.Math.Clamp(sprite.y, 8, max);
    }
  };

  scene.events.on('update', onUpdate);
  return () => scene.events.off('update', onUpdate);
}
