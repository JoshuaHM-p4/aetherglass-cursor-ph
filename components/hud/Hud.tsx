'use client';

import { useCallback, useEffect, useState, type JSX } from 'react';
import { bus } from '../../game/EventBus';
import { cycleHotbar, getHotbarSlot, setBagOpen } from '../../game/inputCapture';
import BagGrid from './BagGrid';
import Hearts from './Hearts';
import Hotbar from './Hotbar';

export default function Hud(): JSX.Element {
  const [bagOpen, setOpen] = useState(false);
  const [slot, setSlot] = useState(getHotbarSlot);

  const toggleBag = useCallback((open: boolean) => {
    setOpen(open);
    setBagOpen(open);
    bus.emit('hud:bag_toggled', { open });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === 'Tab') {
        event.preventDefault();
        if (typing) return;
        toggleBag(!bagOpen);
        return;
      }
      if (typing || bagOpen) return;
      if (event.key === 'q' || event.key === 'Q') {
        event.preventDefault();
        setSlot(cycleHotbar(-1));
      }
      if (event.key === 'e' || event.key === 'E') {
        event.preventDefault();
        setSlot(cycleHotbar(1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bagOpen, toggleBag]);

  useEffect(
    () => () => {
      setBagOpen(false);
    },
    [],
  );

  return (
    <>
      <div className="pointer-events-auto absolute top-4 left-4" data-hud>
        <Hearts />
      </div>
      <div className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2" data-hud>
        <Hotbar active={slot} />
      </div>
      {bagOpen && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/35">
          <BagGrid />
        </div>
      )}
    </>
  );
}
