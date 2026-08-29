// Slow door-guard. Hits with the hammer's numbers (wide, heavy, 4 damage = two hearts).
// Contact itself does not hurt — the swing does.

import Phaser from 'phaser';
import { ROOM_SIZE } from '../../../lib/dungeon/const';
import { ITEM_REGISTRY } from '../../../lib/sim/registry';
import { world } from '../../../lib/sim/store';
import type { Facing } from '../../../lib/sim/types';
import { bus } from '../../EventBus';
import { TILE } from '../../const';
import { inSwingCone, SWING_CONE } from '../hitbox';
import { beginKnockback, facingDir, isKnocking, KNOCK } from '../knockback';
import { swingAngle, swingProgress, swordHand } from '../swingFx';
import { syncFoeTile } from './syncTile';

const WALK = 22;
const SYNC_MS = 400;
const HAMMER = ITEM_REGISTRY.hammer.stats!;

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
};

function cardinalToward(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

export function installCyclopsAi(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  const nextSync = new Map<string, number>();
  const hammers = new Map<string, Phaser.GameObjects.Image>();
  const cooldownUntil = new Map<string, number>();
  const swingAt = new Map<string, number>();
  const swingFacing = new Map<string, Facing>();

  const hammerOf = (id: string): Phaser.GameObjects.Image | null => {
    let img = hammers.get(id);
    if (img?.active) return img;
    const key = scene.textures.exists('tex-wield-hammer')
      ? 'tex-wield-hammer'
      : scene.textures.exists('tex-sword')
        ? 'tex-sword'
        : null;
    if (!key) return null;
    img = scene.add.image(0, 0, key).setVisible(false).setOrigin(0.5, 0.88).setDepth(12);
    hammers.set(id, img);
    return img;
  };

  const onUpdate = () => {
    const roomId = world().player.roomId;
    const now = scene.time.now;
    const seen = new Set<string>();
    const max = ROOM_SIZE * TILE - 8;

    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const entity = world().entities[sprite.name];
      if (!entity || entity.state === 'dead' || !entity.tags.includes('cyclops')) continue;
      if (entity.roomId !== roomId || !sprite.body) continue;
      seen.add(sprite.name);
      sprite.setScale(1.2);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      const hammer = hammerOf(sprite.name);
      const swinging = swingAt.get(sprite.name);
      const facing = swingFacing.get(sprite.name) ?? 'down';

      if (swinging !== undefined) {
        const t = swingProgress(now - swinging, HAMMER.swingMs ?? 280);
        if (hammer) {
          const hand = swordHand(facing);
          hammer
            .setPosition(sprite.x + hand.x, sprite.y + hand.y)
            .setAngle(swingAngle(facing, t))
            .setVisible(t < 1)
            .setDepth(facing === 'up' ? 9 : 12);
        }
        if (t >= 1) {
          swingAt.delete(sprite.name);
          hammer?.setVisible(false);
        }
        body.setVelocity(0, 0);
        continue;
      }

      if (isKnocking(sprite, now)) continue;
      sprite.x = Phaser.Math.Clamp(sprite.x, 8, max);
      sprite.y = Phaser.Math.Clamp(sprite.y, 8, max);

      const dx = s.player.x - sprite.x;
      const dy = s.player.y - sprite.y;
      const len = Math.hypot(dx, dy) || 1;
      const face = cardinalToward(dx, dy);
      const ready = now >= (cooldownUntil.get(sprite.name) ?? 0);
      const iframeUntil = (s.player.getData('iframeUntil') as number | undefined) ?? 0;
      const canHurt = now >= iframeUntil && world().player.hp > 0;

      if (
        ready &&
        canHurt &&
        inSwingCone(
          sprite.x,
          sprite.y,
          s.player.x,
          s.player.y,
          face,
          HAMMER.reach ?? 1,
          SWING_CONE.enemyRadiusPx,
          HAMMER.cone ?? 1.4,
        )
      ) {
        swingAt.set(sprite.name, now);
        swingFacing.set(sprite.name, face);
        cooldownUntil.set(sprite.name, now + (HAMMER.cooldownMs ?? 420));
        body.setVelocity(0, 0);
        const along = facingDir(face);
        beginKnockback(s.player, along.x, along.y, KNOCK.playerSpeed * (HAMMER.knock ?? 1.8), now);
        bus.emit('world:player_hurt', { amount: HAMMER.damage ?? 4, source: entity.name });
        continue;
      }

      body.setVelocity((dx / len) * WALK, (dy / len) * WALK);
      const due = nextSync.get(sprite.name) ?? 0;
      if (now >= due) {
        nextSync.set(sprite.name, now + SYNC_MS);
        syncFoeTile(sprite, sprite.name);
      }
    }

    for (const [id, img] of hammers) {
      if (seen.has(id)) continue;
      img.destroy();
      hammers.delete(id);
    }
  };

  scene.events.on('update', onUpdate);
  return () => {
    scene.events.off('update', onUpdate);
    for (const img of hammers.values()) img.destroy();
    hammers.clear();
  };
}
