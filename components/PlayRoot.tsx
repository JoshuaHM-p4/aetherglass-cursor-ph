'use client';

import { useSyncExternalStore } from 'react';
import GameCanvas from './GameCanvas';
import DeathScreen from './hud/DeathScreen';
import Hud from './hud/Hud';
import MainMenu from './menu/MainMenu';
import Pane from './pane/Pane';
import { isPlaying, subscribePlaying } from '../lib/client/play';

const notPlaying = () => false;

export default function PlayRoot() {
  const playing = useSyncExternalStore(subscribePlaying, isPlaying, notPlaying);

  return (
    <>
      <div className="absolute inset-0">
        <GameCanvas />
      </div>
      {playing && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <Hud />
          <Pane />
          <DeathScreen />
        </div>
      )}
      {!playing && <MainMenu />}
    </>
  );
}
