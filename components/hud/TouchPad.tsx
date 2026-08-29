'use client';

import { useEffect, useRef, useState, type JSX, type PointerEvent, type ReactNode } from 'react';
import {
  clearPadDirs,
  emitPadDir,
  pressPadAction,
  setPadDir,
  type PadAction,
  type PadDir,
} from '../../game/inputCapture';

const COMPACT_QUERY = '(max-width: 1279px), (hover: none) and (pointer: coarse)';

export function useCompactHud(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return on;
}

export default function TouchPad({
  bagOpen,
}: {
  bagOpen: boolean;
}): JSX.Element | null {
  const compact = useCompactHud();

  useEffect(() => {
    if (!compact) {
      clearPadDirs();
      return;
    }
    const release = () => clearPadDirs();
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      clearPadDirs();
    };
  }, [compact]);

  if (!compact) return null;

  return (
    <div data-touch-pad data-hud className="touch-pad pointer-events-none absolute inset-0 z-30">
      <div
        className="pointer-events-auto absolute"
        style={{
          left: 'max(3rem, calc(env(safe-area-inset-left) + 2rem))',
          bottom: 'max(6.75rem, calc(env(safe-area-inset-bottom) + 5.5rem))',
        }}
      >
        <DPad bagOpen={bagOpen} />
      </div>
      <div
        className="pointer-events-auto absolute"
        style={{
          right: 'max(3rem, calc(env(safe-area-inset-right) + 2rem))',
          bottom: 'max(6.75rem, calc(env(safe-area-inset-bottom) + 5.5rem))',
        }}
      >
        <ActionCluster />
      </div>
    </div>
  );
}

function DPad({ bagOpen }: { bagOpen: boolean }): JSX.Element {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1" aria-label="move">
      <span />
      <PadHold dir="up" bagOpen={bagOpen} label="up">
        <Chevron dir="up" />
      </PadHold>
      <span />
      <PadHold dir="left" bagOpen={bagOpen} label="left">
        <Chevron dir="left" />
      </PadHold>
      <span className="m-auto h-2 w-2 bg-amber-400/25" />
      <PadHold dir="right" bagOpen={bagOpen} label="right">
        <Chevron dir="right" />
      </PadHold>
      <span />
      <PadHold dir="down" bagOpen={bagOpen} label="down">
        <Chevron dir="down" />
      </PadHold>
      <span />
    </div>
  );
}

function ActionCluster(): JSX.Element {
  return (
    <div className="flex flex-col items-end gap-2" aria-label="actions">
      <PadTap action="space" caption="USE" glyph={<UseGlyph />} />
      <PadTap action="enter" caption="ENTER" glyph={<EnterGlyph />} hero />
    </div>
  );
}

function PadHold({
  dir,
  bagOpen,
  label,
  children,
}: {
  dir: PadDir;
  bagOpen: boolean;
  label: string;
  children: ReactNode;
}): JSX.Element {
  const bagOpenRef = useRef(bagOpen);
  bagOpenRef.current = bagOpen;
  const timers = useRef({ delay: 0, pulse: 0 });

  const stopRepeat = () => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.pulse);
    timers.current.delay = 0;
    timers.current.pulse = 0;
  };

  const release = () => {
    setPadDir(dir, false);
    stopRepeat();
  };

  useEffect(() => {
    return () => {
      setPadDir(dir, false);
      window.clearTimeout(timers.current.delay);
      window.clearInterval(timers.current.pulse);
    };
  }, [dir]);

  const onDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPadDir(dir, true);
    if (!bagOpenRef.current) return;
    emitPadDir(dir);
    stopRepeat();
    timers.current.delay = window.setTimeout(() => {
      emitPadDir(dir);
      timers.current.pulse = window.setInterval(() => emitPadDir(dir), 140);
    }, 280);
  };

  const onUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    release();
    event.currentTarget.blur();
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(event) => event.preventDefault()}
      className="touch-pad-key flex h-12 w-12 items-center justify-center border border-white/15 bg-black/45"
    >
      {children}
    </button>
  );
}

function PadTap({
  action,
  caption,
  glyph,
  hero,
}: {
  action: PadAction;
  caption: string;
  glyph: ReactNode;
  hero?: boolean;
}): JSX.Element {
  const onDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pressPadAction(action);
  };

  const onUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.blur();
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={caption === 'ENTER' ? 'interact' : caption}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(event) => event.preventDefault()}
      className={`touch-pad-key flex flex-col items-center justify-center border border-white/15 bg-black/45 ${
        hero ? 'h-14 w-14' : 'h-12 w-12'
      }`}
    >
      {glyph}
      <span className="mt-0.5 font-pixel text-[7px] tracking-widest text-white/45">{caption}</span>
    </button>
  );
}

function Chevron({ dir }: { dir: PadDir }): JSX.Element {
  const rot = dir === 'up' ? 0 : dir === 'right' ? 90 : dir === 'down' ? 180 : 270;
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      aria-hidden
      className="pointer-events-none"
      style={{ imageRendering: 'pixelated', transform: `rotate(${rot}deg)` }}
    >
      <rect x="6" y="2" width="2" height="2" fill="#c9a86a" />
      <rect x="4" y="4" width="6" height="2" fill="#c9a86a" />
      <rect x="2" y="6" width="10" height="2" fill="#c9a86a" />
      <rect x="6" y="8" width="2" height="4" fill="#c9a86a" />
    </svg>
  );
}

function EnterGlyph(): JSX.Element {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      aria-hidden
      className="pointer-events-none"
      style={{ imageRendering: 'pixelated' }}
    >
      <rect x="11" y="2" width="2" height="8" fill="#c9a86a" />
      <rect x="3" y="8" width="10" height="2" fill="#c9a86a" />
      <rect x="1" y="8" width="2" height="2" fill="#c9a86a" />
      <rect x="3" y="6" width="2" height="2" fill="#c9a86a" />
      <rect x="3" y="10" width="2" height="2" fill="#c9a86a" />
    </svg>
  );
}

function UseGlyph(): JSX.Element {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      aria-hidden
      className="pointer-events-none"
      style={{ imageRendering: 'pixelated' }}
    >
      <rect x="3" y="11" width="10" height="2" fill="#c9a86a" />
      <rect x="7" y="3" width="2" height="8" fill="#c9a86a" />
      <rect x="5" y="5" width="2" height="2" fill="#c9a86a" />
      <rect x="9" y="5" width="2" height="2" fill="#c9a86a" />
    </svg>
  );
}
