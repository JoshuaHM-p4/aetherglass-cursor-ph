// Pixel-art dissolve from the keep into the void. Ordered dither, not a blur:
// each side samples the wall's actual outer pixels so the wrap is the same
// brown / stone as the tile it sits against, stepping into Phaser's #0b0d14.

import Phaser from 'phaser';

const KEY = 'tex-room-fade-12';
/** World pixels of wrap outside the map. ~1.5 tiles; readable at CAMERA_ZOOM 2. */
const PAD = 24;
/** Darken the outer wall pixels so bright stone doesn't sit flush on the void. */
const INNER = 5;
const VOID: Rgb = [0x0b, 0x0d, 0x14];

/** 4×4 Bayer. 16 density steps — chunky enough to read as pixels, not noise. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

type Rgb = readonly [number, number, number];

function thresh(x: number, y: number): number {
  return (BAYER4[y & 3][x & 3] + 0.5) / 16;
}

function lerp(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** 15-bit quantize so in-between stops still look like tile colors, not a blur. */
function quant(c: Rgb): Rgb {
  const q = (n: number) => Math.round(n / 8) * 8;
  return [q(c[0]), q(c[1]), q(c[2])];
}

function dither(a: Rgb, b: Rgb, t: number, x: number, y: number): Rgb {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return t > thresh(x, y) ? b : a;
}

/**
 * Four stops from the wall pixel to the void. Adjacent stops are Bayer-mixed
 * so the wrap is a stepped pixel gradient, not a smooth lerp.
 */
function sampleRamp(edge: Rgb, t: number, x: number, y: number): Rgb {
  const s0 = edge;
  const s1 = quant(lerp(edge, VOID, 0.34));
  const s2 = quant(lerp(edge, VOID, 0.68));
  const s3 = VOID;
  const p = t * 3;
  const i = Math.min(2, Math.floor(p));
  const f = p - i;
  const from = i === 0 ? s0 : i === 1 ? s1 : s2;
  const to = i === 0 ? s1 : i === 1 ? s2 : s3;
  return dither(from, to, f, x, y);
}

function readTile(scene: Phaser.Scene, key: string): Uint8ClampedArray | null {
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  return ctx.getImageData(0, 0, 16, 16).data;
}

function pixelAt(data: Uint8ClampedArray, lx: number, ly: number): Rgb {
  const i = (ly * 16 + lx) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

export function plantRoomFade(
  scene: Phaser.Scene,
  opts: {
    mapW: number;
    mapH: number;
    tile: number;
    wallKeyAt: (tx: number, ty: number) => string;
  },
): Phaser.GameObjects.Image | null {
  const worldW = opts.mapW * opts.tile;
  const worldH = opts.mapH * opts.tile;
  const tw = worldW + PAD * 2;
  const th = worldH + PAD * 2;

  if (!scene.textures.exists(KEY)) {
    const cache = new Map<string, Uint8ClampedArray | null>();
    const tileData = (key: string) => {
      if (!cache.has(key)) cache.set(key, readTile(scene, key));
      return cache.get(key) ?? null;
    };

    const edgeColor = (wx: number, wy: number): Rgb => {
      const mx = wx < 0 ? 0 : wx >= worldW ? worldW - 1 : wx;
      const my = wy < 0 ? 0 : wy >= worldH ? worldH - 1 : wy;
      const tx = Math.floor(mx / opts.tile);
      const ty = Math.floor(my / opts.tile);
      const data = tileData(opts.wallKeyAt(tx, ty));
      if (!data) return [0x3a, 0x40, 0x55];
      const lx = wx < 0 ? 0 : wx >= worldW ? 15 : mx % opts.tile;
      const ly = wy < 0 ? 0 : wy >= worldH ? 15 : my % opts.tile;
      return pixelAt(data, lx, ly);
    };

    const canvas = scene.textures.createCanvas(KEY, tw, th);
    if (!canvas) return null;
    const ctx = canvas.context;
    const img = ctx.createImageData(tw, th);
    const out = img.data;

    for (let py = 0; py < th; py++) {
      for (let px = 0; px < tw; px++) {
        const wx = px - PAD;
        const wy = py - PAD;
        const inside = wx >= 0 && wx < worldW && wy >= 0 && wy < worldH;
        let t: number;
        if (inside) {
          const inset = Math.min(wx, wy, worldW - 1 - wx, worldH - 1 - wy);
          if (inset >= INNER) continue;
          t = ((INNER - inset) / INNER) * 0.38;
        } else {
          const ox = wx < 0 ? -wx : wx >= worldW ? wx - worldW + 1 : 0;
          const oy = wy < 0 ? -wy : wy >= worldH ? wy - worldH + 1 : 0;
          const dist = Math.max(ox, oy);
          if (dist > PAD) continue;
          t = 0.38 + (dist / PAD) * 0.62;
        }
        const rgb = sampleRamp(edgeColor(wx, wy), t, wx, wy);
        const i = (py * tw + px) * 4;
        out[i] = rgb[0];
        out[i + 1] = rgb[1];
        out[i + 2] = rgb[2];
        out[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    canvas.refresh();
  }

  // Above walls (rim darkening), below torches / entities / player.
  return scene.add.image(-PAD, -PAD, KEY).setOrigin(0, 0).setDepth(1);
}
