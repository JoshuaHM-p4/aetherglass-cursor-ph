// Four cues from ASSETS.md §6, baked into AudioBuffers. Phaser is never asked to
// fetch a file. Resume-on-gesture is required: browsers start the context suspended.

import Phaser from 'phaser';
import { bus } from '../EventBus';
import { gameStore } from '../../lib/sim/store';
import { getSfxVolume } from './volume';
import { playFileSfx, preloadFileSfx } from './fileSfx';

export { playFileSfx } from './fileSfx';

type Cue =
  | 'step_a'
  | 'step_b'
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'chest'
  | 'glass'
  | 'glass_close'
  | 'pickup'
  | 'death';

const VOL: Record<Cue, number> = {
  step_a: 0.22,
  step_b: 0.2,
  swing: 0.28,
  hit: 0.38,
  hurt: 0.34,
  chest: 0.32,
  glass: 0.28,
  glass_close: 0.18,
  pickup: 0.24,
  death: 0.42,
};

type Bank = Record<Cue, AudioBuffer>;

let ctx: AudioContext | null = null;
let bank: Bank | null = null;
let glassOpen = false;
let stepFlip = false;
let lastHp = Infinity;

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
    hit: bake(a, 0.18, (t, dur) => {
      const e = Math.exp(-t * 18);
      return (Math.sin(2 * Math.PI * 70 * t) * 0.7 + noise() * 0.35) * e * env(t, 0.002, 0.12, dur);
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
    pickup: bake(a, 0.2, (t, dur) => {
      const e = env(t, 0.004, 0.14, dur);
      const f = 660 + t * 400;
      return Math.sin(2 * Math.PI * f * t) * e * 0.5;
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

export function installSoundSystem(scene: Phaser.Scene): () => void {
  const a = audio();
  if (a) bank = buildBank(a);
  lastHp = gameStore.getState().state.player.hp;
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
  const offHit = bus.on('world:attack_landed', () => play('hit', 0.94 + Math.random() * 0.12));
  const offEvent = bus.on('sim:event', (event) => {
    if (event.type === 'container_opened') play('chest');
    if (event.type === 'item_gained') {
      if (event.itemId === 'key') playFileSfx('key');
      else if (event.itemId === 'heart_container') {
        playFileSfx('heart');
        playFileSfx('fanfare');
      } else if (event.itemId === 'master_key') playFileSfx('secret');
      else playFileSfx('fanfare', 0.7);
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

  return () => {
    offTile();
    offHurt();
    offHit();
    offEvent();
    offAwake();
    offIntro();
    scene.input.off('pointerdown', unlock);
    window.removeEventListener('keydown', onKey);
  };
}
