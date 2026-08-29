// Four cues from ASSETS.md §6, baked into AudioBuffers. Phaser is never asked to
// fetch a file. Resume-on-gesture is required: browsers start the context suspended.

import Phaser from 'phaser';
import { bus } from '../EventBus';
import { gameStore } from '../../lib/sim/store';
import { getSfxVolume } from './volume';
import { playFileSfx, preloadFileSfx } from './fileSfx';
import { foeVoiceCue, weaponHitCue, weaponUseCue } from './combatSfx';
import type { Item } from '../../lib/sim/types';

export { playFileSfx } from './fileSfx';

type Cue =
  | 'step_a'
  | 'step_b'
  | 'swing'
  | 'thump'
  | 'axe'
  | 'magic'
  | 'bolt'
  | 'hit'
  | 'thump_hit'
  | 'magic_hit'
  | 'hurt'
  | 'chest'
  | 'glass'
  | 'glass_close'
  | 'pickup'
  | 'death'
  | 'bat'
  | 'spider'
  | 'slime'
  | 'cyclops'
  | 'cyclops_warn'
  | 'rat';

const VOL: Record<Cue, number> = {
  step_a: 0.22,
  step_b: 0.2,
  swing: 0.28,
  thump: 0.48,
  axe: 0.34,
  magic: 0.3,
  bolt: 0.26,
  hit: 0.38,
  thump_hit: 0.46,
  magic_hit: 0.34,
  hurt: 0.34,
  chest: 0.32,
  glass: 0.28,
  glass_close: 0.18,
  pickup: 0.34,
  death: 0.42,
  bat: 0.3,
  spider: 0.28,
  slime: 0.32,
  cyclops: 0.42,
  cyclops_warn: 0.34,
  rat: 0.26,
};

type Bank = Record<Cue, AudioBuffer>;

let ctx: AudioContext | null = null;
let bank: Bank | null = null;
let glassOpen = false;
let stepFlip = false;
let lastHp = Infinity;
/** Item ids already seen this run. Seeded from the bag so the starting sword is not a discovery. */
const found = new Set<string>();

function rememberHeld(): void {
  found.clear();
  const player = gameStore.getState().state.player;
  for (const item of player.bag) found.add(item.id);
  for (const id of player.hotbar) if (id) found.add(id);
}

function markDiscovery(itemId: string): boolean {
  const fresh = !found.has(itemId);
  found.add(itemId);
  return fresh;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx && ctx.state !== 'closed') return ctx;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new Ctor();
  return ctx;
}

function resume(): void {
  const a = audio();
  if (a?.state === 'suspended') void a.resume();
}

function env(t: number, attack: number, release: number, dur: number): number {
  if (t < attack) return t / attack;
  const tail = (dur - t) / release;
  return tail < 1 ? Math.max(0, tail) : 1;
}

function bake(a: AudioContext, seconds: number, fn: (t: number, dur: number) => number): AudioBuffer {
  const n = Math.max(1, Math.floor(seconds * a.sampleRate));
  const buf = a.createBuffer(1, n, a.sampleRate);
  const data = buf.getChannelData(0);
  const dur = n / a.sampleRate;
  for (let i = 0; i < n; i++) {
    const s = fn(i / a.sampleRate, dur);
    data[i] = s < -1 ? -1 : s > 1 ? 1 : s;
  }
  return buf;
}

function noise(): number {
  return Math.random() * 2 - 1;
}

