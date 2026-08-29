'use client';

import { useCallback, useEffect, useState, type JSX } from 'react';
import { bus } from '../../game/EventBus';
import { cycleHotbar, getHotbarSlot, setBagOpen, setHotbarSlot, setSettingsOpen } from '../../game/inputCapture';
import { playFileSfx, preloadFileSfx } from '../../game/systems/fileSfx';
import { readGame, useGame } from '../useGame';
import BagGrid from './BagGrid';
import Hearts from './Hearts';
import Hotbar from './Hotbar';
import SettingsModal, { SettingsButton } from './SettingsModal';

export default function Hud(): JSX.Element {
  const hp = useGame((s) => s.state.player.hp);
  const [bagOpen, setOpen] = useState(false);
  const [settingsOpen, setSettings] = useState(false);
  const [slot, setSlot] = useState(getHotbarSlot);
  const [heldIndex, setHeld] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toggleBag = useCallback((open: boolean) => {
    if (open) {
      setSettings(false);
      setSettingsOpen(false);
    }
    setOpen(open);
    setBagOpen(open);
    if (!open) setHeld(null);
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

  useEffect(() => {
    preloadFileSfx();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (readGame().state.player.hp <= 0) return;
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === 'Escape') {
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
        if (settingsOpen) return;
        event.preventDefault();
        if (typing) return;
        toggleBag(!bagOpen);
        return;
      }
      if (typing || settingsOpen) return;
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
  }, [bagOpen, settingsOpen, heldIndex, toggleBag, toggleSettings, stashInSlot, pickSlot]);

  useEffect(() => {
    if (hp <= 0 && bagOpen) toggleBag(false);
    if (hp <= 0 && settingsOpen) toggleSettings(false);
  }, [hp, bagOpen, settingsOpen, toggleBag, toggleSettings]);

  useEffect(() => {
    let timer = 0;
    const off = bus.on('hud:toast', ({ text }) => {
      setToast(text);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 2200);
    });
    return () => {
      off();
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
      <div className="pointer-events-auto absolute top-5 right-5 z-30" data-hud>
        <SettingsButton open={settingsOpen} onClick={() => toggleSettings(!settingsOpen)} />
      </div>
      <div className="pointer-events-auto absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 flex-col items-start gap-1.5" data-hud>
        <Hearts />
        <div className="flex items-end gap-2">
          <Hotbar
            active={slot}
            onSelect={(i) => {
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
            title="bag (tab)"
            onClick={(event) => {
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
      {settingsOpen && <SettingsModal onClose={() => toggleSettings(false)} />}
      {bagOpen && (
        <div
          className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/35"
          onClick={() => toggleBag(false)}
        >
          <BagGrid heldIndex={heldIndex} onSlot={onBagSlot} />
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
