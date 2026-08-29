// Idle → shake → angled charge → wall stun → pincer L then R. Master room only.

import Phaser from 'phaser';
import { CRAB_ID, ROOM_SIZE } from '../../../lib/dungeon/const';
import { gameStore, world } from '../../../lib/sim/store';
import { bus } from '../../EventBus';
import { TILE } from '../../const';
import { playFileSfx } from '../sound';
import { KNOCK, beginKnockback, dirFromTo, isKnocking } from '../knockback';

type Phase = 'idle' | 'shake' | 'charge' | 'stun' | 'pincer_l' | 'pincer_r';

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
  walls: Phaser.Physics.Arcade.StaticGroup;
};

export function installCrabAi(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  let phase: Phase = 'idle';
  let until = 0;
  let vx = 0;
  let vy = 0;
  let originX = 0;

  const spriteOf = (): Phaser.Physics.Arcade.Sprite | null =>
    s.entityLayer.getByName(CRAB_ID) as Phaser.Physics.Arcade.Sprite | null;

  const go = (next: Phase, ms: number) => {
    phase = next;
    until = scene.time.now + ms;
  };

  const pincerHit = (side: -1 | 1) => {
    const crab = spriteOf();
    if (!crab) return;
    const reach = 22;
    const dx = s.player.x - (crab.x + side * 10);
    const dy = s.player.y - crab.y;
    if (Math.hypot(dx, dy) < reach) {
      const away = dirFromTo(crab.x, crab.y, s.player.x, s.player.y);
      beginKnockback(s.player, away.x, away.y, KNOCK.playerSpeed, scene.time.now);
      bus.emit('world:player_hurt', { amount: 2, source: 'dungeon crab' });
    }
  };

  const onUpdate = () => {
    const entity = world().entities[CRAB_ID];
    const crab = spriteOf();
    if (!entity || entity.state === 'dead' || !crab?.body) {
      phase = 'idle';
      return;
    }
    if (entity.roomId !== world().player.roomId) return;
    const now = scene.time.now;
    const body = crab.body as Phaser.Physics.Arcade.Body;
    const max = ROOM_SIZE * TILE - 12;
    if (isKnocking(crab, now)) return;

    if (phase === 'shake') {
      crab.x = originX + ((Math.floor(now / 40) % 2) * 2 - 1) * 2;
    }

    if (phase === 'charge') {
      body.setVelocity(vx, vy);
      const hitWall = crab.x < 16 || crab.x > max || crab.y < 16 || crab.y > max;
      if (hitWall || now >= until) {
        crab.x = Phaser.Math.Clamp(crab.x, 16, max);
        crab.y = Phaser.Math.Clamp(crab.y, 16, max);
        body.setVelocity(0, 0);
        go('stun', 420);
      }
      return;
    }

    if (now < until) return;

    switch (phase) {
      case 'idle':
        originX = crab.x;
        go('shake', 380);
        break;
      case 'shake':
        crab.x = originX;
        {
          const ang = Math.atan2(s.player.y - crab.y, s.player.x - crab.x) + (Math.random() - 0.5) * 0.5;
          vx = Math.cos(ang) * 140;
          vy = Math.sin(ang) * 140;
        }
        go('charge', 700);
        break;
      case 'stun':
        go('pincer_l', 180);
        pincerHit(-1);
        break;
      case 'pincer_l':
        go('pincer_r', 180);
        pincerHit(1);
        break;
      case 'pincer_r':
        go('idle', 500);
        break;
      default:
        go('idle', 400);
    }
  };

  const offEvent = bus.on('sim:event', (event) => {
    if (event.type === 'entity_struck' && event.entityId === CRAB_ID) {
      playFileSfx('bossHit');
    }
    if (event.type === 'flag_set' && event.flag === 'boss_dead' && event.value) {
      playFileSfx('bossKill');
      playFileSfx('fanfare');
      scene.time.delayedCall(1400, () => {
        gameStore.getState().dispatch({ type: 'RETURN_FOUNTAIN', refillHp: true }, 'keyboard');
      });
    }
  });

  scene.events.on('update', onUpdate);
  return () => {
    scene.events.off('update', onUpdate);
    offEvent();
  };
}
