'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type JSX } from 'react';
import logo from '../../app/logo-horizontal.png';
import { playFileSfx, preloadFileSfx } from '../../game/systems/fileSfx';
import { playTitleMusic, stopTitleMusic, unlockTitleMusic } from '../../game/systems/titleMusic';
import { NAME_MAX, sanitizePlayerName } from '../../lib/client/playerName';
import { setPlaying } from '../../lib/client/play';
import {
  atFountain,
  clearSlot,
  emptySlots,
  listSlots,
  setActiveSlot,
  subscribeSaves,
  type SlotIndex,
} from '../../lib/client/save';
import { applyDebugDungeonIfNamed } from '../../lib/dungeon/generate';
import { APPEARANCES, appearanceTileSrc, DEFAULT_APPEARANCE, type AppearanceId } from '../../lib/sim/appearances';
import { applyKit, kitLine } from '../../lib/sim/kits';
import { initialState } from '../../lib/sim/reducer';
import { gameStore } from '../../lib/sim/store';
import type { GameState } from '../../lib/sim/types';
import { HeartRow } from '../hud/Hearts';
import ItemIcon from '../hud/ItemIcon';
import SettingsModal, { SettingsButton } from '../hud/SettingsModal';

type View = 'title' | 'slots' | 'create';

const SLOT_INDEXES: SlotIndex[] = [0, 1, 2];

