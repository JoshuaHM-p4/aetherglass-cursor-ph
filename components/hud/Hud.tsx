'use client';

import { useCallback, useEffect, useState, type JSX } from 'react';
import { bus } from '../../game/EventBus';
import { setPlaying } from '../../lib/client/play';
import { cycleHotbar, getHotbarSlot, isIntroLocked, setBagOpen, setHotbarSlot, setSettingsOpen, subscribePadTap } from '../../game/inputCapture';
import { playFileSfx, preloadFileSfx } from '../../game/systems/fileSfx';
import { BAG_SLOTS, BAG_TRASH_SLOT } from '../../lib/sim/select';
import { readGame, useGame } from '../useGame';
import BagGrid from './BagGrid';
import BossBar from './BossBar';
import Hearts from './Hearts';
import Hotbar from './Hotbar';
import InteractHint from './InteractHint';
import Minimap from './Minimap';
import PickupFloat from './PickupFloat';
import SettingsModal, { SettingsButton } from './SettingsModal';
import TouchPad from './TouchPad';
import { toggleHitboxDebug } from '../../game/hitboxDebug';

const BAG_COLS = 4;

function bagStep(from: number, dx: number, dy: number): number {
  const rows = Math.ceil(BAG_SLOTS / BAG_COLS);
  if (from === BAG_TRASH_SLOT) {
    if (dx < 0 || dy < 0) return BAG_SLOTS - 1;
    return BAG_TRASH_SLOT;
  }
  if (dy > 0 && from >= BAG_SLOTS - BAG_COLS) return BAG_TRASH_SLOT;
  if (dx > 0 && from === BAG_SLOTS - 1) return BAG_TRASH_SLOT;
  const x = (((from % BAG_COLS) + dx) % BAG_COLS + BAG_COLS) % BAG_COLS;
  const y = (((Math.floor(from / BAG_COLS) + dy) % rows) + rows) % rows;
  return y * BAG_COLS + x;
}

function bagMove(event: KeyboardEvent): { dx: number; dy: number } | null {
  const k = event.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') return { dx: -1, dy: 0 };
  if (k === 'ArrowRight' || k === 'd' || k === 'D') return { dx: 1, dy: 0 };
  if (k === 'ArrowUp' || k === 'w' || k === 'W') return { dx: 0, dy: -1 };
  if (k === 'ArrowDown' || k === 's' || k === 'S') return { dx: 0, dy: 1 };
  return null;
}

function isTossKey(event: KeyboardEvent): boolean {
  return event.key === 'Delete' || event.key === 'Del' || event.code === 'Delete';
}

