'use client';

import { useSyncExternalStore, type JSX } from 'react';
import {
  readInteractHintAnchor,
  subscribeInteractHint,
} from '../../game/interactHintAnchor';

const empty = { visible: false, x: 0, y: 0, name: '' };

function EnterKey(): JSX.Element {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center border border-amber-200/55 bg-black/75"
    >
      <svg
        width={11}
        height={11}
        viewBox="0 0 16 16"
        className="pointer-events-none"
        style={{ imageRendering: 'pixelated' }}
      >
        <rect x="11" y="2" width="2" height="8" fill="#c9a86a" />
        <rect x="3" y="8" width="10" height="2" fill="#c9a86a" />
        <rect x="1" y="8" width="2" height="2" fill="#c9a86a" />
        <rect x="3" y="6" width="2" height="2" fill="#c9a86a" />
        <rect x="3" y="10" width="2" height="2" fill="#c9a86a" />
      </svg>
    </span>
  );
}

export default function InteractHint(): JSX.Element | null {
  const hint = useSyncExternalStore(subscribeInteractHint, readInteractHintAnchor, () => empty);
  if (!hint.visible) return null;

  return (
    <div
      className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-full flex-col items-center"
      style={{
        left: `clamp(8px, ${hint.x}px, calc(100% - 8px))`,
        top: `clamp(22px, ${hint.y - 8}px, calc(100% - 8px))`,
      }}
    >
      <div className="flex items-center gap-1 border border-amber-400/40 bg-black/70 px-1 py-px">
        <EnterKey />
        <span className="font-pixel text-[7px] leading-none tracking-wide text-amber-100/80">
          Interact {hint.name}
        </span>
      </div>
      <span className="h-1.5 w-px bg-amber-400/40" />
    </div>
  );
}
