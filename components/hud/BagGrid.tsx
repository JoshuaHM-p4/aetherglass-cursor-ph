'use client';

import { playFileSfx } from '../../game/systems/fileSfx';
import { BAG_SLOTS } from '../../lib/sim/select';
import { useGame } from '../useGame';
import ItemIcon from './ItemIcon';

export default function BagGrid({
  heldIndex,
  onSlot,
}: {
  heldIndex: number | null;
  onSlot: (index: number) => void;
}) {
  const bag = useGame((s) => s.state.player.bag);
  const hotbar = useGame((s) => s.state.player.hotbar);
  const slots = Array.from({ length: BAG_SLOTS }, (_, i) => bag[i] ?? null);

  return (
    <div
      className="pointer-events-auto border border-amber-400/35 bg-[rgba(14,16,24,0.78)] p-3 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
      data-hud
      onClick={(event) => event.stopPropagation()}
    >
      <p className="mb-2 font-pixel text-[10px] tracking-[0.2em] text-amber-200/80">BAG</p>
      <p className="mb-2 font-pixel text-[8px] leading-snug text-white/45">
        click an item, then 1–3 or a hotbar slot
      </p>
      <ol className="grid grid-cols-4 gap-1.5">
        {slots.map((item, i) => {
          const equipped = item ? hotbar.includes(item.id) : false;
          const held = heldIndex === i;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!item && heldIndex === null}
                onMouseEnter={() => {
                  if (item) playFileSfx('cursor');
                }}
                onClick={(event) => {
                  playFileSfx('select');
                  onSlot(i);
                  event.currentTarget.blur();
                }}
                title={item?.name ?? 'empty'}
                className={`relative flex h-16 w-full flex-col items-center justify-center border px-1 ${
                  held
                    ? 'border-amber-300 bg-amber-400/20'
                    : equipped
                      ? 'border-amber-400/50 bg-black/45'
                      : 'border-white/12 bg-black/35'
                } ${item ? 'cursor-pointer hover:border-amber-200/70' : 'cursor-default'}`}
              >
                {item ? (
                  <>
                    <ItemIcon id={item.id} size={32} />
                    <span className="mt-1 max-w-full truncate font-pixel text-[7px] leading-tight text-amber-100">
                      {item.name}
                    </span>
                    {item.qty > 1 && (
                      <span className="absolute right-1 bottom-1 font-pixel text-[8px] text-white/70">
                        ×{item.qty}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-pixel text-[8px] text-white/20">—</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 font-pixel text-[8px] text-white/35">tab to close</p>
    </div>
  );
}
