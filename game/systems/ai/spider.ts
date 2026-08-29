// Ceiling trap. A faint floor stain is the tell; it drops when you step on the nest,
// then chases a short leash and climbs back. No LLM. Body off while hanging so a
// walking dodge is real.

import Phaser from 'phaser';
import { world } from '../../../lib/sim/store';
import { TILE } from '../../const';
import { isKnocking } from '../knockback';
import { playFoeVoice } from '../sound';
import { syncFoeTile } from './syncTile';

const DROP_MS = 180;
const CLIMB_MS = 260;
const CHASE_PX = TILE * 4.5;
const HOP_MS = 520;
const HOP_SPEED = 70;
const LIFT = 26;

type Phase = 'hang' | 'drop' | 'chase' | 'climb';

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
};

function nestOf(sprite: Phaser.GameObjects.Sprite): { x: number; y: number } {
  return {
    x: (sprite.getData('nestTx') as number) * TILE + 8,
    y: (sprite.getData('nestTy') as number) * TILE + 8,
  };
}

export function installSpiderAi(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  const shadows = new Map<string, Phaser.GameObjects.Ellipse>();
  const hopAt = new Map<string, number>();

  const shadowOf = (id: string, nest: { x: number; y: number }): Phaser.GameObjects.Ellipse => {
    let mark = shadows.get(id);
    if (mark?.active) return mark;
    mark = scene.add.ellipse(nest.x, nest.y + 2, 10, 5, 0x0a0c12, 0.14).setDepth(3);
    shadows.set(id, mark);
    return mark;
  };

  const hang = (sprite: Phaser.Physics.Arcade.Sprite): void => {
    const nest = nestOf(sprite);
    sprite.setPosition(nest.x, nest.y - LIFT);
    sprite.setAlpha(0);
    sprite.setData('phase', 'hang');
    if (sprite.body) sprite.body.enable = false;
    shadowOf(sprite.name, nest).setVisible(true).setAlpha(0.14);
  };

  const onUpdate = () => {
    const roomId = world().player.roomId;
    const now = scene.time.now;
    const seen = new Set<string>();

    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const entity = world().entities[sprite.name];
      if (!entity || entity.state === 'dead' || !entity.tags.includes('spider')) continue;
      if (entity.roomId !== roomId) continue;
      seen.add(sprite.name);

      if (sprite.getData('nestTx') === undefined) {
        sprite.setData('nestTx', entity.tx);
        sprite.setData('nestTy', entity.ty);
        hang(sprite);
      }

      const nest = nestOf(sprite);
      const mark = shadowOf(sprite.name, nest);
      mark.setPosition(nest.x, nest.y + 2);
      const phase = (sprite.getData('phase') as Phase | undefined) ?? 'hang';

      if (phase === 'hang') {
        const onNest = world().player.tx === sprite.getData('nestTx') && world().player.ty === sprite.getData('nestTy');
        if (!onNest) continue;
        sprite.setData('phase', 'drop');
        sprite.setData('until', now + DROP_MS);
        sprite.setAlpha(1);
        sprite.setPosition(nest.x, nest.y - LIFT);
        mark.setAlpha(0.4);
        playFoeVoice(sprite.name, entity.tags);
        continue;
      }

      if (phase === 'drop') {
        const until = sprite.getData('until') as number;
        const t = 1 - Math.max(0, (until - now) / DROP_MS);
        sprite.setPosition(nest.x, nest.y - LIFT * (1 - t));
        if (now < until) continue;
        sprite.setPosition(nest.x, nest.y);
        if (sprite.body) sprite.body.enable = true;
        sprite.setData('phase', 'chase');
        continue;
      }

      if (phase === 'climb') {
        const until = sprite.getData('until') as number;
        const t = 1 - Math.max(0, (until - now) / CLIMB_MS);
        sprite.setPosition(nest.x, nest.y - LIFT * t);
        sprite.setAlpha(1 - t);
        if (now < until) continue;
        hang(sprite);
        continue;
      }

      if (isKnocking(sprite, now) || !sprite.body) continue;
      const dx = sprite.x - nest.x;
      const dy = sprite.y - nest.y;
      if (Math.hypot(dx, dy) > CHASE_PX) {
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.enable = false;
        sprite.setData('phase', 'climb');
        sprite.setData('until', now + CLIMB_MS);
        continue;
      }

      const due = hopAt.get(sprite.name) ?? 0;
      if (now >= due) {
        hopAt.set(sprite.name, now + HOP_MS);
        const px = s.player.x - sprite.x;
        const py = s.player.y - sprite.y;
        const len = Math.hypot(px, py) || 1;
        (sprite.body as Phaser.Physics.Arcade.Body).setVelocity((px / len) * HOP_SPEED, (py / len) * HOP_SPEED);
        scene.time.delayedCall(200, () => {
          if (sprite.active && !isKnocking(sprite, scene.time.now) && sprite.body) {
            (sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
          }
        });
      }
      syncFoeTile(sprite, sprite.name);
    }

    for (const [id, mark] of shadows) {
      if (seen.has(id)) continue;
      mark.destroy();
      shadows.delete(id);
    }
  };

  scene.events.on('update', onUpdate);
  return () => {
    scene.events.off('update', onUpdate);
    for (const mark of shadows.values()) mark.destroy();
    shadows.clear();
  };
}
