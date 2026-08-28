// game/systems/proximity.ts
//
// Who is near the player, computed by the physics engine rather than by scanning state.
//
// WHY IT MATTERS: this runs in the 60fps path. A naive implementation reads
// `gameStore.getState().state.entities` every frame and computes distances — 30 entities
// x 60 frames x nothing gained. Instead each interactable sprite gets two arcade sensor
// circles at spawn:
//
//   reach ring    (1 tile)  -> 'world:interact' eligibility + the "press Enter" glyph
//   approach ring (3 tiles) -> 'world:proximity_enter' -> PrefetchController.arm()
//
// Overlap begin/end are already events in arcade physics, so the bus events fire exactly
// once per crossing and the per-frame cost is the physics engine's, which we are paying
// for movement anyway. No spatial index in lib/sim, no distance code duplicated between
// the sim and the scene (`select.distanceTo` exists for the packet, and only for that).

export interface ProximitySpawnArgs {
  /** `sprite.name` is already the entity id — set at spawn, single source of ids. */
  sprite: Phaser.Physics.Arcade.Sprite;
  paneWorthy: boolean;
}

export const RINGS = { reachTiles: 1, approachTiles: 3, tile: 16 } as const;

/** Called once per interactable at spawn time, from Overworld's entity pass. */
export function attachProximityRings(
  scene: Phaser.Scene,
  args: ProximitySpawnArgs,
): void {
  throw new Error('not implemented');
}

/**
 * Installs the overlap handlers and the Enter key binding.
 *
 * The interact target is "the nearest entity inside the reach ring, ties broken by
 * facing" — computed from the current overlap set, which is small (0-3 sprites), not
 * from the entity table.
 */
export function installProximitySystem(scene: Phaser.Scene): () => void {
  throw new Error('not implemented');
  // TODO  on approach-enter, if paneWorthy: bus.emit('world:proximity_enter', ...)
  //       on approach-exit:                 bus.emit('world:proximity_exit', ...)
  //       on reach-enter/exit:              bus.emit('world:interact'/'world:interact_clear')
  //       Enter key while a reach target exists -> bus.emit('world:interact', { entityId })
}
