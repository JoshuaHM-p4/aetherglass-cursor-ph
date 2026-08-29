'use client';

import { useCallback, useEffect, useState, type JSX } from 'react';
import { bus } from '../../game/EventBus';
import { cycleHotbar, getHotbarSlot, setBagOpen, setHotbarSlot } from '../../game/inputCapture';
import { readGame, useGame } from '../useGame';
import BagGrid from './BagGrid';
import Hearts from './Hearts';
import Hotbar from './Hotbar';

export default function Hud(): JSX.Element {
  const hp = useGame((s) => s.state.player.hp);
  const [bagOpen, setOpen] = useState(false);
  const [slot, setSlot] = useState(getHotbarSlot);
  const [heldIndex, setHeld] = useState<number | null>(null);

  const toggleBag = useCallback((open: boolean) => {
    setOpen(open);
    setBagOpen(open);
    if (!open) setHeld(null);
    bus.emit('hud:bag_toggled', { open });
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
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (readGame().state.player.hp <= 0) return;
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === 'Tab') {
        event.preventDefault();
        if (typing) return;
        toggleBag(!bagOpen);
        return;
      }
      if (typing) return;
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
        stashInSlot(fromDigit);
        return;
      }
      if (event.key === 'q' || event.key === 'Q') {
        event.preventDefault();
        pickSlot(cycleHotbar(-1));
        return;
      }
      if (event.key === 'e' || event.key === 'E') {
        event.preventDefault();
        pickSlot(cycleHotbar(1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bagOpen, toggleBag, stashInSlot, pickSlot]);

  useEffect(() => {
    if (hp <= 0 && bagOpen) toggleBag(false);
  }, [hp, bagOpen, toggleBag]);

  useEffect(
    () => () => {
      setBagOpen(false);
    },
    [],
  );

  return (
    <>
      <div className="pointer-events-auto absolute top-4 left-4 z-10" data-hud>
        <Hearts />
      </div>
      <div className="pointer-events-auto absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-end gap-2" data-hud>
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
      {bagOpen && (
        <div
          className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/35"
          onClick={() => toggleBag(false)}
        >
          <BagGrid heldIndex={heldIndex} onSlot={onBagSlot} />
        </div>
      )}
    </>
  );
}
