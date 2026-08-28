// game/scenes/Preload.ts
//
// Loads Kenney Tiny Dungeon tiles (CC0) under the same `tex-*` keys Overworld
// already draws. Grey-box bake is the fallback if a file is missing.

import Phaser from 'phaser';

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

function bakeGlow(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0xffb060, 0.45);
  g.fillCircle(12, 12, 11);
  g.fillStyle(0xfff0c0, 0.55);
  g.fillCircle(12, 12, 5);
  g.generateTexture('tex-glow', 24, 24);
  g.destroy();
}

/** Second walk frame: same sprite, one pixel down. Tiny Dungeon has no walk cycle. */
function stampShifted(scene: Phaser.Scene, src: string, dest: string, dy: number): void {
  const canvas = scene.textures.createCanvas(dest, 16, 16);
  if (!canvas) return;
  canvas.context.imageSmoothingEnabled = false;
  canvas.drawFrame(src, undefined, 0, dy);
  canvas.refresh();
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
    this.load.image('tex-slime', tile(108));
    this.load.image('tex-chest', tile(89));
    this.load.image('tex-chest-open', tile(90));
    this.load.image('tex-crate', tile(63));
    this.load.image('tex-door', tile(77));
    this.load.image('tex-door-open', tile(78));
    this.load.image('tex-shrine', tile(32));
    this.load.image('tex-torch', tile(130));
  }

  create(): void {
    if (!this.textures.exists('tex-player')) {
      bakeGrey(this);
      this.scene.start('Overworld');
      return;
    }
    bakeSpot(this);
    bakeGlow(this);
    stampShifted(this, 'tex-player', 'tex-player-step', 1);
    this.anims.create({
      key: 'player-walk',
      frames: [{ key: 'tex-player' }, { key: 'tex-player-step' }],
      frameRate: 8,
      repeat: -1,
    });
    this.scene.start('Overworld');
  }
}
