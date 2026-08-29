// Closed set of Kenney Tiny Dungeon bodies the player may wear.
// Ids are snake_case; `tile` is the pack index (tile_0085.png === 85).

export const DEFAULT_APPEARANCE = 'wanderer';

export const APPEARANCES = [
  { id: 'wanderer', tile: 85, label: 'wanderer' },
  { id: 'wright', tile: 86, label: 'wright' },
  { id: 'violet', tile: 87, label: 'violet' },
  { id: 'squire', tile: 88, label: 'squire' },
  { id: 'mage', tile: 84, label: 'mage' },
  { id: 'hood', tile: 98, label: 'hood' },
] as const;

export type AppearanceId = (typeof APPEARANCES)[number]['id'];

export function isAppearanceId(id: string): id is AppearanceId {
  return APPEARANCES.some((a) => a.id === id);
}

export function appearanceOf(id: string): (typeof APPEARANCES)[number] {
  return APPEARANCES.find((a) => a.id === id) ?? APPEARANCES[0];
}

export function appearanceTileSrc(id: string): string {
  const tile = appearanceOf(id).tile;
  return `/assets/tiles/tiny-dungeon/tile_${String(tile).padStart(4, '0')}.png`;
}
