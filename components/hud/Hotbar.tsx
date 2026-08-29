'use client';

import { playFileSfx } from '../../game/systems/fileSfx';
import { ITEM_REGISTRY } from '../../lib/sim/registry';
import { useGame } from '../useGame';
import ItemIcon from './ItemIcon';

export default function Hotbar({
  active,
  onSelect,
  onClear,
}: {
  active: number;
  onSelect: (slot: number) => void;
  onClear: (slot: number) => void;
}) {
  const hotbar = useGame((s) => s.state.player.hotbar);
  const bag = useGame((s) => s.state.player.bag);

  return (
    <ol className="flex gap-1.5" aria-label="hotbar">
      {hotbar.map((id, i) => {
        const item = id ? (bag.find((it) => it.id === id) ?? ITEM_REGISTRY[id]) : null;
        const selected = i === active;
        return (
          <li key={i}>
            <button
              type="button"
              onMouseEnter={() => playFileSfx('cursor')}
              onClick={(event) => {
                playFileSfx('select');
                onSelect(i);
                event.currentTarget.blur();
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                playFileSfx('select');
                onClear(i);
                event.currentTarget.blur();
              }}
              title={item ? `${item.name} (${i + 1})` : `slot ${i + 1}`}
              className={`flex h-12 w-12 flex-col items-center justify-center border ${
                selected
                  ? 'border-amber-400/80 bg-black/55 shadow-[0_0_10px_rgba(201,168,106,0.35)]'
                  : 'border-white/15 bg-black/40 hover:border-amber-200/50'
              }`}
            >
              {item ? (
                <ItemIcon id={item.id} size={28} />
              ) : (
                <span className="font-pixel text-[8px] leading-none text-white/25">·</span>
              )}
              <span className="mt-0.5 font-pixel text-[7px] tracking-widest text-white/40">
                {i + 1}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