function buildBank(a: AudioContext): Bank {
  const step = (bright: number) =>
    bake(a, 0.09, (t, dur) => {
      const e = env(t, 0.004, 0.07, dur);
      return (Math.sin(2 * Math.PI * (90 + bright * 40) * t) * 0.35 + noise() * 0.55) * e;
    });

  return {
    step_a: step(0),
    step_b: step(1),
    swing: bake(a, 0.14, (t, dur) => {
      const e = env(t, 0.006, 0.1, dur);
      return noise() * e * (0.35 + 0.65 * (1 - t / dur));
    }),
    thump: bake(a, 0.32, (t, dur) => {
      const e = Math.exp(-t * 9) * env(t, 0.004, 0.18, dur);
      return (
        Math.sin(2 * Math.PI * 42 * t) * 0.85 +
        Math.sin(2 * Math.PI * 68 * t) * 0.4 +
        noise() * 0.28 * Math.exp(-t * 22)
      ) * e;
    }),
    axe: bake(a, 0.2, (t, dur) => {
      const e = env(t, 0.01, 0.14, dur);
      const f = 110 - t * 40;
      return (Math.sin(2 * Math.PI * f * t) * 0.55 + noise() * 0.4) * e;
    }),
    magic: bake(a, 0.34, (t, dur) => {
      const e = env(t, 0.012, 0.22, dur);
      const f = 540 + t * 480;
      return (
        Math.sin(2 * Math.PI * f * t) * 0.42 +
        Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.22 +
        Math.sin(2 * Math.PI * 1174 * t) * 0.12 * Math.exp(-t * 4)
      ) * e;
    }),
    bolt: bake(a, 0.2, (t, dur) => {
      const e = env(t, 0.004, 0.12, dur);
      const f = 980 - t * 720;
      return (Math.sin(2 * Math.PI * Math.max(160, f) * t) * 0.4 + noise() * 0.22) * e;
    }),
    hit: bake(a, 0.18, (t, dur) => {
      const e = Math.exp(-t * 18);
      return (Math.sin(2 * Math.PI * 70 * t) * 0.7 + noise() * 0.35) * e * env(t, 0.002, 0.12, dur);
    }),
    thump_hit: bake(a, 0.26, (t, dur) => {
      const e = Math.exp(-t * 11) * env(t, 0.002, 0.16, dur);
      return (Math.sin(2 * Math.PI * 48 * t) * 0.8 + noise() * 0.4) * e;
    }),
    magic_hit: bake(a, 0.2, (t, dur) => {
      const e = Math.exp(-t * 14) * env(t, 0.003, 0.12, dur);
      return (
        Math.sin(2 * Math.PI * 660 * t) * 0.45 +
        Math.sin(2 * Math.PI * 990 * t) * 0.22 +
        noise() * 0.12
      ) * e;
    }),
    bat: bake(a, 0.26, (t, dur) => {
      const e = env(t, 0.006, 0.12, dur);
      const f = 2600 - t * 1600;
      return (
        Math.sin(2 * Math.PI * f * t) * 0.5 +
        Math.sin(2 * Math.PI * (f * 1.07) * t) * 0.22
      ) * e;
    }),
    spider: bake(a, 0.38, (t, dur) => {
      const e = env(t, 0.03, 0.2, dur);
      const n = noise();
      return (n * 0.55 + Math.sin(2 * Math.PI * 3400 * t) * n * 0.28) * e;
    }),
    slime: bake(a, 0.22, (t, dur) => {
      const e = env(t, 0.01, 0.14, dur);
      const f = 78 + Math.sin(t * 55) * 28;
      return (Math.sin(2 * Math.PI * f * t) * 0.62 + noise() * 0.22 * Math.exp(-t * 16)) * e;
    }),
    cyclops: bake(a, 0.62, (t, dur) => {
      const e = env(t, 0.03, 0.32, dur);
      const f = 150 - t * 85;
      const vibr = 1 + Math.sin(2 * Math.PI * 5.5 * t) * 0.05;
      return (
        Math.sin(2 * Math.PI * Math.max(48, f) * t * vibr) * 0.62 +
        Math.sin(2 * Math.PI * Math.max(70, f * 1.45) * t) * 0.28 +
        noise() * 0.1
      ) * e;
    }),
    cyclops_warn: bake(a, 0.38, (t, dur) => {
      const e = env(t, 0.04, 0.18, dur);
      const f = 90 + t * 70;
      return (
        Math.sin(2 * Math.PI * f * t) * 0.5 +
        Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.18 +
        noise() * 0.16 * Math.exp(-t * 6)
      ) * e;
    }),
    rat: bake(a, 0.16, (t, dur) => {
      const e = env(t, 0.004, 0.08, dur);
      const chirp = t < 0.07 ? 2100 - t * 2400 : 1750 - (t - 0.07) * 1800;
      const gate = t < 0.055 || t > 0.075 ? 1 : 0.15;
      return Math.sin(2 * Math.PI * Math.max(700, chirp) * t) * e * 0.55 * gate;
    }),
    hurt: bake(a, 0.22, (t, dur) => {
      const e = env(t, 0.004, 0.16, dur);
      const f = 320 - t * 900;
      return Math.sin(2 * Math.PI * Math.max(70, f) * t) * e * 0.7;
    }),
    chest: bake(a, 0.42, (t, dur) => {
      const e = env(t, 0.02, 0.22, dur);
      const f = 210 - t * 140;
      return (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * (f * 1.34) * t) * 0.4 + noise() * 0.12) * e * 0.55;
    }),
    glass: bake(a, 1.1, (t, dur) => {
      const e = Math.exp(-t * 2.4) * env(t, 0.006, 0.35, dur);
      return (
        Math.sin(2 * Math.PI * 784 * t) * 0.55 +
        Math.sin(2 * Math.PI * 1176 * t) * 0.28 +
        Math.sin(2 * Math.PI * 1568 * t) * 0.12
      ) * e;
    }),
    glass_close: bake(a, 0.35, (t, dur) => {
      const e = Math.exp(-t * 8) * env(t, 0.004, 0.2, dur);
      return Math.sin(2 * Math.PI * 523 * t) * e * 0.45;
    }),
    pickup: bake(a, 0.28, (t, dur) => {
      const e = env(t, 0.004, 0.16, dur);
      const f = 720 + t * 520;
      return (
        Math.sin(2 * Math.PI * f * t) * 0.55 +
        Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.18
      ) * e;
    }),
    death: bake(a, 1.4, (t, dur) => {
      const e = env(t, 0.02, 0.7, dur);
      const f = 180 - t * 110;
      return (
        Math.sin(2 * Math.PI * Math.max(40, f) * t) * 0.55 +
        Math.sin(2 * Math.PI * 784 * t) * Math.exp(-t * 6) * 0.18 +
        noise() * 0.12 * Math.exp(-t * 4)
      ) * e;
    }),
  };
}

