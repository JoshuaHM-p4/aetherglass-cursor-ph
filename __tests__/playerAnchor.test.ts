import { describe, expect, it } from 'vitest';
import { paneBoxBesidePlayer, worldToOverlay } from '../game/playerAnchor';

describe('worldToOverlay', () => {
  it('maps the camera centre onto the canvas centre in overlay space', () => {
    const p = worldToOverlay(200, 100, {
      viewX: 80,
      viewY: 32,
      viewW: 240,
      viewH: 135,
      canvasLeft: 40,
      canvasTop: 20,
      canvasW: 960,
      canvasH: 540,
      overlayLeft: 0,
      overlayTop: 0,
    });
    expect(p.x).toBe(40 + ((200 - 80) / 240) * 960);
    expect(p.y).toBe(20 + ((100 - 32) / 135) * 540);
  });
});

describe('paneBoxBesidePlayer', () => {
  it('sits on the facing shoulder, not the viewport edge', () => {
    const box = paneBoxBesidePlayer(
      { x: 400, y: 300, facing: 1 },
      { w: 260, h: 180 },
      { w: 1280, h: 720 },
    );
    expect(box.left).toBe(428);
    expect(box.top).toBeGreaterThan(100);
    expect(box.top).toBeLessThan(300);
    expect(box.left).not.toBeGreaterThan(1280 - 260 - 12);
  });

  it('flips to the other shoulder when the preferred side would clip', () => {
    const box = paneBoxBesidePlayer(
      { x: 1200, y: 300, facing: 1 },
      { w: 260, h: 180 },
      { w: 1280, h: 720 },
    );
    expect(box.left).toBeLessThan(1200);
  });
});
