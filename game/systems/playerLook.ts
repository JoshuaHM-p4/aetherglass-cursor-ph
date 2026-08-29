// Kenney Tiny Dungeon bodies. Menu picker uses the PNG directly; Phaser blits
// a walk cycle the same way Preload used to for the single wanderer sprite.

import Phaser from 'phaser';
import { APPEARANCES, appearanceOf, appearanceTileSrc } from '../../lib/sim/appearances';

export function lookTextureKey(id: string): string {
  return `tex-look-${appearanceOf(id).id}`;
}

export function walkAnimKey(id: string): string {
  return `walk-${appearanceOf(id).id}`;
}

export function preloadLooks(scene: Phaser.Scene): void {
  for (const look of APPEARANCES) {
    scene.load.image(lookTextureKey(look.id), appearanceTileSrc(look.id));
  }
}

function stampWalkFrame(
  scene: Phaser.Scene,
  src: string,
  dest: string,
  bodyDy: number,
  legDx: number,
): void {
  if (scene.textures.exists(dest)) return;
  const canvas = scene.textures.createCanvas(dest, 16, 16);
  if (!canvas) return;
  const ctx = canvas.context;
  ctx.imageSmoothingEnabled = false;
  const img = scene.textures.get(src).getSourceImage() as CanvasImageSource;
  const torso = 10;
  ctx.drawImage(img, 0, 0, 16, torso, 0, bodyDy, 16, torso);
  ctx.drawImage(img, 0, torso, 16, 16 - torso, legDx, torso + bodyDy, 16, 16 - torso);
  canvas.refresh();
}

export function ensureLookWalk(scene: Phaser.Scene, appearanceId: string): string {
  const id = appearanceOf(appearanceId).id;
  const anim = walkAnimKey(id);
  if (scene.anims.exists(anim)) return anim;
  const src = lookTextureKey(id);
  if (!scene.textures.exists(src)) return 'player-walk';
  const left = `${src}-l`;
  const right = `${src}-r`;
  stampWalkFrame(scene, src, left, 1, -1);
  stampWalkFrame(scene, src, right, 1, 1);
  if (!scene.textures.exists(left) || !scene.textures.exists(right)) return 'player-walk';
  scene.anims.create({
    key: anim,
    frames: [{ key: src }, { key: left }, { key: src }, { key: right }],
    frameRate: 10,
    repeat: -1,
  });
  return anim;
}

export function applyPlayerLook(
  scene: Phaser.Scene,
  sprite: Phaser.Physics.Arcade.Sprite,
  appearanceId: string,
): string {
  const src = lookTextureKey(appearanceId);
  const tex = scene.textures.exists(src) ? src : 'tex-player';
  const anim = ensureLookWalk(scene, appearanceId);
  if (sprite.texture.key !== tex) sprite.setTexture(tex);
  return anim;
}
