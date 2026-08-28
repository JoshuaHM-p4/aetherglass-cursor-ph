'use client';

import { BAG_SLOTS } from '../../lib/sim/select';
import { useGame } from '../useGame';

export default function BagGrid() {
  const bag = useGame((s) => s.state.player.bag);
  const slots = Array.from({ length: BAG_SLOTS }, (_, i) => bag[i] ?? null);

  return (
    <div
      className="pointer-events-auto border border-amber-400/35 bg-[rgba(14,16,24,0.78)] p-3 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
      data-hud
    >
      <p className="mb-2 font-pixel text-[10px] tracking-[0.2em] text-amber-200/80">BAG</p>
      <ol className="grid grid-cols-4 gap-1.5">
        {slots.map((item, i) => (
          <li
            key={i}
            className="flex h-14 flex-col items-center justify-center border border-white/12 bg-black/35 px-1"
          >
            {item ? (
              <>
                <span className="font-pixel text-[9px] leading-tight text-amber-100">
                  {item.name}
                </span>
                {item.qty > 1 && (
                  <span className="font-pixel text-[8px] text-white/50">×{item.qty}</span>
                )}
              </>
            ) : (
              <span className="font-pixel text-[8px] text-white/20">—</span>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 font-serif text-[11px] italic text-white/35">tab to close</p>
    </div>
  );
}
