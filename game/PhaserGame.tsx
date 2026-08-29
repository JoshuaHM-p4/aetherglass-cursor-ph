// game/PhaserGame.tsx
//
// Mounted exactly once by GameCanvas (ssr: false, no props). Owns the Phaser.Game
// lifecycle: create on mount, destroy on unmount. Nothing flows in via props;
// everything flows through the EventBus and the store.
'use client';

import { useEffect, useRef } from 'react';
import { installWorldAdapter } from './EventBus';
import { StartGame } from './main';

export default function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (gameRef.current) return;
    const teardownAdapter = installWorldAdapter();
    gameRef.current = StartGame('game-container');
    const root = document.getElementById('game-container');
    const focusWorld = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    };
    root?.addEventListener('pointerdown', focusWorld);
    return () => {
      root?.removeEventListener('pointerdown', focusWorld);
      teardownAdapter();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id="game-container" />;
}
