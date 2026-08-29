// Tiny HP track above an enemy. Phaser only *reads* Entity.hp from the store.

import Phaser from 'phaser';
import { world } from '../../lib/sim/store';

const BAR_W = 14;
const BAR_H = 2;
const PAD = 1;
const LIFT = 11;
const FILL = 0xc45c5c;
const EMPTY = 0x3a1820;
const EDGE = 0x1a1014;

type Host = Phaser.Scene & {
  entityLayer: Phaser.GameObjects.Container;
};

type Bar = {
  gfx: Phaser.GameObjects.Graphics;
};

export function installHpBars(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  const bars = new Map<string, Bar>();

  const drop = (id: string): void => {
    const bar = bars.get(id);
    if (!bar) return;
    bar.gfx.destroy();
    bars.delete(id);
  };

  const paint = (bar: Bar, ratio: number): void => {
    const gfx = bar.gfx;
    gfx.clear();
    const w = BAR_W + PAD * 2;
    const h = BAR_H + PAD * 2;
    gfx.fillStyle(EDGE, 1);
    gfx.fillRect(-w / 2, -h / 2, w, h);
    gfx.fillStyle(EMPTY, 1);
    gfx.fillRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H);
    const fill = Math.max(0, Math.round(BAR_W * ratio));
    if (fill > 0) {
      gfx.fillStyle(FILL, 1);
      gfx.fillRect(-BAR_W / 2, -BAR_H / 2, fill, BAR_H);
    }
  };

  const sync = (): void => {
    const seen = new Set<string>();
    for (const obj of s.entityLayer.list) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const entity = world().entities[sprite.name];
      if (!entity) continue;
      if (entity.kind !== 'enemy' && entity.kind !== 'elite') continue;
      if (entity.tags.includes('boss') || entity.tags.includes('crab')) continue;
      const hp = entity.hp ?? 0;
      const hpMax = entity.hpMax ?? 0;
      const show = entity.state !== 'dead' && hpMax > 0 && hp > 0 && hp < hpMax;
      if (!show) {
        drop(entity.id);
        continue;
      }
      seen.add(entity.id);
      let bar = bars.get(entity.id);
      if (!bar) {
        bar = { gfx: scene.add.graphics().setDepth(16) };
        bars.set(entity.id, bar);
      }
      bar.gfx.setPosition(sprite.x, sprite.y - LIFT);
      paint(bar, hp / hpMax);
    }
    for (const id of [...bars.keys()]) {
      if (!seen.has(id)) drop(id);
    }
  };

  scene.events.on('postupdate', sync);
  return () => {
    scene.events.off('postupdate', sync);
    for (const id of [...bars.keys()]) drop(id);
  };
}
