// One zoom for every 12×12. Fountain stays put only when the whole room fits;
// otherwise it follows the player the same way caves do.

import Phaser from 'phaser';
import { ROOM_SIZE } from '../../lib/dungeon/const';
import { CAMERA_ZOOM, TILE } from '../const';

const WORLD = ROOM_SIZE * TILE;
/** Visible span on the short axis, in tiles. Tight enough that follow can pan. */
const VIEW_TILES = 8;

function integerZoom(viewW: number, viewH: number, span: number): number {
  return Math.max(1, Math.floor(Math.min(viewW, viewH) / span));
}

export function viewZoom(cam: Phaser.Cameras.Scene2D.Camera): number {
  const fit = integerZoom(cam.width, cam.height, WORLD);
  const tight = integerZoom(cam.width, cam.height, VIEW_TILES * TILE);
  return Math.max(CAMERA_ZOOM, tight, fit + 1);
}

/**
 * When the viewport is larger than the room on an axis, expand bounds around
 * the 12×12 so Phaser doesn't pin the camera to 0,0.
 */
function fitBounds(cam: Phaser.Cameras.Scene2D.Camera, zoom: number): void {
  const visW = cam.width / zoom;
  const visH = cam.height / zoom;
  const w = Math.max(WORLD, visW);
  const h = Math.max(WORLD, visH);
  cam.setBounds((WORLD - w) / 2, (WORLD - h) / 2, w, h, true);
}

export function applyRoomCamera(
  scene: Phaser.Scene,
  player: Phaser.Physics.Arcade.Sprite,
): void {
  const cam = scene.cameras.main;
  cam.setSize(scene.scale.gameSize.width, scene.scale.gameSize.height);
  cam.setRoundPixels(true);
  cam.removeBounds();
  cam.stopFollow();

  const zoom = viewZoom(cam);
  cam.setZoom(zoom);
  fitBounds(cam, zoom);

  const visW = cam.width / zoom;
  const visH = cam.height / zoom;
  if (visW >= WORLD && visH >= WORLD) {
    cam.centerOn(WORLD / 2, WORLD / 2);
    return;
  }
  cam.startFollow(player, true, 1, 1);
}
