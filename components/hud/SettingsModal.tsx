'use client';

import { useSyncExternalStore, type JSX } from 'react';
import { playFileSfx } from '../../game/systems/fileSfx';
import {
  DEFAULT_VOLUME,
  getVolumeLevels,
  resetVolume,
  setMusicVolume,
  setSfxVolume,
  subscribeVolume,
} from '../../game/systems/volume';

function pct(n: number): number {
  return Math.round(n * 100);
}

function GearGlyph(): JSX.Element {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 16 16"
      aria-hidden
      className="pointer-events-none"
      style={{ imageRendering: 'pixelated' }}
    >
      <rect x="6" y="0" width="4" height="2" fill="#c9a86a" />
      <rect x="6" y="14" width="4" height="2" fill="#c9a86a" />
      <rect x="0" y="6" width="2" height="4" fill="#c9a86a" />
      <rect x="14" y="6" width="2" height="4" fill="#c9a86a" />
      <rect x="2" y="2" width="2" height="2" fill="#c9a86a" />
      <rect x="12" y="2" width="2" height="2" fill="#c9a86a" />
      <rect x="2" y="12" width="2" height="2" fill="#c9a86a" />
      <rect x="12" y="12" width="2" height="2" fill="#c9a86a" />
      <rect x="4" y="4" width="8" height="8" fill="#c9a86a" />
      <rect x="6" y="6" width="4" height="4" fill="#0b0d14" />
    </svg>
  );
}

export function SettingsButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      title="settings (esc)"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => {
        onClick();
        event.currentTarget.blur();
      }}
      className={`pointer-events-auto flex h-12 w-12 flex-col items-center justify-center border ${
        open
          ? 'border-amber-400/80 bg-black/55 shadow-[0_0_10px_rgba(201,168,106,0.35)]'
          : 'border-white/15 bg-black/40 hover:border-amber-200/50'
      }`}
    >
      <GearGlyph />
      <span className="mt-0.5 font-pixel text-[7px] tracking-widest text-white/40">ESC</span>
    </button>
  );
}

function MixSlider({
  label,
  value,
  onChange,
  onPreview,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  onPreview?: () => void;
}): JSX.Element {
  const fill = `${pct(value)}%`;
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="font-pixel text-[9px] tracking-[0.28em] text-amber-200/80">{label}</span>
        <span className="font-pixel text-[9px] text-amber-100/55">{pct(value)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct(value)}
        aria-label={label}
        className="ag-slider"
        style={{ ['--ag-fill' as string]: fill }}
        onChange={(event) => {
          onChange(Number(event.target.value) / 100);
        }}
        onPointerUp={onPreview}
      />
    </label>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const levels = useSyncExternalStore(subscribeVolume, getVolumeLevels, () => DEFAULT_VOLUME);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/45"
      data-hud
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="settings-title"
        className="pane-glass w-[min(280px,calc(100vw-2rem))] px-4 py-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
        style={{ boxShadow: '0 18px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(201,168,106,0.18)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex items-baseline justify-between gap-2">
          <h2
            id="settings-title"
            className="font-pixel text-[9px] tracking-[0.28em] text-amber-200/70"
          >
            AETHERGLASS
            <span className="ml-2 tracking-normal text-amber-100/55">· settings</span>
          </h2>
        </header>

        <div className="flex flex-col gap-4">
          <MixSlider
            label="MUSIC"
            value={levels.music}
            onChange={setMusicVolume}
          />
          <MixSlider
            label="SFX"
            value={levels.sfx}
            onChange={setSfxVolume}
            onPreview={() => playFileSfx('cursor')}
          />
        </div>

        <div className="mt-5 flex flex-col gap-1.5 border-t border-amber-400/20 pt-3">
          <button
            type="button"
            onClick={() => {
              resetVolume();
              playFileSfx('select');
            }}
            className="border border-amber-400/50 bg-black/40 px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-amber-200 hover:border-amber-200 hover:bg-amber-400/10"
          >
            RESET
          </button>
          <button
            type="button"
            onClick={() => playFileSfx('select')}
            className="border border-white/15 bg-black/25 px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-amber-100/70 hover:border-amber-200/40"
          >
            SAVE AND EXIT
          </button>
        </div>
        <p className="mt-3 font-pixel text-[8px] text-white/35">esc to close</p>
      </div>
    </div>
  );
}
