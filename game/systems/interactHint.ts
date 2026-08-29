// World glow on the pane-worthy sprite. The Enter plaque is HTML (HUD-sized)
// because camera zoom would stretch world text across the room.

import Phaser from 'phaser';
import type { Facing } from '../../lib/sim/types';
import { world } from '../../lib/sim/store';
import { getActiveSessionId } from '../../lib/client/paneSessions';
import { hideInteractHint, setInteractHintAnchor } from '../interactHintAnchor';
import { isWorldInputBlocked } from '../inputCapture';
import { worldToOverlay } from '../playerAnchor';
import { isPaneInteractable, pickAdjacentEntity } from './interactTarget';

const AMBER = 0xc9a86a;
const GLOW_ALPHA = 0.28;
const RING_STROKE = 0.4;
const RING_FILL = 0.06;

type Host = Phaser.Scene & {
  player: Phaser.Physics.Arcade.Sprite;
  entityLayer: Phaser.GameObjects.Container;
  facing: Facing;
};

export function installInteractHint(scene: Phaser.Scene): () => void {
  const s = scene as Host;
  const glow = scene.textures.exists('tex-spot')
    ? scene.add.image(0, 0, 'tex-spot').setVisible(false).setDepth(18).setAlpha(GLOW_ALPHA)
    : null;
  const ring = scene.add.graphics().setDepth(18);

  const hide = (): void => {
    glow?.setVisible(false);
    ring.clear();
    hideInteractHint();
  };

  const onUpdate = (): void => {
    if (isWorldInputBlocked()) {
      hide();
      return;
    }
    const entity = pickAdjacentEntity(world(), s.facing, isPaneInteractable);
    if (!entity || getActiveSessionId() === entity.id) {
      hide();
      return;
    }
    const sprite = s.entityLayer.getByName(entity.id) as Phaser.Physics.Arcade.Sprite | null;
    if (!sprite?.active) {
      hide();
      return;
    }

    const tx = sprite.x;
    const ty = sprite.y;
    glow?.setPosition(tx, ty).setVisible(true).setScale(0.55);
    ring.clear();
    ring.fillStyle(AMBER, RING_FILL);
    ring.fillRect(tx - 8, ty - 8, 16, 16);
    ring.lineStyle(1, AMBER, RING_STROKE);
    ring.strokeRect(tx - 8.5, ty - 8.5, 17, 17);

    const canvas = scene.game.canvas;
    const overlay = canvas.closest('main') ?? canvas.parentElement;
    if (!overlay) {
      hideInteractHint();
      return;
    }
    const view = scene.cameras.main.worldView;
    const canvasBox = canvas.getBoundingClientRect();
    const overlayBox = overlay.getBoundingClientRect();
    const screen = worldToOverlay(tx, ty, {
      viewX: view.x,
      viewY: view.y,
      viewW: view.width,
      viewH: view.height,
      canvasLeft: canvasBox.left,
      canvasTop: canvasBox.top,
      canvasW: canvasBox.width,
      canvasH: canvasBox.height,
      overlayLeft: overlayBox.left,
      overlayTop: overlayBox.top,
    });
    setInteractHintAnchor({
      visible: true,
      x: Math.round(screen.x),
      y: Math.round(screen.y),
      name: entity.name,
    });
  };

  scene.events.on('postupdate', onUpdate);
  return () => {
    scene.events.off('postupdate', onUpdate);
    hide();
    glow?.destroy();
    ring.destroy();
  };
}
