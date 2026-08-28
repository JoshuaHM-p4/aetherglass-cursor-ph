// game/scenes/Overworld.ts
//
// Where the store meets the scene graph. The most important twenty lines in the game
// layer, because this is where "Phaser is downstream of the sim, not beside it" is either
// true or a comment.
//
// HOW PHASER READS TRUTH: `gameStore.subscribe` in `create()`, torn down in `shutdown()`.
// Not props (AGENTS.md #6 — the canvas takes none and never re-mounts), and not the bus
// (facts are not moments). The subscription is coarse — one callback, diffed against the
// previous state — because the number of sprites is ~30 and a per-entity selector web
// costs more than the diff.
//
// WHAT IT SYNCS: entity `state` -> texture frame + physics body enabled. Player tile ->
// nothing (Phaser owns the player's pixel position; the sim's `player.tx/ty` is a
// downstream record of tile crossings, not the authority on where the sprite is). That
// asymmetry is deliberate and is the only place the sim is NOT the source of truth: it
// would otherwise mean quantising smooth movement through a reducer at 60fps.

export interface OverworldRefs {
  entityLayer: Phaser.GameObjects.Container;
  player: Phaser.Physics.Arcade.Sprite;
  dimLayer: Phaser.GameObjects.Rectangle;
  spotlight: Phaser.GameObjects.Image;
  leaderLine: Phaser.GameObjects.Graphics;
}

export declare class Overworld extends Phaser.Scene implements OverworldRefs {
  entityLayer: Phaser.GameObjects.Container;
  player: Phaser.Physics.Arcade.Sprite;
  dimLayer: Phaser.GameObjects.Rectangle;
  spotlight: Phaser.GameObjects.Image;
  leaderLine: Phaser.GameObjects.Graphics;

  create(): void;
  /** Movement only. Everything else is event-driven. */
  update(time: number, delta: number): void;
  shutdown(): void;

  /**
   * One sprite per sim entity, `sprite.name = entity.id`. Called on `sim:hydrated`, so
   * the hardcoded map (H2) and the LDtk map (H8) take the identical path — which is what
   * makes cut-list item 5 ("keep the hardcoded map") free.
   */
  spawnEntities(): void;

  /** Diff the previous state against the next and touch only what changed. */
  syncFromStore(): void;
}