function play(cue: Cue, rate = 1): void {
  const a = audio();
  if (!a || !bank) return;
  resume();
  const src = a.createBufferSource();
  src.buffer = bank[cue];
  src.playbackRate.value = rate;
  const gain = a.createGain();
  gain.gain.value = VOL[cue] * getSfxVolume();
  src.connect(gain).connect(a.destination);
  src.start();
}

export function playSfx(cue: 'swing' | 'hit'): void {
  if (cue === 'swing') play('swing', 0.92 + Math.random() * 0.16);
  else play('hit', 0.94 + Math.random() * 0.12);
}

function jitter(lo: number, span: number): number {
  return lo + Math.random() * span;
}

export function playWeaponUse(item: Item | undefined): void {
  const cue = weaponUseCue(item);
  if (cue === 'magic') {
    play('magic', jitter(0.96, 0.1));
    play('bolt', jitter(0.94, 0.12));
    return;
  }
  if (cue === 'thump') {
    play('thump', jitter(0.88, 0.1));
    return;
  }
  if (cue === 'axe') {
    play('axe', jitter(0.72, 0.1));
    return;
  }
  play('swing', jitter(0.92, 0.16));
}

export function playWeaponHit(item: Item | undefined): void {
  const cue = weaponHitCue(item);
  if (cue === 'thump_hit') play('thump_hit', jitter(0.9, 0.1));
  else if (cue === 'magic_hit') play('magic_hit', jitter(0.94, 0.1));
  else play('hit', jitter(0.94, 0.12));
}

const lastFoeAt = new Map<string, number>();

