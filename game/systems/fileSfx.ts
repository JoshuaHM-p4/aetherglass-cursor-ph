/**
 * File SFX via Web Audio + HTMLAudio fallback.
 * Phaser's SoundManager stays locked until its own unlock gesture; Tab
 * (inventory) is not one of them, so bag open/close never played.
 * This path shares the procedural SFX AudioContext and works on keydown.
 */

import { getSfxVolume } from './volume';

export const FILE_SFX = {
  open: '/assets/sfx/MC_Open.wav',
  close: '/assets/sfx/MC_Close.wav',
  hey: '/assets/sfx/MC_Aetherglass_Hey.wav',
  key: '/assets/sfx/MC_Key_Appear.wav',
  heart: '/assets/sfx/MC_Heart.wav',
  fanfare: '/assets/sfx/MC_Fanfare_Item.wav',
  door: '/assets/sfx/MC_Door1.wav',
  dungeonDoor: '/assets/sfx/MC_DungeonDoor.wav',
  bossHit: '/assets/sfx/MC_Boss_Hit.wav',
  bossKill: '/assets/sfx/MC_Boss_Kill.wav',
  lowHealth: '/assets/sfx/MC_LowHealth.wav',
  cursor: '/assets/sfx/MC_Menu_Cursor.wav',
  select: '/assets/sfx/MC_Menu_Select.wav',
  secret: '/assets/sfx/MC_Secret.wav',
} as const;

export type FileSfxId = keyof typeof FILE_SFX;

/** Per-cue mix, 1 = full SFX_VOLUME. */
const MIX: Record<FileSfxId, number> = {
  open: 1,
  close: 1,
  hey: 1,
  key: 1,
  heart: 1,
  fanfare: 1,
  door: 1,
  dungeonDoor: 1,
  bossHit: 1,
  bossKill: 1,
  lowHealth: 1,
  cursor: 0.7,
  select: 0.85,
  secret: 1,
};

let ctx: AudioContext | null = null;
const buffers = new Map<FileSfxId, AudioBuffer>();
let loading: Promise<void> | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

async function decodeAll(ac: AudioContext): Promise<void> {
  await Promise.all(
    (Object.keys(FILE_SFX) as FileSfxId[]).map(async (id) => {
      if (buffers.has(id)) return;
      try {
        const res = await fetch(FILE_SFX[id]);
        const raw = await res.arrayBuffer();
        const buf = await ac.decodeAudioData(raw.slice(0));
        buffers.set(id, buf);
      } catch {
        /* HTMLAudio fallback in playFileSfx */
      }
    }),
  );
}

export function preloadFileSfx(): void {
  const ac = audioCtx();
  if (!ac) return;
  bakeVoice(ac);
  if (loading) return;
  loading = decodeAll(ac);
}

function mixVolume(mix: number): number {
  return Math.max(0, Math.min(1, getSfxVolume() * mix));
}

function playHtml(url: string, volume: number): void {
  if (typeof Audio === 'undefined') return;
  const el = new Audio(url);
  el.volume = volume;
  void el.play().catch(() => undefined);
}

/** Cues that must not layer if many fire in one chest dump. */
const EXCLUSIVE = new Set<FileSfxId>(['fanfare']);
const exclusiveUntil = new Map<FileSfxId, number>();

function nowMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export function playFileSfx(id: FileSfxId, mix = MIX[id]): void {
  const volume = mixVolume(mix);
  const ac = audioCtx();
  const buf = buffers.get(id);
  if (EXCLUSIVE.has(id)) {
    const t = nowMs();
    if (t < (exclusiveUntil.get(id) ?? 0)) return;
    exclusiveUntil.set(id, t + (buf ? buf.duration * 1000 : 800));
  }
  // Prefer Web Audio only when the context is actually running. A suspended
  // context is why Phaser's SoundManager swallowed bag open/close on Tab.
  if (ac && buf && ac.state === 'running') {
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    gain.gain.value = volume;
    src.buffer = buf;
    src.connect(gain);
    gain.connect(ac.destination);
    src.start();
    return;
  }
  playHtml(FILE_SFX[id], volume);
  preloadFileSfx();
}

/** Undertale-style glass chatter and the speak-field key click. Baked, not files. */
type VoiceId = 'chat' | 'type';

const VOICE_MIX: Record<VoiceId, number> = { chat: 0.4, type: 0.32 };
const voiceBuffers = new Map<VoiceId, AudioBuffer>();
let lastChatAt = 0;
let lastTypeAt = 0;

function bakeSamples(ac: AudioContext, seconds: number, fn: (t: number) => number): AudioBuffer {
  const n = Math.max(1, Math.floor(seconds * ac.sampleRate));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const s = fn(i / ac.sampleRate);
    data[i] = s < -1 ? -1 : s > 1 ? 1 : s;
  }
  return buf;
}

function bakeVoice(ac: AudioContext): void {
  if (!voiceBuffers.has('chat')) {
    voiceBuffers.set(
      'chat',
      bakeSamples(ac, 0.05, (t) => {
        const e = Math.exp(-t * 64);
        const sq = Math.sin(2 * Math.PI * 980 * t) >= 0 ? 0.55 : -0.55;
        const harm = Math.sin(2 * Math.PI * 1470 * t) * 0.22;
        return (sq + harm) * e;
      }),
    );
  }
  if (!voiceBuffers.has('type')) {
    voiceBuffers.set(
      'type',
      bakeSamples(ac, 0.024, (t) => {
        const e = Math.exp(-t * 130);
        return (Math.sin(2 * Math.PI * 3100 * t) * 0.42 + Math.sin(2 * Math.PI * 880 * t) * 0.18) * e;
      }),
    );
  }
}

function playVoice(id: VoiceId, rate: number): void {
  const ac = audioCtx();
  if (!ac) return;
  bakeVoice(ac);
  const buf = voiceBuffers.get(id);
  if (!buf || ac.state !== 'running') return;
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  gain.gain.value = mixVolume(VOICE_MIX[id]);
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(gain);
  gain.connect(ac.destination);
  src.start();
}

/** High square blip as the glass talks. Throttled so a sentence is a stream, not a chord. */
export function playChatBlip(): void {
  const now = typeof performance === 'undefined' ? Date.now() : performance.now();
  if (now - lastChatAt < 44) return;
  lastChatAt = now;
  playVoice('chat', 0.93 + Math.random() * 0.16);
}

/** Short tick when the player types into the pane. */
export function playTypeClick(): void {
  const now = typeof performance === 'undefined' ? Date.now() : performance.now();
  if (now - lastTypeAt < 26) return;
  lastTypeAt = now;
  playVoice('type', 0.9 + Math.random() * 0.18);
}
