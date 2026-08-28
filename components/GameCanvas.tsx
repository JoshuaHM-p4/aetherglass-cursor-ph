// components/GameCanvas.tsx
//
// The entire React<->Phaser boundary. `dynamic(..., { ssr: false })`, no props,
// mounts once, never re-mounts (AGENTS.md #6). All communication is the EventBus.
'use client';

import dynamic from 'next/dynamic';

const Game = dynamic(() => import('../game/PhaserGame'), { ssr: false });

export default function GameCanvas() {
  return <Game />;
}
