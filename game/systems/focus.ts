// game/systems/focus.ts
//
// The signature effect. ARCHITECTURE §5 — build it early, make it look expensive.
//
// Timing is the entire effect: `pane:focus` arrives DURING generation, so the light lands
// while the sentence is still being read. Nothing here waits for the message to finish.

import type { FocusData } from '../../lib/oracle/protocol';

export interface FocusSceneParts {
  /** Container whose children are named with entity ids. `getByName(entityId)` is the lookup. */
  entityLayer: Phaser.GameObjects.Container;
  dimLayer: Phaser.GameObjects.Rectangle;
  spotlight: Phaser.GameObjects.Image;
  /**
   * Drawn inside the canvas, from the right-edge midpoint (where the Pane visually sits)
   * to the target. Deliberately NOT a DOM overlay: a DOM leader line would need the
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
  throw new Error('not implemented');
  // TODO
  //   bus.on('pane:focus', ({ entityId, style }) => { ... })
  //   bus.on('pane:focus_clear', release)
  //   style 'shatter' additionally: camera shake + the glass-crack SFX
  //   respect prefers-reduced-motion: skip the pan, keep the dim (read once, in Boot)
}

export function applyFocusStyle(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  style: FocusData['style'],
): void {
  throw new Error('not implemented');
}
