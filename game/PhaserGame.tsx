// game/PhaserGame.tsx
//
// Mounted exactly once by GameCanvas (ssr: false, no props). Owns the Phaser.Game
// lifecycle: create on mount, destroy on unmount. Nothing flows in via props;
// everything flows through the EventBus and the store.
'use client';

import { useEffect, useRef } from 'react';
import { StartGame } from './main';

export default function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (gameRef.current) return;
    gameRef.current = StartGame('game-container');
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id="game-container" />;
}
