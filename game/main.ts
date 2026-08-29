// game/main.ts
//
// Phaser.Game config. Pixel-art constants from ASSETS.md section 1: 16px tiles,
// 480×270 base resolution. EXPAND grows the buffer so the canvas fills the page
// without letterbox bars. Client-only: nothing here may be imported from a
// server component (AGENTS.md #7).
//
// Overworld joins the scene list at H2; Boot alone proves the canvas at H0.

import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './const';
import { Boot } from './scenes/Boot';
import { Preload } from './scenes/Preload';
import { Overworld } from './scenes/Overworld';

export { CAMERA_ZOOM, GAME_HEIGHT, GAME_WIDTH, TILE } from './const';

export function StartGame(parent: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#0b0d14',
    scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [Boot, Preload, Overworld],
  });
}
