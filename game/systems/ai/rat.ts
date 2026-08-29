// Scuttles. Never hurts. On death the sim may grant whatever was pre-rolled into contents.

import Phaser from 'phaser';
import { ROOM_SIZE } from '../../../lib/dungeon/const';
import { world } from '../../../lib/sim/store';
import { TILE } from '../../const';
import { isKnocking } from '../knockback';
import { syncFoeTile } from './syncTile';

const WANDER_MS = 700;
const SPEED = 32;

type Host = Phaser.Scene & {
  entityLayer: Phaser.GameObjects.Container;
};

export function installRatAi(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  const nextHop = new Map<string, number>();
  const heading = new Map<string, { x: number; y: number }>();

  const onUpdate = () => {
    const roomId = world().player.roomId;
    const now = scene.time.now;
    const max = ROOM_SIZE * TILE - 8;
    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const entity = world().entities[sprite.name];
      if (!entity || entity.state === 'dead' || !entity.tags.includes('rat')) continue;
      if (entity.roomId !== roomId || !sprite.body) continue;
      if (isKnocking(sprite, now)) continue;
      sprite.x = Phaser.Math.Clamp(sprite.x, 8, max);
      sprite.y = Phaser.Math.Clamp(sprite.y, 8, max);
      const due = nextHop.get(sprite.name) ?? 0;
      if (now >= due) {
        nextHop.set(sprite.name, now + WANDER_MS);
        const ang = Math.random() * Math.PI * 2;
        heading.set(sprite.name, { x: Math.cos(ang), y: Math.sin(ang) });
        syncFoeTile(sprite, sprite.name);
      }
      const dir = heading.get(sprite.name) ?? { x: 1, y: 0 };
      (sprite.body as Phaser.Physics.Arcade.Body).setVelocity(dir.x * SPEED, dir.y * SPEED);
    }
  };

  scene.events.on('update', onUpdate);
  return () => scene.events.off('update', onUpdate);
}
