// game/scenes/Preload.ts
//
// Loads Kenney Tiny Dungeon tiles (CC0) under the same `tex-*` keys Overworld
// already draws. Grey-box bake is the fallback if a file is missing.

import Phaser from 'phaser';
import { ensureLookWalk, preloadLooks } from '../systems/playerLook';

const TILE = '/assets/tiles/tiny-dungeon';

function tile(n: number): string {
  return `${TILE}/tile_${String(n).padStart(4, '0')}.png`;
}

function bake(scene: Phaser.Scene, key: string, color: number, stroke?: number): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(color, 1);
  g.fillRect(0, 0, 16, 16);
  if (stroke !== undefined) {
    g.lineStyle(1, stroke, 1);
    g.strokeRect(1, 1, 14, 14);
  }
  g.generateTexture(key, 16, 16);
  g.destroy();
}

function bakeGrey(scene: Phaser.Scene): void {
  bake(scene, 'tex-floor', 0x1a1e2e, 0x2a3144);
  bake(scene, 'tex-wall', 0x3a4055);
  bake(scene, 'tex-player', 0xc9a86a);
  bake(scene, 'tex-slime', 0x6dbf8b);
  bake(scene, 'tex-chest', 0xb07d4f, 0x7a4e2a);
  bake(scene, 'tex-door', 0x8a6a4a);
  bake(scene, 'tex-shrine', 0x7a8cff, 0xc9a86a);
  bake(scene, 'tex-spot', 0xffffee);
}

function bakeSpot(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0xfff4c0, 0.28);
  g.fillCircle(24, 24, 22);
  g.fillStyle(0xffffee, 0.5);
  g.fillCircle(24, 24, 10);
  g.generateTexture('tex-spot', 48, 48);
  g.destroy();
}

function bakeKeyed(scene: Phaser.Scene, src: string, dest: string): boolean {
  if (!scene.textures.exists(src)) return false;
  const canvas = scene.textures.createCanvas(dest, 16, 16);
  if (!canvas) return false;
  const ctx = canvas.context;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scene.textures.get(src).getSourceImage() as CanvasImageSource, 0, 0);
  const img = ctx.getImageData(0, 0, 16, 16);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 8 && d[i + 1] < 8 && d[i + 2] < 8) d[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  canvas.refresh();
  return true;
}

function bakeFallbackSword(scene: Phaser.Scene): void {
  const canvas = scene.textures.createCanvas('tex-sword', 16, 16);
  if (!canvas) return;
  const ctx = canvas.context;
  const img = ctx.createImageData(16, 16);
  const d = img.data;
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * 16 + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  };
  for (let y = 1; y <= 10; y++) {
    put(7, y, 63, 38, 49);
    put(8, y, 192, 203, 220);
    put(9, y, 63, 38, 49);
  }
  for (let x = 5; x <= 11; x++) put(x, 11, 63, 38, 49);
  put(6, 11, 192, 203, 220);
  put(9, 11, 192, 203, 220);
  put(7, 12, 63, 38, 49);
  put(8, 12, 189, 108, 74);
  put(9, 12, 63, 38, 49);
  put(7, 13, 63, 38, 49);
  put(8, 13, 189, 108, 74);
  put(9, 13, 63, 38, 49);
  put(8, 14, 63, 38, 49);
  ctx.putImageData(img, 0, 0);
  canvas.refresh();
}

function bakeSlash(scene: Phaser.Scene): void {
  const size = 32;
  const cream: [number, number, number] = [255, 244, 192];
  const steel: [number, number, number] = [192, 203, 220];
  const edge: [number, number, number] = [63, 38, 49];
  for (let f = 0; f < 3; f++) {
    const canvas = scene.textures.createCanvas(`tex-slash-${f}`, size, size);
    if (!canvas) return;
    const ctx = canvas.context;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const cx = 11 + f;
    const cy = 16;
    const r0 = 8 + f;
    const r1 = 12 + f * 2;
    const spread = 0.72 + f * 0.22;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < r0 || dist > r1) continue;
        const ang = Math.atan2(dy, dx);
        if (Math.abs(ang) > spread) continue;
        const u = (dist - r0) / Math.max(0.001, r1 - r0);
        if (f === 2 && u < 0.45) continue;
        const [r, g, b] = u < 0.28 ? cream : u < 0.72 ? steel : edge;
        const i = (y * size + x) * 4;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    canvas.refresh();
  }
  if (!scene.textures.exists('tex-slash-0')) return;
  scene.anims.create({
    key: 'slash-arc',
    frames: [{ key: 'tex-slash-0' }, { key: 'tex-slash-1' }, { key: 'tex-slash-2' }],
    frameRate: 18,
    repeat: 0,
  });
}

