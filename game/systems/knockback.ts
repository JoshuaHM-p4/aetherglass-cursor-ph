// Pixel bounce on hit. Phaser owns this; the sim never hears about it.
// No Phaser import — keep the 60fps path unit-testable.

import type { Facing } from '../../lib/sim/types';

export const KNOCK = {
  playerSpeed: 200,
  enemySpeed: 240,
  ms: 180,
} as const;

const AT = 'knockAt';
const NX = 'knockNx';
const NY = 'knockNy';
const SPEED = 'knockSpeed';
const MS = 'knockMs';
const IMMOVABLE = 'knockImmovable';

interface KnockBody {
  immovable?: boolean;
  enable?: boolean;
  setVelocity?: (x: number, y: number) => void;
}

interface KnockSprite {
  body: KnockBody | object | null;
  getData: (key: string) => unknown;
  setData: (key: string, value: unknown) => unknown;
}

function asKnockBody(body: KnockSprite['body']): KnockBody | null {
  if (!body || typeof body !== 'object') return null;
  return body as KnockBody;
}

export function facingDir(facing: Facing): { x: number; y: number } {
  if (facing === 'right') return { x: 1, y: 0 };
  if (facing === 'left') return { x: -1, y: 0 };
  if (facing === 'down') return { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

/** Unit vector from `(fx, fy)` toward `(tx, ty)`. */
export function dirFromTo(
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  fallback: { x: number; y: number } = { x: 0, y: 1 },
): { x: number; y: number } {
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return fallback;
  return { x: dx / len, y: dy / len };
}

export function knockSpeedAt(elapsedMs: number, durationMs: number, speed: number): number {
  if (elapsedMs < 0 || elapsedMs >= durationMs) return 0;
  return speed * (1 - elapsedMs / durationMs);
}

export function isKnocking(sprite: KnockSprite, now: number): boolean {
  const at = sprite.getData(AT);
  const ms = sprite.getData(MS);
  return typeof at === 'number' && typeof ms === 'number' && now < at + ms;
}

export function beginKnockback(
  sprite: KnockSprite,
  nx: number,
  ny: number,
  speed: number,
  now: number,
  ms: number = KNOCK.ms,
): void {
  const body = asKnockBody(sprite.body);
  if (body?.setVelocity) {
    if (sprite.getData(IMMOVABLE) === undefined) {
      sprite.setData(IMMOVABLE, Boolean(body.immovable));
    }
    body.immovable = false;
    body.enable = true;
    body.setVelocity(nx * speed, ny * speed);
  }
  sprite.setData(AT, now);
  sprite.setData(NX, nx);
  sprite.setData(NY, ny);
  sprite.setData(SPEED, speed);
  sprite.setData(MS, ms);
}

export function endKnockback(sprite: KnockSprite): void {
  const body = asKnockBody(sprite.body);
  const was = sprite.getData(IMMOVABLE);
  if (body?.setVelocity) {
    if (typeof was === 'boolean') body.immovable = was;
    body.setVelocity(0, 0);
  }
  sprite.setData(AT, undefined);
  sprite.setData(NX, undefined);
  sprite.setData(NY, undefined);
  sprite.setData(SPEED, undefined);
  sprite.setData(MS, undefined);
  sprite.setData(IMMOVABLE, undefined);
}

/** Apply decaying knock velocity. Returns true while the bounce is still running. */
export function tickKnockback(sprite: KnockSprite, now: number): boolean {
  if (!isKnocking(sprite, now)) {
    if (typeof sprite.getData(AT) === 'number') endKnockback(sprite);
    return false;
  }
  const body = asKnockBody(sprite.body);
  if (!body?.setVelocity) return false;
  const elapsed = now - (sprite.getData(AT) as number);
  const speed = knockSpeedAt(elapsed, sprite.getData(MS) as number, sprite.getData(SPEED) as number);
  body.setVelocity((sprite.getData(NX) as number) * speed, (sprite.getData(NY) as number) * speed);
  return true;
}
