// Persistent highlight for the object the glass is speaking about, plus a dimmer
// mark on parked sessions the player can walk back to.

import Phaser from 'phaser';
import {
  getActiveSessionId,
  parkedSessionIds,
  subscribePaneSessions,
} from '../../lib/client/paneSessions';

type MarkedScene = Phaser.Scene & {
  entityLayer: Phaser.GameObjects.Container;
};

const ACTIVE = 0xc9a86a;
const PARKED = 0x7a6844;

export function installSessionMarks(scene: Phaser.Scene): () => void {
  const s = scene as MarkedScene;
  const marks = new Map<string, Phaser.GameObjects.Rectangle>();
  let pulse: Phaser.Tweens.Tween | null = null;

  const ringAt = (entityId: string, active: boolean) => {
    const sprite = s.entityLayer.getByName(entityId) as Phaser.GameObjects.Image | null;
    if (!sprite) return;
    let mark = marks.get(entityId);
    if (!mark) {
      mark = scene.add.rectangle(sprite.x, sprite.y, 18, 18).setDepth(19);
      marks.set(entityId, mark);
    }
    mark.setPosition(sprite.x, sprite.y);
    mark.setStrokeStyle(active ? 1.5 : 1, active ? ACTIVE : PARKED, active ? 0.95 : 0.45);
    mark.setFillStyle(active ? ACTIVE : PARKED, active ? 0.12 : 0.04);
    mark.setVisible(true);
  };

  const sync = () => {
    const active = getActiveSessionId();
    const parked = parkedSessionIds();
    const keep = new Set<string>([...parked, ...(active ? [active] : [])]);
    for (const [id, mark] of marks) {
      if (!keep.has(id)) {
        mark.destroy();
        marks.delete(id);
      }
    }
    pulse?.stop();
    pulse = null;
    for (const id of parked) ringAt(id, false);
    if (active) {
      ringAt(active, true);
      const mark = marks.get(active);
      if (mark) {
        pulse = scene.tweens.add({
          targets: mark,
          alpha: { from: 0.7, to: 1 },
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  };

  const unsub = subscribePaneSessions(sync);
  sync();
  return () => {
    unsub();
    pulse?.stop();
    for (const mark of marks.values()) mark.destroy();
    marks.clear();
  };
}
