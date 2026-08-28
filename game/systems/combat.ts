// game/systems/combat.ts
//
// Space to swing. AGENTS.md #5: NO LLM CALLS HERE, EVER. This is a 60fps path.
//
// The split that keeps it honest: Phaser owns the hitbox, the animation, and the
// question "did the blade overlap that sprite this frame". The sim owns the question
// "does that hit count, and for how much". So this file computes geometry and emits
// `world:attack_landed`; it never reads or writes hp.
//
// Enemy hp lives on `Entity.hp` in the sim (which is why STRIKE_ENTITY exists). Phaser
// keeping its own copy is the exact thing ARCHITECTURE §1.3 forbids, and it is also how
// you end up with a slime that dies twice.

import type { Facing } from '../../lib/sim/types';

export const COMBAT = {
  swingMs: 180,
  /** Post-swing lockout, so mashing Space is not a DPS strategy. */
  cooldownMs: 260,
  /** Player invulnerability after being hit, so contact damage cannot chain-kill. */
  iFramesMs: 700,
} as const;

/** Tile-space rectangle in front of the player, sized by the equipped weapon's reach. */
export function swingHitbox(
  tx: number, ty: number, facing: Facing, reachTiles: number,
): { tx: number; ty: number; w: number; h: number } {
  throw new Error('not implemented');
}

/**
 * Reads the hotbar's active item from the store ONCE PER SWING — not per frame — to get
 * damage and reach. A swing is a moment; the equipped weapon is a fact.
 */
export function installCombatSystem(scene: Phaser.Scene): () => void {
  throw new Error('not implemented');
  // TODO  Space -> animate swing -> overlap query against entityLayer
  //       -> bus.emit('world:attack_landed', { entityId, facing, withItemId })
  //       contact damage -> bus.emit('world:player_hurt', ...) with i-frames
  //       'sim:event' entity_struck -> spark + knockback tween
  //       'sim:event' entity_state_changed(dead) -> pop particles + destroy sprite
}
