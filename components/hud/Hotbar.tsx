'use client';

import { ITEM_REGISTRY } from '../../lib/sim/registry';
import { useGame } from '../useGame';

export default function Hotbar({ active }: { active: number }) {
  const hotbar = useGame((s) => s.state.player.hotbar);
  const bag = useGame((s) => s.state.player.bag);

  return (
    <ol className="flex gap-1.5" aria-label="hotbar">
      {hotbar.map((id, i) => {
        const item = id ? (bag.find((it) => it.id === id) ?? ITEM_REGISTRY[id]) : null;
        const selected = i === active;
        return (
          <li
            key={i}
            className={`flex h-11 w-11 flex-col items-center justify-center border ${
              selected
                ? 'border-amber-400/80 bg-black/55 shadow-[0_0_10px_rgba(201,168,106,0.35)]'
                : 'border-white/15 bg-black/40'
            }`}
          >
            <span className="font-pixel text-[8px] leading-none text-amber-200/90">
              {item ? glyph(item.id) : '·'}
            </span>
            <span className="mt-0.5 font-pixel text-[7px] tracking-widest text-white/40">
              {i + 1}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function glyph(id: string): string {
  if (id.includes('sword')) return 'SW';
  if (id.includes('crowbar')) return 'CB';
  if (id.includes('key')) return 'KY';
  if (id.includes('potion')) return 'PT';
  if (id.includes('mushroom')) return 'SH';
  if (id.includes('ore')) return 'OR';
  if (id.includes('shard') || id.includes('pane')) return 'GL';
  if (id.includes('torch')) return 'TR';
  return id.slice(0, 2).toUpperCase();
}
