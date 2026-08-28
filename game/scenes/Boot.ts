// game/scenes/Boot.ts
//
// First scene. H0: proves the canvas renders with a placeholder. H2: hands off
// to Preload, which hands off to Overworld.

import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.add.graphics();
    g.fillStyle(0x1a1e2e, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.lineStyle(1, 0x3a4055, 1);
    for (let x = 0; x <= GAME_WIDTH; x += 16) g.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 16) g.lineBetween(0, y, GAME_WIDTH, y);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'AETHERGLASS', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#c9a86a',
      })
      .setOrigin(0.5);

    this.scene.start('Preload');
  }
}
