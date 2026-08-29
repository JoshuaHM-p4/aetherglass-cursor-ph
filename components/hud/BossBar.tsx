'use client';

import { useEffect, useState, type JSX } from 'react';
import { CRAB_ID } from '../../lib/dungeon/const';
import { bus } from '../../game/EventBus';
import { useGame } from '../useGame';

export default function BossBar(): JSX.Element | null {
  const roomId = useGame((s) => s.state.player.roomId);
  const crab = useGame((s) => s.state.entities[CRAB_ID]);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    return bus.on('world:boss_intro', ({ revealed: next }) => setRevealed(next));
  }, []);

  useEffect(() => {
    if (!crab || crab.state === 'dead' || crab.roomId !== roomId) setRevealed(false);
  }, [crab, roomId]);

  const hurt = Boolean(crab && (crab.hp ?? 0) < (crab.hpMax ?? 0));
  const show = Boolean(crab && crab.state !== 'dead' && crab.roomId === roomId && (revealed || hurt));
  if (!show || !crab) return null;

  const hp = crab.hp ?? 0;
  const hpMax = Math.max(1, crab.hpMax ?? 1);
  const pct = Math.max(0, Math.min(100, (hp / hpMax) * 100));

  return (
    <div
      className="pointer-events-none absolute top-5 left-1/2 z-30 w-[min(28rem,72vw)] -translate-x-1/2"
      data-boss-bar
      aria-label={`${crab.name} ${hp} of ${hpMax}`}
    >
      <p className="mb-1.5 text-center font-pixel text-[8px] tracking-[0.32em] text-amber-100/85">
        {crab.name.toUpperCase()}
      </p>
      <div className="border border-[#1a1014] bg-[#1a1014] p-px shadow-[0_1px_0_rgba(0,0,0,0.55)]">
        <div className="relative h-3 bg-[#3a1820]">
          <div className="h-full bg-[#c45c5c]" style={{ width: `${pct}%` }} />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,transparent_45%,rgba(0,0,0,0.25)_100%)]" />
        </div>
      </div>
    </div>
  );
}
