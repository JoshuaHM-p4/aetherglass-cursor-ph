// Full-screen shadow wipe used when swapping 12×12 rooms.

import Phaser from 'phaser';

export function wipeRoom(
  scene: Phaser.Scene,
  swap: () => void,
  done?: () => void,
): void {
  const cam = scene.cameras.main;
  const veil = scene.add
    .rectangle(cam.worldView.centerX, cam.worldView.centerY, cam.displayWidth + 8, cam.displayHeight + 8, 0x05060c, 0)
    .setScrollFactor(0)
    .setDepth(80);
  scene.tweens.add({
    targets: veil,
    alpha: 1,
    duration: 160,
    onComplete: () => {
      swap();
      scene.tweens.add({
        targets: veil,
        alpha: 0,
        duration: 220,
        onComplete: () => {
          veil.destroy();
          done?.();
        },
      });
    },
  });
}
