// game/scenes/Preload.ts
//
// Asset loading. Empty at H0; H6 loads the art pack here. Grey-box textures are
// generated, never loaded, so this scene stays load-only.

import Phaser from 'phaser';

export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }
}
