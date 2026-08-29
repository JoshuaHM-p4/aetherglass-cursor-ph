// HTMLAudio title loop. Overworld is paused on the menu, so Phaser sound
// would freeze with the scene; this stays alive and follows the music slider.

import { bindMusicVolume, getMusicVolume } from './volume';

const SRC = '/assets/music/title-theme/coatlesscarl.mp3';

let el: HTMLAudioElement | null = null;
let wanted = false;

function element(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!el) {
    el = new Audio(SRC);
    el.loop = true;
    el.preload = 'auto';
  }
  el.volume = getMusicVolume();
  return el;
}

export function playTitleMusic(): void {
  wanted = true;
  const audio = element();
  if (!audio) return;
  void audio.play().catch(() => undefined);
}

export function stopTitleMusic(): void {
  wanted = false;
  if (!el) return;
  el.pause();
  el.currentTime = 0;
}

/** Browsers block autoplay until a click or key. Call from the menu overlay. */
export function unlockTitleMusic(): void {
  if (wanted) playTitleMusic();
}

bindMusicVolume((volume) => {
  if (el) el.volume = volume;
});
