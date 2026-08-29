// Crossfade looping music by room kind. Files are preloaded in Preload.ts.

import Phaser from 'phaser';
import type { RoomKind } from '../../lib/sim/types';
import { stopTitleMusic } from './titleMusic';
import { bindMusicVolume, getMusicVolume } from './volume';

const TRACK: Record<RoomKind, string> = {
  fountain: 'mus-fountain',
  cave: 'mus-cave',
  master: 'mus-boss',
};

const FADE_MS = 700;

let current: Phaser.Sound.BaseSound | null = null;
let kind: RoomKind | null = null;

export function playRoomMusic(scene: Phaser.Scene, next: RoomKind): void {
  stopTitleMusic();
  if (kind === next && current?.isPlaying) return;
  const key = TRACK[next];
  if (!scene.cache.audio.exists(key) && !scene.sound.get(key)) {
    current?.stop();
    current = null;
    kind = next;
    return;
  }
  const incoming = scene.sound.add(key, { loop: true, volume: 0 });
  incoming.play();
  scene.tweens.add({
    targets: incoming,
    volume: getMusicVolume(),
    duration: FADE_MS,
  });
  if (current) {
    const outgoing = current;
    scene.tweens.add({
      targets: outgoing,
      volume: 0,
      duration: FADE_MS,
      onComplete: () => {
        outgoing.stop();
        outgoing.destroy();
      },
    });
  }
  current = incoming;
  kind = next;
}

export function stopRoomMusic(): void {
  current?.stop();
  current = null;
  kind = null;
}

bindMusicVolume((volume) => {
  if (current) (current as unknown as { volume: number }).volume = volume;
});
