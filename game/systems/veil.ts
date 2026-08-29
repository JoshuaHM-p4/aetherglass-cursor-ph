// Full-screen shadow wipe when swapping 12×12 rooms.
// The veil is laid in world space over `camera.worldView` so zoom cannot
// shrink it into a corner. Camera fade is the same shade, viewport-true.

import Phaser from 'phaser';

const SHADE = 0x05060c;
const PAD = 64;
const OUT_MS = 200;
const IN_MS = 280;

function cover(veil: Phaser.GameObjects.Rectangle, cam: Phaser.Cameras.Scene2D.Camera): void {
  const view = cam.worldView;
  veil.setPosition(view.centerX, view.centerY);
  veil.setSize(view.width + PAD, view.height + PAD);
}

export function wipeRoom(
  scene: Phaser.Scene,
  swap: () => void,
  done?: () => void,
): void {
  const cam = scene.cameras.main;
  cam.resetFX();
  const veil = scene.add.rectangle(0, 0, 8, 8, SHADE, 0).setDepth(1000);
  cover(veil, cam);
  cam.fadeOut(OUT_MS, 5, 6, 12);

  scene.tweens.add({
    targets: veil,
    alpha: 1,
    duration: OUT_MS,
    onComplete: () => {
      swap();
      cover(veil, scene.cameras.main);
      cam.fadeIn(IN_MS, 5, 6, 12);
      scene.tweens.add({
        targets: veil,
        alpha: 0,
        duration: IN_MS,
        onComplete: () => {
          if (veil.active) veil.destroy();
          cam.resetFX();
          done?.();
        },
      });
    },
  });
}
