// game/systems/focus.ts
//
// The signature effect. ARCHITECTURE §5 — build it early, make it look expensive.
//
// Timing is the entire effect: `pane:focus` arrives DURING generation, so the light lands
// while the sentence is still being read. Nothing here waits for the message to finish.

import type { FocusData } from '../../lib/oracle/protocol';
import { bus } from '../EventBus';
import { applyRoomCamera } from './roomCamera';

export interface FocusSceneParts {
  /** Container whose children are named with entity ids. `getByName(entityId)` is the lookup. */
  entityLayer: Phaser.GameObjects.Container;
  player: Phaser.Physics.Arcade.Sprite;
  dimLayer: Phaser.GameObjects.Rectangle;
  spotlight: Phaser.GameObjects.Image;
  /**
   * Drawn inside the canvas, from the scavenger's shoulder (where the Pane sits) to
   * the target. Deliberately NOT a DOM overlay: a DOM leader line would need the
   * target's screen position every frame of the 400ms camera pan, which is per-frame
   * traffic across the React/Phaser boundary for a hairline.
   */
  leaderLine: Phaser.GameObjects.Graphics;
}

export const FOCUS_TIMING = {
  dimIn: 220,
  cameraPan: 400,
  dwell: 2600,
  dimOut: 400,
  /** Staggered so the line draws after the light lands, not with it. */
  leaderDelay: 180,
} as const;

/**
 * Idempotent per entity: a second `pane:focus` for the same id while one is running
 * re-triggers the pulse instead of stacking a second dim layer. The model is told "at
 * most twice per reply" and the budget in TurnSim enforces it, but a re-entrant tween
 * stack is the kind of thing that only shows up on stage, so it is handled here too.
 */
export function installFocusSystem(
  scene: Phaser.Scene & FocusSceneParts,
): () => void {
  let focused: string | null = null;
  let releaseTimer: Phaser.Time.TimerEvent | null = null;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const release = () => {
    releaseTimer?.remove();
    releaseTimer = null;
    focused = null;
    scene.tweens.add({
      targets: scene.dimLayer,
      alpha: 0,
      duration: FOCUS_TIMING.dimOut,
    });
    scene.spotlight.setVisible(false);
    scene.leaderLine.clear();
    applyRoomCamera(scene, scene.player);
  };

  const onFocus = ({ entityId, style }: FocusData) => {
    const target = scene.entityLayer.getByName(entityId) as Phaser.GameObjects.Image | null;
    if (!target) return;
    if (focused === entityId) {
      applyFocusStyle(scene, target, 'pulse');
      return;
    }
    focused = entityId;
    scene.tweens.killTweensOf(scene.dimLayer);
    scene.tweens.add({
      targets: scene.dimLayer,
      alpha: 0.55,
      duration: FOCUS_TIMING.dimIn,
    });
    scene.spotlight.setPosition(target.x, target.y).setVisible(true).setAlpha(0.85);
    if (!reduced) {
      scene.cameras.main.stopFollow();
      scene.cameras.main.pan(target.x, target.y, FOCUS_TIMING.cameraPan, 'Sine.easeInOut');
    }
    applyFocusStyle(scene, target, style);
    scene.time.delayedCall(FOCUS_TIMING.leaderDelay, () => {
      if (focused !== entityId) return;
      const px = scene.player.x + (scene.player.flipX ? -14 : 14);
      const py = scene.player.y - 4;
      scene.leaderLine.clear();
      scene.leaderLine.lineStyle(1, 0xc9a86a, 0.7);
      scene.leaderLine.lineBetween(px, py, target.x, target.y);
    });
    releaseTimer?.remove();
    releaseTimer = scene.time.delayedCall(FOCUS_TIMING.dwell, release);
  };

  const offFocus = bus.on('pane:focus', onFocus);
  const offClear = bus.on('pane:focus_clear', release);

  return () => {
    offFocus();
    offClear();
    releaseTimer?.remove();
  };
}

export function applyFocusStyle(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  style: FocusData['style'],
): void {
  if (style === 'pulse') {
    scene.tweens.add({
      targets: target,
      scale: { from: 0.9, to: 1.15 },
      yoyo: true,
      repeat: 2,
      duration: 300,
    });
  }
  if (style === 'shatter') {
    scene.cameras.main.shake(180, 0.004);
  }
}
