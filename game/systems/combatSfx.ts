// Which baked cue a hotbar item should fire. Tags, not item-id branches.

export type WeaponUseCue = 'swing' | 'thump' | 'axe' | 'magic';
export type WeaponHitCue = 'hit' | 'thump_hit' | 'magic_hit';
export type FoeVoiceCue = 'bat' | 'spider' | 'slime' | 'cyclops' | 'rat' | 'crab';

export function weaponUseCue(item: { tags: readonly string[] } | undefined): WeaponUseCue {
  if (!item) return 'swing';
  if (item.tags.includes('bolt') || item.tags.includes('arcane')) return 'magic';
  if (item.tags.includes('heavy') && item.tags.includes('blunt')) return 'thump';
  if (item.tags.includes('heavy') && item.tags.includes('sharp')) return 'axe';
  return 'swing';
}

export function weaponHitCue(item: { tags: readonly string[] } | undefined): WeaponHitCue {
  if (!item) return 'hit';
  if (item.tags.includes('bolt') || item.tags.includes('arcane')) return 'magic_hit';
  if (item.tags.includes('heavy') && item.tags.includes('blunt')) return 'thump_hit';
  return 'hit';
}

export function foeVoiceCue(tags: readonly string[]): FoeVoiceCue | null {
  if (tags.includes('crab') || tags.includes('boss')) return 'crab';
  if (tags.includes('cyclops')) return 'cyclops';
  if (tags.includes('bat')) return 'bat';
  if (tags.includes('spider')) return 'spider';
  if (tags.includes('slime')) return 'slime';
  if (tags.includes('rat')) return 'rat';
  return null;
}
