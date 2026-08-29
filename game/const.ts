// Pixel-art constants from ASSETS.md §1. Kept out of main.ts so scenes can
// import them without a cycle through the Phaser.Game constructor.

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;
export const TILE = 16;
export const CAMERA_ZOOM = 2;
/** Full-tile AABBs cannot pass a 1-tile wall gap (Arcade treats touching edges as solid). */
export const PROP_BODY = 10;
/** Scavenger and foes share this box — physics collision and contact damage. */
export const ACTOR_BODY = 6;
export const WALL_BODY = 12;
export const SFX_VOLUME = 0.5;
export const MUSIC_VOLUME = 0.25;