export function playFoeVoice(entityId: string, tags: readonly string[], gapMs = 0): void {
  const cue = foeVoiceCue(tags);
  if (!cue) return;
  const now = typeof performance === 'undefined' ? Date.now() : performance.now();
  if (now - (lastFoeAt.get(entityId) ?? 0) < gapMs) return;
  lastFoeAt.set(entityId, now);
  if (cue === 'bat') play('bat', jitter(0.92, 0.16));
  else if (cue === 'spider') play('spider', jitter(0.94, 0.1));
  else if (cue === 'slime') play('slime', jitter(0.9, 0.16));
  else if (cue === 'rat') play('rat', jitter(0.94, 0.14));
  else play('cyclops', jitter(0.86, 0.12));
}

export function playCyclopsWarn(): void {
  play('cyclops_warn', jitter(0.94, 0.08));
}

export function installSoundSystem(scene: Phaser.Scene): () => void {
  const a = audio();
  if (a) bank = buildBank(a);
  lastHp = gameStore.getState().state.player.hp;
  rememberHeld();
  preloadFileSfx();

  const unlock = () => {
    resume();
  };
  scene.input.on('pointerdown', unlock);
  const onKey = () => unlock();
  window.addEventListener('keydown', onKey);

  const offTile = bus.on('world:tile_entered', () => {
    stepFlip = !stepFlip;
    play(stepFlip ? 'step_a' : 'step_b', 0.9 + Math.random() * 0.2);
  });
  const offHurt = bus.on('world:player_hurt', () => play('hurt', 0.95 + Math.random() * 0.1));
  const offHit = bus.on('world:attack_landed', ({ withItemId }) => {
    const item = withItemId
      ? gameStore.getState().state.player.bag.find((i) => i.id === withItemId)
      : undefined;
    playWeaponHit(item);
  });
  const offEvent = bus.on('sim:event', (event) => {
    if (event.type === 'container_opened') play('chest');
    if (event.type === 'item_gained') {
      const fresh = markDiscovery(event.itemId);
      if (event.itemId === 'key') playFileSfx('key');
      else if (event.itemId === 'heart_container') {
        playFileSfx('heart');
        playFileSfx('fanfare');
      } else if (event.itemId === 'master_key') playFileSfx('secret');
      else play('pickup', 0.94 + Math.random() * 0.14);
      if (fresh && event.itemId !== 'heart_container') playFileSfx('fanfare');
    }
    if (event.type === 'crafted') {
      const fresh = markDiscovery(event.itemId);
      play('pickup', 0.94 + Math.random() * 0.14);
      if (fresh) playFileSfx('fanfare');
    }
    if (event.type === 'pane_cracked') play('glass_close', 1.3);
    if (event.type === 'player_died') play('death');
    if (event.type === 'entity_state_changed' && event.state === 'unlocked') {
      const entity = gameStore.getState().state.entities[event.entityId];
      playFileSfx(entity?.tags.includes('master_lock') ? 'dungeonDoor' : 'door');
    }
    if (event.type === 'room_entered' && event.kind === 'master') playFileSfx('secret');
    if (event.type === 'damaged') {
      const hp = gameStore.getState().state.player.hp;
      if (hp > 0 && hp <= 2 && lastHp > 2) playFileSfx('lowHealth');
      lastHp = hp;
    }
    if (event.type === 'healed' || event.type === 'returned_fountain' || event.type === 'heart_gained') {
      lastHp = gameStore.getState().state.player.hp;
    }
  });
  const offAwake = bus.on('pane:awake', ({ open }) => {
    if (open && !glassOpen) play('glass');
    if (!open && glassOpen) play('glass_close');
    glassOpen = open;
  });
  const offIntro = bus.on('pane:intro', ({ cue }) => {
    if (cue === 'hey') playFileSfx('hey');
  });
  const offHydrate = bus.on('sim:hydrated', () => {
    rememberHeld();
  });

  return () => {
    offTile();
    offHurt();
    offHit();
    offEvent();
    offAwake();
    offIntro();
    offHydrate();
    scene.input.off('pointerdown', unlock);
    window.removeEventListener('keydown', onKey);
  };
}
