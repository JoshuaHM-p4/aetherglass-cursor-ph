// Room-local fliers. Drift like the ghost, pass walls, never leave the 12×12.
// Packs are capped at 3 by the generator.

import Phaser from 'phaser';
import { world } from '../../../lib/sim/store';
import { isKnocking } from '../knockback';
import { playFoeVoice } from '../sound';
import { syncFoeTile } from './syncTile';

const DRIFT = 28;
const SYNC_MS = 480;
const SCREECH_MS = 1500;

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
};

export function installBatAi(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  const nextSync = new Map<string, number>();
  const nextScreech = new Map<string, number>();

  const onUpdate = () => {
    const roomId = world().player.roomId;
    const now = scene.time.now;
    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const entity = world().entities[sprite.name];
      if (!entity || entity.state === 'dead' || !entity.tags.includes('bat')) continue;
      if (entity.roomId !== roomId || !sprite.body) continue;
      sprite.setAlpha(0.88);
      if (!isKnocking(sprite, now)) {
        const dx = s.player.x - sprite.x;
        const dy = s.player.y - sprite.y;
        const len = Math.hypot(dx, dy) || 1;
        (sprite.body as Phaser.Physics.Arcade.Body).setVelocity((dx / len) * DRIFT, (dy / len) * DRIFT);
      }
      const due = nextSync.get(sprite.name) ?? 0;
      if (now >= due) {
        nextSync.set(sprite.name, now + SYNC_MS);
        syncFoeTile(sprite, sprite.name);
      }
      const screechDue = nextScreech.get(sprite.name) ?? 0;
      if (now >= screechDue) {
        const stagger = (sprite.name.charCodeAt(sprite.name.length - 1) % 5) * 90;
        nextScreech.set(sprite.name, now + SCREECH_MS + stagger);
        playFoeVoice(sprite.name, entity.tags, 400);
      }
    }
  };

  scene.events.on('update', onUpdate);
  return () => scene.events.off('update', onUpdate);
}
