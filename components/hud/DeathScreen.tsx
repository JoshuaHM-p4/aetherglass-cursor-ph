'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, type JSX } from 'react';
import { bus } from '../../game/EventBus';
import { setBagOpen, setSettingsOpen } from '../../game/inputCapture';
import { requestSessionDismiss } from '../../lib/client/paneSessions';
import { readGame, useGame } from '../useGame';

export default function DeathScreen(): JSX.Element | null {
  const dead = useGame((s) => s.state.player.hp <= 0);
  const [source, setSource] = useState<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    return bus.on('sim:event', (event) => {
      if (event.type === 'player_died') setSource(event.source);
    });
  }, []);

  useEffect(() => {
    if (!dead) {
      setSource(null);
      return;
    }
    requestSessionDismiss();
    setBagOpen(false);
    setSettingsOpen(false);
  }, [dead]);

  useEffect(() => {
    if (!dead) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'r' || event.key === 'R' || event.key === 'Enter') {
        event.preventDefault();
        readGame().restart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dead]);

  if (!dead) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center"
      data-hud
      role="dialog"
      aria-label="you have fallen"
    >
      <div className="absolute inset-0 bg-[rgba(8,4,8,0.72)]" />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M0 42 L18 44 L22 38 L31 47 L48 41 L52 52 L67 39 L79 48 L100 43"
          fill="none"
          stroke="rgba(196,92,92,0.55)"
          strokeWidth="0.35"
        />
        <path
          d="M0 58 L12 55 L28 61 L41 54 L55 63 L70 56 L88 60 L100 57"
          fill="none"
          stroke="rgba(201,168,106,0.28)"
          strokeWidth="0.25"
        />
        <path
          d="M47 0 L49 22 L44 31 L51 48 L46 71 L52 100"
          fill="none"
          stroke="rgba(196,92,92,0.35)"
          strokeWidth="0.2"
        />
      </svg>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative mx-6 max-w-md border border-amber-400/25 bg-[rgba(14,16,24,0.55)] px-6 py-5 backdrop-blur-md"
      >
        <p className="font-pixel text-[9px] tracking-[0.35em] text-red-400/80">THE PANE WENT DARK</p>
        <p className="mt-3 font-pixel text-[11px] leading-relaxed text-amber-100/90">
          I will not narrate a corpse.
        </p>
        <p className="mt-1 font-pixel text-[10px] leading-relaxed text-white/45">
          {source ? `felled by the ${source}.` : 'you stopped moving.'} the keep keeps its own
          counsel now.
        </p>
        <button
          type="button"
          onClick={() => readGame().restart()}
          className="mt-5 border border-amber-400/50 bg-black/40 px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-amber-200 hover:border-amber-200 hover:bg-amber-400/10"
        >
          STAND
          <span className="ml-3 text-white/35">R</span>
        </button>
      </motion.div>
    </div>
  );
}
