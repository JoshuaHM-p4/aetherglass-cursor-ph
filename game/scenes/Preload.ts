// game/scenes/Preload.ts
//
// Asset loading. H2 bakes grey-box textures here. H6 loads the art pack on top.
// Grey-box textures are generated, never loaded, so this scene stays load-only.

import Phaser from 'phaser';

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

export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create(): void {
    bake(this, 'tex-floor', 0x1a1e2e, 0x2a3144);
    bake(this, 'tex-wall', 0x3a4055);
    bake(this, 'tex-player', 0xc9a86a);
    bake(this, 'tex-slime', 0x6dbf8b);
    bake(this, 'tex-chest', 0xb07d4f, 0x7a4e2a);
    bake(this, 'tex-door', 0x8a6a4a);
    bake(this, 'tex-shrine', 0x7a8cff, 0xc9a86a);
    bake(this, 'tex-spot', 0xffffee);
    this.scene.start('Overworld');
  }
}
