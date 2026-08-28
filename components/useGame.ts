// components/useGame.ts
//
// The React binding for the vanilla store. It lives OUTSIDE lib/sim because AGENTS.md
// requires that `lib/sim/**` import nothing from react — and because Phaser must be able
// to import the store without pulling React into the scene graph.
//
// Four lines of real code. It is a separate file rather than an export in store.ts
// specifically so that the import graph enforces the rule instead of a reviewer.

'use client';

import { useStore } from 'zustand';
import { gameStore, type GameStore } from '../lib/sim/store';

export function useGame<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore as never, selector as never) as T;
}

/** For event handlers, which want the value now and should not subscribe. */
export const readGame = () => gameStore.getState();