export default function Hud(): JSX.Element {
  const hp = useGame((s) => s.state.player.hp);
  const [bagOpen, setOpen] = useState(false);
  const [settingsOpen, setSettings] = useState(false);
  const [slot, setSlot] = useState(getHotbarSlot);
  const [heldIndex, setHeld] = useState<number | null>(null);
  const [bagCursor, setBagCursor] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const toggleBag = useCallback((open: boolean) => {
    if (open) {
      setSettings(false);
      setSettingsOpen(false);
    }
    setOpen(open);
    setBagOpen(open);
    if (!open) setHeld(null);
    else {
      setBagCursor(0);
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) focused.blur();
    }
    bus.emit('hud:bag_toggled', { open });
    playFileSfx(open ? 'open' : 'close');
  }, []);

  const toggleSettings = useCallback((open: boolean) => {
    if (open) {
      setOpen(false);
      setBagOpen(false);
      setHeld(null);
    }
    setSettings(open);
    setSettingsOpen(open);
    bus.emit('hud:settings_toggled', { open });
    playFileSfx(open ? 'open' : 'close');
  }, []);

  const toggleHitboxes = useCallback(() => {
    const on = toggleHitboxDebug();
    playFileSfx('cursor');
    bus.emit('hud:toast', { text: on ? 'hitboxes on' : 'hitboxes off' });
  }, []);

  const pickSlot = useCallback((next: number) => {
    setHotbarSlot(next);
    setSlot(getHotbarSlot());
  }, []);

  const stashInSlot = useCallback(
    (next: number) => {
      const slot = (next % 3) as 0 | 1 | 2;
      pickSlot(slot);
      if (heldIndex === null) return;
      const item = readGame().state.player.bag[heldIndex];
      if (!item) return;
      readGame().dispatch({ type: 'SET_HOTBAR', slot, itemId: item.id }, 'keyboard');
      setHeld(null);
    },
    [heldIndex, pickSlot],
  );

  const onBagSlot = useCallback(
    (index: number) => {
      setBagCursor(index);
      const bag = readGame().state.player.bag;
      const item = bag[index];
      if (heldIndex === null) {
        if (item) setHeld(index);
        return;
      }
      if (heldIndex === index || !item) {
        setHeld(null);
        return;
      }
      readGame().dispatch({ type: 'SWAP_BAG', a: heldIndex, b: index }, 'keyboard');
      setHeld(null);
    },
    [heldIndex],
  );

  const discardIndex = useCallback((index: number) => {
    const item = readGame().state.player.bag[index];
    if (!item) return;
    const result = readGame().dispatch({ type: 'TRASH_ITEM', index }, 'keyboard');
    if (!result.ok) return;
    setHeld((held) => {
      if (held === null) return null;
      if (held === index) return null;
      return held > index ? held - 1 : held;
    });
    bus.emit('hud:toast', { text: `tossed ${item.name}` });
  }, []);

  const onTrash = useCallback(() => {
    setBagCursor(BAG_TRASH_SLOT);
    if (heldIndex !== null) {
      discardIndex(heldIndex);
      return;
    }
    const trash = readGame().state.player.trash;
    if (!trash) return;
    const result = readGame().dispatch({ type: 'TAKE_TRASH' }, 'keyboard');
    if (!result.ok) {
      if (result.reason === 'bag_full') {
        bus.emit('hud:toast', { text: 'bag full — toss something first' });
      }
      return;
    }
    bus.emit('hud:toast', { text: `kept ${trash.name}` });
  }, [heldIndex, discardIndex]);

  useEffect(() => {
    preloadFileSfx();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isIntroLocked()) return;
      if (event.repeat && !bagOpen) return;
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === 'F3') {
        event.preventDefault();
        if (event.repeat || typing) return;
        toggleHitboxes();
        return;
      }
      if (readGame().state.player.hp <= 0) return;
      if (event.key === 'Escape') {
        if (event.repeat) return;
        if (settingsOpen) {
          event.preventDefault();
          event.stopImmediatePropagation();
          toggleSettings(false);
          return;
        }
        if (typing || document.activeElement?.closest('[data-pane]')) return;
        event.preventDefault();
        toggleSettings(true);
        return;
      }
      if (event.key === 'Tab') {
        if (event.repeat || settingsOpen) return;
        event.preventDefault();
        if (typing && !bagOpen) return;
        toggleBag(!bagOpen);
        return;
      }
      if (settingsOpen) return;
      if (bagOpen) {
        const step = bagMove(event);
        if (step) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setBagCursor((from) => bagStep(from, step.dx, step.dy));
          playFileSfx('cursor');
          return;
        }
        if (event.key === ' ' || event.code === 'Space') {
          if (event.repeat) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (bagCursor === BAG_TRASH_SLOT) {
            playFileSfx('select');
            onTrash();
            return;
          }
          const item = readGame().state.player.bag[bagCursor];
          if (heldIndex === null && !item) return;
          playFileSfx('select');
          onBagSlot(bagCursor);
          return;
        }
        if (isTossKey(event)) {
          if (event.repeat) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (heldIndex !== null) {
            playFileSfx('select');
            discardIndex(heldIndex);
            return;
          }
          if (bagCursor === BAG_TRASH_SLOT) return;
          const item = readGame().state.player.bag[bagCursor];
          if (!item) return;
          playFileSfx('select');
          discardIndex(bagCursor);
          return;
        }
      }
      if (typing) return;
      if (event.repeat) return;
      const fromDigit =
        event.code === 'Digit1' || event.code === 'Numpad1'
          ? 0
          : event.code === 'Digit2' || event.code === 'Numpad2'
            ? 1
            : event.code === 'Digit3' || event.code === 'Numpad3'
              ? 2
              : null;
      if (fromDigit !== null) {
        event.preventDefault();
        playFileSfx(heldIndex !== null ? 'select' : 'cursor');
        stashInSlot(fromDigit);
        return;
      }
      if (event.key === 'q' || event.key === 'Q') {
        event.preventDefault();
        playFileSfx('cursor');
        pickSlot(cycleHotbar(-1));
        return;
      }
      if (event.key === 'e' || event.key === 'E') {
        event.preventDefault();
        playFileSfx('cursor');
        pickSlot(cycleHotbar(1));
      }
      if (event.key === 'Backspace' && event.ctrlKey && event.shiftKey) {
        event.preventDefault();
        readGame().hardReset();
        bus.emit('hud:toast', { text: 'run wiped' });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [bagOpen, bagCursor, settingsOpen, heldIndex, toggleBag, toggleSettings, toggleHitboxes, stashInSlot, pickSlot, onBagSlot, onTrash, discardIndex]);

  useEffect(() => {
    return subscribePadTap((tap) => {
      if (isIntroLocked()) return;
      if (readGame().state.player.hp <= 0) return;
      if (tap === 'tab') {
        if (settingsOpen) return;
        toggleBag(!bagOpen);
        return;
      }
      if (tap === 'escape') {
        if (settingsOpen) toggleSettings(false);
        else toggleSettings(true);
        return;
      }
      if (settingsOpen) return;
      if (tap === 'space' && bagOpen) {
        if (bagCursor === BAG_TRASH_SLOT) {
          playFileSfx('select');
          onTrash();
          return;
        }
        const item = readGame().state.player.bag[bagCursor];
        if (heldIndex === null && !item) return;
        playFileSfx('select');
        onBagSlot(bagCursor);
        return;
      }
      if (!bagOpen) return;
      const step =
        tap === 'left'
          ? { dx: -1, dy: 0 }
          : tap === 'right'
            ? { dx: 1, dy: 0 }
            : tap === 'up'
              ? { dx: 0, dy: -1 }
              : tap === 'down'
                ? { dx: 0, dy: 1 }
                : null;
      if (!step) return;
      setBagCursor((from) => bagStep(from, step.dx, step.dy));
      playFileSfx('cursor');
    });
  }, [bagOpen, bagCursor, settingsOpen, heldIndex, toggleBag, toggleSettings, onBagSlot, onTrash]);

  useEffect(() => {
    if (hp <= 0 && bagOpen) toggleBag(false);
    if (hp <= 0 && settingsOpen) toggleSettings(false);
  }, [hp, bagOpen, settingsOpen, toggleBag, toggleSettings]);

  useEffect(() => {
    let timer = 0;
    const show = (text: string) => {
      setToast(text);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 2200);
    };
    const offToast = bus.on('hud:toast', ({ text }) => show(text));
    const offSim = bus.on('sim:event', (event) => {
      if (event.type === 'item_left_behind') show('bag full — toss something');
    });
    return () => {
      offToast();
      offSim();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(
    () => () => {
      setBagOpen(false);
      setSettingsOpen(false);
    },
    [],
  );

  return (
    <>
      {hp > 0 && <TouchPad bagOpen={bagOpen} />}
      <InteractHint />
      <PickupFloat />
      <Minimap />
      <BossBar />
      <div className="pointer-events-auto absolute top-5 right-5 z-30 flex flex-col gap-1.5" data-hud>
        <SettingsButton
          open={settingsOpen}
          onClick={() => {
            if (isIntroLocked()) return;
            toggleSettings(!settingsOpen);
          }}
        />
      </div>
      <div className="pointer-events-auto absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 flex-col items-start gap-1.5" data-hud>
        <Hearts />
        <div className="flex items-end gap-2">
          <Hotbar
            active={slot}
            onSelect={(i) => {
              if (isIntroLocked()) return;
              if (heldIndex !== null) stashInSlot(i);
              else pickSlot(i);
            }}
            onClear={(i) => {
              readGame().dispatch(
                { type: 'SET_HOTBAR', slot: i as 0 | 1 | 2, itemId: null },
                'keyboard',
              );
            }}
          />
          <button
            type="button"
            data-bag-button
            title="bag (tab)"
            onClick={(event) => {
              if (isIntroLocked()) return;
              toggleBag(!bagOpen);
              event.currentTarget.blur();
            }}
            className={`flex h-12 w-12 flex-col items-center justify-center border ${
              bagOpen
                ? 'border-amber-400/80 bg-black/55 shadow-[0_0_10px_rgba(201,168,106,0.35)]'
                : 'border-white/15 bg-black/40 hover:border-amber-200/50'
            }`}
          >
            <img
              src="/assets/items/bag.png"
              alt=""
              width={28}
              height={28}
              draggable={false}
              className="pointer-events-none select-none"
              style={{ imageRendering: 'pixelated' }}
            />
            <span className="mt-0.5 font-pixel text-[7px] tracking-widest text-white/40">TAB</span>
          </button>
        </div>
      </div>
      {settingsOpen && (
        <SettingsModal
          onClose={() => toggleSettings(false)}
          onSaveAndExit={() => {
            toggleSettings(false);
            setPlaying(false);
          }}
        />
      )}
      {bagOpen && (
        <div
          className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/35"
          onClick={() => toggleBag(false)}
        >
          <BagGrid
            cursor={bagCursor}
            heldIndex={heldIndex}
            onCursor={setBagCursor}
            onSlot={onBagSlot}
            onTrash={onTrash}
            onDiscard={discardIndex}
          />
        </div>
      )}
      {toast && (
        <p className="pointer-events-none absolute top-6 left-1/2 z-40 -translate-x-1/2 font-pixel text-[10px] tracking-[0.2em] text-amber-100/80">
          {toast}
        </p>
      )}
    </>
  );
}
