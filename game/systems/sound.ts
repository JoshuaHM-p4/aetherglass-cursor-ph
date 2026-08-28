// Four cues from ASSETS.md §6, baked into AudioBuffers. Phaser is never asked to
// fetch a file. Resume-on-gesture is required: browsers start the context suspended.

import Phaser from 'phaser';
import { bus } from '../EventBus';

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
  | 'drone';

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
  drone: 0.07,
};

type Bank = Record<Cue, AudioBuffer>;

let ctx: AudioContext | null = null;
let bank: Bank | null = null;
let drone: AudioBufferSourceNode | null = null;
let droneGain: GainNode | null = null;
let glassOpen = false;
let stepFlip = false;

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
    drone: bake(a, 4, (t) => {
      return (
        Math.sin(2 * Math.PI * 55 * t) * 0.45 +
        Math.sin(2 * Math.PI * 82.5 * t) * 0.28 +
        Math.sin(2 * Math.PI * 110 * t) * 0.08
      ) * 0.35;
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
  gain.gain.value = VOL[cue];
  src.connect(gain).connect(a.destination);
  src.start();
}

function startDrone(): void {
  const a = audio();
  if (!a || !bank || drone) return;
  resume();
  const src = a.createBufferSource();
  src.buffer = bank.drone;
  src.loop = true;
  const gain = a.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(a.destination);
  src.start();
  gain.gain.linearRampToValueAtTime(VOL.drone, a.currentTime + 1.6);
  drone = src;
  droneGain = gain;
  src.onended = () => {
    if (drone === src) drone = null;
  };
}

function stopDrone(): void {
  try {
    drone?.stop();
  } catch {
    /* already stopped */
  }
  drone = null;
  droneGain = null;
}

export function playSfx(cue: 'swing' | 'hit'): void {
  if (cue === 'swing') play('swing', 0.92 + Math.random() * 0.16);
  else play('hit', 0.94 + Math.random() * 0.12);
}

export function installSoundSystem(scene: Phaser.Scene): () => void {
  const a = audio();
  if (a) bank = buildBank(a);

  const unlock = () => {
    resume();
    startDrone();
  };
  scene.input.on('pointerdown', unlock);
  const onKey = () => unlock();
  window.addEventListener('keydown', onKey);

  startDrone();

  const offTile = bus.on('world:tile_entered', () => {
    stepFlip = !stepFlip;
    play(stepFlip ? 'step_a' : 'step_b', 0.9 + Math.random() * 0.2);
  });
  const offHurt = bus.on('world:player_hurt', () => play('hurt', 0.95 + Math.random() * 0.1));
  const offEvent = bus.on('sim:event', (event) => {
    if (event.type === 'container_opened') play('chest');
    if (event.type === 'item_gained') play('pickup', 1 + Math.random() * 0.08);
    if (event.type === 'entity_struck') play('hit', 0.94 + Math.random() * 0.12);
    if (event.type === 'pane_cracked') play('glass_close', 1.3);
  });
  const offAwake = bus.on('pane:awake', ({ open }) => {
    if (open && !glassOpen) play('glass');
    if (!open && glassOpen) play('glass_close');
    glassOpen = open;
  });

  return () => {
    offTile();
    offHurt();
    offEvent();
    offAwake();
    scene.input.off('pointerdown', unlock);
    window.removeEventListener('keydown', onKey);
    stopDrone();
  };
}