export default function MainMenu(): JSX.Element {
  const slots = useSyncExternalStore(subscribeSaves, listSlots, emptySlots);
  const [view, setView] = useState<View>('title');
  const [createSlot, setCreateSlot] = useState<SlotIndex>(0);
  const [erasing, setErasing] = useState<SlotIndex | null>(null);
  const [settingsOpen, setSettings] = useState(false);

  useEffect(() => {
    preloadFileSfx();
    playTitleMusic();
    const unlock = () => unlockTitleMusic();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      stopTitleMusic();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (settingsOpen) {
        setSettings(false);
        return;
      }
      if (view === 'create') {
        setView('slots');
        return;
      }
      if (view === 'slots') {
        if (erasing !== null) {
          setErasing(null);
          return;
        }
        setView('title');
        return;
      }
      setSettings(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [view, settingsOpen, erasing]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 bg-[#0b0d14]" data-menu>
      <img
        src="/assets/background/menu-bg-1920x1080.png"
        srcSet="/assets/background/menu-bg-1920x1080.png 1920w, /assets/background/menu-bg-2560x1440.png 2560w"
        sizes="100vw"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="absolute inset-0 bg-black/18" />
      <div className="menu-torch-glow pointer-events-none absolute inset-0" />

      <div className="absolute top-5 right-5 z-30">
        <SettingsButton open={settingsOpen} onClick={() => setSettings(!settingsOpen)} />
      </div>

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4">
        {view === 'title' && (
          <TitleView
            onPlay={() => {
              playFileSfx('select');
              setView('slots');
            }}
          />
        )}
        {view === 'slots' && (
          <SlotsView
            slots={slots}
            erasing={erasing}
            onBack={() => {
              playFileSfx('close');
              setErasing(null);
              setView('title');
            }}
            onEmpty={(index) => {
              playFileSfx('select');
              setErasing(null);
              setCreateSlot(index);
              setView('create');
            }}
            onOccupied={(index, state) => {
              playFileSfx('select');
              continueSlot(index, state);
            }}
            onAskErase={(index) => {
              playFileSfx('cursor');
              setErasing(index);
            }}
            onKeep={() => {
              playFileSfx('close');
              setErasing(null);
            }}
            onErase={(index) => {
              playFileSfx('close');
              clearSlot(index);
              setErasing(null);
            }}
          />
        )}
        {view === 'create' && (
          <CreateView
            slot={createSlot}
            onCancel={() => {
              playFileSfx('close');
              setView('slots');
            }}
            onConfirm={(name, appearance) => {
              playFileSfx('select');
              beginNewGame(createSlot, name, appearance);
            }}
          />
        )}
      </div>

      <p className="pointer-events-none absolute right-5 bottom-4 z-20 text-right font-pixel text-[7px] leading-relaxed tracking-[0.14em] text-white/28">
        art{' '}
        <a
          href="https://kenney.nl"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto text-white/35 hover:text-amber-100/70"
        >
          kenney.nl
        </a>
        <br />
        made by{' '}
        <a
          href="https://github.com/JoshuaHM-p4"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto text-white/35 hover:text-amber-100/70"
        >
          JoshuaHM-p4
        </a>
      </p>

      {settingsOpen && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}

function TitleView({ onPlay }: { onPlay: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-10">
      <div className="title-mark">
        <img
          src={logo.src}
          alt="Aetherglass"
          width={logo.width}
          height={logo.height}
          className="title-mark-face h-auto w-[min(560px,88vw)] mix-blend-screen"
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      </div>
      <button
        type="button"
        onClick={onPlay}
        className="border border-amber-400/70 bg-black/45 px-10 py-3 font-pixel text-[14px] tracking-[0.45em] text-amber-100 hover:border-amber-200 hover:bg-amber-400/15 hover:shadow-[0_0_18px_rgba(201,168,106,0.35)]"
      >
        PLAY
      </button>
    </div>
  );
}

function SlotsView({
  slots,
  erasing,
  onBack,
  onEmpty,
  onOccupied,
  onAskErase,
  onKeep,
  onErase,
}: {
  slots: Array<GameState | null>;
  erasing: SlotIndex | null;
  onBack: () => void;
  onEmpty: (index: SlotIndex) => void;
  onOccupied: (index: SlotIndex, state: GameState) => void;
  onAskErase: (index: SlotIndex) => void;
  onKeep: () => void;
  onErase: (index: SlotIndex) => void;
}): JSX.Element {
  return (
    <div className="flex w-full max-w-[920px] flex-col items-center gap-6">
      <p className="font-pixel text-[10px] tracking-[0.35em] text-amber-200/80">FILES</p>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {SLOT_INDEXES.map((index) => {
          const state = slots[index];
          if (!state) {
            return (
              <button
                key={index}
                type="button"
                onClick={() => onEmpty(index)}
                className="pane-glass flex min-h-[168px] flex-col items-stretch px-3 py-3 text-left hover:border-amber-200/60"
              >
                <EmptySlot />
              </button>
            );
          }
          if (erasing === index) {
            return (
              <div key={index} className="pane-glass flex min-h-[168px] flex-col px-3 py-3">
                <EraseConfirm name={state.player.name} onKeep={onKeep} onErase={() => onErase(index)} />
              </div>
            );
          }
          return (
            <div key={index} className="pane-glass flex min-h-[168px] flex-col px-3 py-3 hover:border-amber-200/60">
              <button
                type="button"
                onClick={() => onOccupied(index, state)}
                className="flex min-h-0 flex-1 flex-col items-stretch text-left"
              >
                <OccupiedSlot state={state} />
              </button>
              <button
                type="button"
                aria-label={`erase ${state.player.name}`}
                onClick={() => onAskErase(index)}
                className="mt-2 self-end font-pixel text-[7px] tracking-[0.28em] text-white/30 hover:text-red-300/90"
              >
                ERASE
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onBack}
        className="font-pixel text-[9px] tracking-[0.28em] text-amber-100/50 hover:text-amber-100"
      >
        BACK
      </button>
    </div>
  );
}

function EraseConfirm({
  name,
  onKeep,
  onErase,
}: {
  name: string;
  onKeep: () => void;
  onErase: () => void;
}): JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <p className="font-pixel text-[9px] tracking-[0.28em] text-red-300/80">ERASE</p>
      <p className="mt-2 truncate font-pixel text-[12px] tracking-wide text-amber-50">{name}</p>
      <p className="mt-1 font-pixel text-[8px] leading-relaxed text-white/40">this file will be gone</p>
      <div className="mt-auto flex flex-col gap-1.5 pt-3">
        <button
          type="button"
          onClick={onErase}
          className="border border-red-400/45 bg-black/40 px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-red-200 hover:border-red-300/70 hover:bg-red-400/10"
        >
          ERASE
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="border border-white/15 bg-black/25 px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-amber-100/70 hover:border-amber-200/40"
        >
          KEEP
        </button>
      </div>
    </div>
  );
}

function OccupiedSlot({ state }: { state: GameState }): JSX.Element {
  const items = state.player.bag.slice(0, 6);
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-3">
        <img
          src={appearanceTileSrc(state.player.appearance)}
          alt=""
          width={48}
          height={48}
          draggable={false}
          className="shrink-0"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="min-w-0">
          <p className="truncate font-pixel text-[12px] tracking-wide text-amber-50">{state.player.name}</p>
          <HeartRow hp={state.player.hp} hpMax={state.player.hpMax} size={11} />
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        {items.map((item, i) => (
          <ItemIcon key={`${i}-${item.id}`} id={item.id} size={18} />
        ))}
      </div>
    </div>
  );
}

function EmptySlot(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="font-pixel text-[11px] tracking-[0.28em] text-amber-100/55">New Game</p>
    </div>
  );
}

function CreateView({
  slot,
  onCancel,
  onConfirm,
}: {
  slot: SlotIndex;
  onCancel: () => void;
  onConfirm: (name: string, appearance: AppearanceId) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [look, setLook] = useState<AppearanceId>(DEFAULT_APPEARANCE);
  const ready = sanitizePlayerName(name).length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="pane-glass w-[min(420px,calc(100vw-2rem))] px-4 py-4">
      <p className="mb-3 font-pixel text-[9px] tracking-[0.28em] text-amber-200/70">
        NEW GAME
        <span className="ml-2 tracking-normal text-amber-100/45">· file {slot + 1}</span>
      </p>
      <label className="mb-4 block">
        <span className="mb-1.5 block font-pixel text-[9px] tracking-[0.28em] text-amber-200/80">NAME</span>
        <input
          ref={inputRef}
          value={name}
          maxLength={NAME_MAX}
          spellCheck={false}
          autoComplete="off"
          placeholder="wanderer"
          onChange={(event) => setName(event.target.value.slice(0, NAME_MAX))}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const next = sanitizePlayerName(name);
            if (next) onConfirm(next, look);
          }}
          className="w-full border border-amber-400/25 bg-black/40 px-2 py-2 font-pixel text-[12px] text-amber-50 outline-none placeholder:text-amber-100/25 focus:border-amber-300/60"
        />
      </label>
      <p className="mb-2 font-pixel text-[9px] tracking-[0.28em] text-amber-200/80">LOOK</p>
      <div className="mb-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {APPEARANCES.map((appearance) => {
          const selected = look === appearance.id;
          return (
            <button
              key={appearance.id}
              type="button"
              title={appearance.label}
              onClick={() => {
                playFileSfx('cursor');
                setLook(appearance.id);
              }}
              className={`flex flex-col items-center gap-1 border bg-black/35 p-1.5 ${
                selected
                  ? 'border-amber-400/80 shadow-[0_0_10px_rgba(201,168,106,0.35)]'
                  : 'border-white/10 hover:border-amber-200/40'
              }`}
            >
              <img
                src={appearanceTileSrc(appearance.id)}
                alt=""
                width={32}
                height={32}
                draggable={false}
                style={{ imageRendering: 'pixelated' }}
              />
              <span className="font-pixel text-[7px] tracking-wide text-amber-100/60">{appearance.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mb-4 font-pixel text-[7px] tracking-wide text-amber-100/45">{kitLine(look)}</p>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={!ready}
          onClick={() => onConfirm(sanitizePlayerName(name), look)}
          className="border border-amber-400/50 bg-black/40 px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-amber-200 hover:border-amber-200 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/25"
        >
          CONFIRM
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-white/15 bg-black/25 px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-amber-100/70 hover:border-amber-200/40"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}

function continueSlot(index: SlotIndex, state: GameState): void {
  setActiveSlot(index);
  const load = state.player.hp <= 0 ? atFountain(state, true) : state;
  gameStore.getState().hydrate(load);
  setPlaying(true);
}

function beginNewGame(index: SlotIndex, name: string, appearance: AppearanceId): void {
  const state = initialState((Math.random() * 0xffffffff) >>> 0);
  state.player.name = name;
  state.player.appearance = appearance;
  applyKit(state, appearance);
  applyDebugDungeonIfNamed(state);
  setActiveSlot(index);
  gameStore.getState().hydrate(state);
  setPlaying(true);
}
