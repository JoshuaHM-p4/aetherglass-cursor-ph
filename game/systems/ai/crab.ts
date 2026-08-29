// Drop-in roar, then idle → shake → angled charge → wall stun → pincer L then R.

import Phaser from 'phaser';
import { CRAB_ID, ROOM_SIZE } from '../../../lib/dungeon/const';
import { gameStore, world } from '../../../lib/sim/store';
import { bus } from '../../EventBus';
import { TILE } from '../../const';
import { setBossIntroLocked } from '../../inputCapture';
import { CRAB_BODY, CRAB_SCALE } from '../hitbox';
import { playCrabRoar, playFileSfx } from '../sound';
import { KNOCK, beginKnockback, dirFromTo, isKnocking } from '../knockback';

type Phase = 'intro' | 'idle' | 'shake' | 'charge' | 'stun' | 'pincer_l' | 'pincer_r';

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
  walls: Phaser.Physics.Arcade.StaticGroup;
};

const PINCER_REACH = 22;
const CHARGE = 120;
const DROP_MS = 720;
const ROAR_MS = 900;

export function installCrabAi(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  let phase: Phase = 'idle';
  let until = 0;
  let vx = 0;
  let vy = 0;
  let originX = 0;
  let introDone = false;
  let dropTween: Phaser.Tweens.Tween | null = null;

  const spriteOf = (): Phaser.Physics.Arcade.Sprite | null =>
    s.entityLayer.getByName(CRAB_ID) as Phaser.Physics.Arcade.Sprite | null;

  const go = (next: Phase, ms: number) => {
    phase = next;
    until = scene.time.now + ms;
  };

  const sizeCrab = (crab: Phaser.Physics.Arcade.Sprite): void => {
    crab.setScale(CRAB_SCALE).setDepth(12).setAlpha(1);
    const body = crab.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    body.setSize(CRAB_BODY, CRAB_BODY, true);
  };

  const endIntro = (crab: Phaser.Physics.Arcade.Sprite): void => {
    dropTween = null;
    sizeCrab(crab);
    const body = crab.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.enable = true;
      body.setVelocity(0, 0);
    }
    setBossIntroLocked(false);
    bus.emit('world:boss_intro', { playing: false, revealed: true });
    go('idle', 500);
  };

  const abortIntro = (): void => {
    dropTween?.stop();
    dropTween = null;
    setBossIntroLocked(false);
    if (phase === 'intro') phase = 'idle';
  };

  const startIntro = (crab: Phaser.Physics.Arcade.Sprite, landX: number, landY: number): void => {
    introDone = true;
    phase = 'intro';
    until = Number.POSITIVE_INFINITY;
    setBossIntroLocked(true);
    bus.emit('world:boss_intro', { playing: true, revealed: false });
    sizeCrab(crab);
    crab.setAlpha(0);
    crab.setPosition(landX, landY - 56);
    const body = crab.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.enable = false;
      body.setVelocity(0, 0);
    }
    dropTween = scene.tweens.add({
      targets: crab,
      y: landY,
      alpha: 1,
      duration: DROP_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        dropTween = null;
        crab.setPosition(landX, landY);
        scene.cameras.main.shake(340, 0.008);
        playCrabRoar();
        bus.emit('world:boss_intro', { playing: true, revealed: true });
        scene.time.delayedCall(ROAR_MS, () => {
          if (world().entities[CRAB_ID]?.state === 'dead') return;
          if (world().player.roomId !== world().entities[CRAB_ID]?.roomId) return;
          endIntro(crab);
        });
      },
    });
  };

  const pincerHit = (side: -1 | 1) => {
    const crab = spriteOf();
    if (!crab) return;
    const dx = s.player.x - (crab.x + side * 10);
    const dy = s.player.y - crab.y;
    if (Math.hypot(dx, dy) < PINCER_REACH) {
      const away = dirFromTo(crab.x, crab.y, s.player.x, s.player.y);
      beginKnockback(s.player, away.x, away.y, KNOCK.playerSpeed, scene.time.now);
      bus.emit('world:player_hurt', { amount: 2, source: 'dungeon crab' });
    }
  };

  const onUpdate = () => {
    const entity = world().entities[CRAB_ID];
    const crab = spriteOf();
    if (!entity || entity.state === 'dead' || !crab) {
      abortIntro();
      introDone = false;
      phase = 'idle';
      return;
    }
    if (entity.roomId !== world().player.roomId) {
      abortIntro();
      introDone = false;
      return;
    }

    if (!introDone) {
      const landX = entity.tx * TILE + TILE / 2;
      const landY = entity.ty * TILE + TILE / 2;
      const alreadyHurt = (entity.hp ?? 0) < (entity.hpMax ?? 0);
      if (alreadyHurt) {
        introDone = true;
        sizeCrab(crab);
        const body = crab.body as Phaser.Physics.Arcade.Body | null;
        if (body) body.enable = true;
        bus.emit('world:boss_intro', { playing: false, revealed: true });
        go('idle', 200);
      } else {
        startIntro(crab, landX, landY);
      }
      return;
    }

    if (phase === 'intro') return;

    const now = scene.time.now;
    const body = crab.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const pad = 18;
    const max = ROOM_SIZE * TILE - pad;
    if (isKnocking(crab, now)) return;

    if (phase === 'shake') {
      crab.x = originX + ((Math.floor(now / 40) % 2) * 2 - 1) * 4;
    }

    if (phase === 'charge') {
      body.setVelocity(vx, vy);
      const hitWall = crab.x < pad || crab.x > max || crab.y < pad || crab.y > max;
      if (hitWall || now >= until) {
        crab.x = Phaser.Math.Clamp(crab.x, pad, max);
        crab.y = Phaser.Math.Clamp(crab.y, pad, max);
        body.setVelocity(0, 0);
        go('stun', 420);
      }
      return;
    }

    if (now < until) return;

    switch (phase) {
      case 'idle':
        originX = crab.x;
        go('shake', 480);
        break;
      case 'shake':
        crab.x = originX;
        {
          const ang = Math.atan2(s.player.y - crab.y, s.player.x - crab.x) + (Math.random() - 0.5) * 0.7;
          vx = Math.cos(ang) * CHARGE;
          vy = Math.sin(ang) * CHARGE;
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
        go('idle', 560);
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
      abortIntro();
      bus.emit('world:boss_intro', { playing: false, revealed: false });
      playFileSfx('bossKill');
      playFileSfx('fanfare');
      scene.time.delayedCall(1400, () => {
        gameStore.getState().dispatch({ type: 'RETURN_FOUNTAIN', refillHp: true }, 'keyboard');
      });
    }
  });

  scene.events.on('update', onUpdate);
  return () => {
    abortIntro();
    scene.events.off('update', onUpdate);
    offEvent();
  };
}
