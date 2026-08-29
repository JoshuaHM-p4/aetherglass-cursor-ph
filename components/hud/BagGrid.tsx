'use client';

import type { JSX } from 'react';
import { playFileSfx } from '../../game/systems/fileSfx';
import { BAG_SLOTS, BAG_TRASH_SLOT } from '../../lib/sim/select';
import { useGame } from '../useGame';
import ItemIcon from './ItemIcon';

export default function BagGrid({
  cursor,
  heldIndex,
  onCursor,
  onSlot,
  onTrash,
  onDiscard,
}: {
  cursor: number;
  heldIndex: number | null;
  onCursor: (index: number) => void;
  onSlot: (index: number) => void;
  onTrash: () => void;
  onDiscard: (index: number) => void;
}): JSX.Element {
  const bag = useGame((s) => s.state.player.bag);
  const hotbar = useGame((s) => s.state.player.hotbar);
  const trash = useGame((s) => s.state.player.trash);
  const slots = Array.from({ length: BAG_SLOTS }, (_, i) => bag[i] ?? null);
  const trashLit = cursor === BAG_TRASH_SLOT;
  const holding = heldIndex !== null;

  return (
    <div
      className="pointer-events-auto border border-amber-400/35 bg-[rgba(14,16,24,0.78)] p-3 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
      data-hud
      onClick={(event) => event.stopPropagation()}
    >
      <p className="mb-2 font-pixel text-[10px] tracking-[0.2em] text-amber-200/80">BAG</p>
      <p className="mb-2 font-pixel text-[8px] leading-snug text-white/45">
        arrows / wasd move · space select · 1–3 hotbar
      </p>
      <div className="flex items-end gap-2">
        <ol className="grid grid-cols-4 gap-1.5">
          {slots.map((item, i) => {
            const equipped = item ? hotbar.includes(item.id) : false;
            const held = heldIndex === i;
            const focused = cursor === i;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={!item && heldIndex === null}
                  onMouseEnter={() => {
                    onCursor(i);
                    if (item) playFileSfx('cursor');
                  }}
                  onClick={(event) => {
                    playFileSfx('select');
                    onSlot(i);
                    event.currentTarget.blur();
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (!item) return;
                    playFileSfx('select');
                    onDiscard(i);
                    event.currentTarget.blur();
                  }}
                  title={item?.name ?? 'empty'}
                  className={`relative flex h-16 w-full flex-col items-center justify-center border px-1 ${
                    held
                      ? 'border-amber-300 bg-amber-400/20'
                      : focused
                        ? 'border-amber-200 bg-black/50 shadow-[0_0_8px_rgba(201,168,106,0.4)]'
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
        <button
          type="button"
          disabled={!holding && !trash}
          onMouseEnter={() => {
            onCursor(BAG_TRASH_SLOT);
            playFileSfx('cursor');
          }}
          onClick={(event) => {
            playFileSfx('select');
            onTrash();
            event.currentTarget.blur();
          }}
          title={
            holding
              ? 'throw held item (delete)'
              : trash
                ? `take back ${trash.name}`
                : 'trash (delete throws the selected item)'
          }
          aria-keyshortcuts="Delete"
          className={`relative flex h-16 w-16 shrink-0 flex-col items-center justify-center border ${
            holding
              ? 'border-rose-300/70 bg-rose-950/40 shadow-[0_0_10px_rgba(190,80,70,0.35)]'
              : trashLit
                ? 'border-amber-200 bg-black/50 shadow-[0_0_8px_rgba(201,168,106,0.4)]'
                : 'border-white/12 bg-black/35'
          } ${holding || trash ? 'cursor-pointer hover:border-rose-200/70' : 'cursor-default'}`}
        >
          {trash ? (
            <>
              <ItemIcon id={trash.id} size={28} />
              {trash.qty > 1 && (
                <span className="absolute right-1 bottom-1 font-pixel text-[8px] text-white/70">
                  ×{trash.qty}
                </span>
              )}
            </>
          ) : (
            <TrashGlyph hot={holding} size={22} />
          )}
          <span className="mt-1 font-pixel text-[7px] leading-none tracking-widest text-white/40">
            DEL
          </span>
        </button>
      </div>
      <p className="mt-2 font-pixel text-[8px] text-white/35">
        space pick · delete throws · tab close
      </p>
    </div>
  );
}

function TrashGlyph({ hot, size }: { hot: boolean; size: number }): JSX.Element {
  const fill = hot ? '#c45c4a' : '#8a7a62';
  const rim = hot ? '#e8b2a4' : '#c9a86a';
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden className="pointer-events-none">
      <rect x="5" y="6" width="12" height="13" fill={fill} />
      <rect x="4" y="5" width="14" height="3" fill={rim} />
      <rect x="8" y="3" width="6" height="2" fill={rim} />
      <rect x="8" y="9" width="1" height="8" fill="#1a140f" opacity={0.55} />
      <rect x="11" y="9" width="1" height="8" fill="#1a140f" opacity={0.55} />
      <rect x="14" y="9" width="1" height="8" fill="#1a140f" opacity={0.55} />
    </svg>
  );
}