function bakeSpark(scene: Phaser.Scene): void {
  const canvas = scene.textures.createCanvas('tex-spark', 8, 8);
  if (!canvas) return;
  const ctx = canvas.context;
  const img = ctx.createImageData(8, 8);
  const d = img.data;
  const put = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    const i = (y * 8 + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = a;
  };
  put(3, 0, 255, 244, 192, 255);
  put(4, 0, 255, 244, 192, 200);
  put(3, 1, 192, 203, 220, 255);
  put(4, 1, 255, 255, 255, 255);
  put(2, 3, 255, 244, 192, 255);
  put(3, 3, 255, 255, 255, 255);
  put(4, 3, 255, 255, 255, 255);
  put(5, 3, 255, 244, 192, 255);
  put(3, 5, 192, 203, 220, 255);
  put(4, 5, 255, 244, 192, 255);
  put(3, 6, 255, 244, 192, 200);
  put(4, 7, 63, 38, 49, 180);
  ctx.putImageData(img, 0, 0);
  canvas.refresh();
}

function bakeGlow(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0xffb060, 0.45);
  g.fillCircle(12, 12, 11);
  g.fillStyle(0xfff0c0, 0.55);
  g.fillCircle(12, 12, 5);
  g.generateTexture('tex-glow', 24, 24);
  g.destroy();
}

export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    this.load.image('tex-floor', tile(48));
    this.load.image('tex-floor-a', tile(49));
    this.load.image('tex-floor-b', tile(50));
    this.load.image('tex-wall', tile(2));
    this.load.image('tex-wall-s', tile(0));
    this.load.image('tex-wall-w', tile(36));
    this.load.image('tex-wall-e', tile(38));
    this.load.image('tex-wall-nw', tile(1));
    this.load.image('tex-wall-ne', tile(3));
    this.load.image('tex-player', tile(85));
    preloadLooks(this);
    this.load.image('tex-slime', tile(108));
    this.load.image('tex-chest', tile(89));
    this.load.image('tex-chest-open', tile(90));
    this.load.image('tex-crate', tile(63));
    this.load.image('tex-door', tile(77));
    this.load.image('tex-door-open', tile(78));
    this.load.image('tex-shrine', tile(32));
    this.load.image('tex-torch', tile(130));
    this.load.image('tex-ghost', tile(121));
    this.load.image('tex-crab', tile(110));
    this.load.image('tex-fountain', tile(56));
    this.load.image('tex-heart', '/assets/items/heart_container.png');
    this.load.image('tex-item-sword', '/assets/items/sword_short.png');
    this.load.audio('mus-fountain', '/assets/music/fairy_fountain.mp3');
    this.load.audio('mus-cave', '/assets/music/cave.mp3');
    this.load.audio('mus-boss', '/assets/music/dungeon_boss.mp3');
  }

  create(): void {
    if (!this.textures.exists('tex-player')) bakeGrey(this);
    if (!this.textures.exists('tex-ghost')) bake(this, 'tex-ghost', 0xc5d0dc, 0x8aa0b4);
    if (!this.textures.exists('tex-crab')) bake(this, 'tex-crab', 0xb85c38, 0x6e2c12);
    if (!this.textures.exists('tex-fountain')) bake(this, 'tex-fountain', 0x5a8cff, 0xc9a86a);
    bakeSpot(this);
    bakeGlow(this);
    if (!bakeKeyed(this, 'tex-item-sword', 'tex-sword')) bakeFallbackSword(this);
    bakeSlash(this);
    bakeSpark(this);
    ensureLookWalk(this, 'wanderer');
    this.scene.start('Overworld');
  }
}
