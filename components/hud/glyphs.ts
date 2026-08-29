export function itemGlyph(id: string): string {
  if (id.includes('sword')) return 'SW';
  if (id.includes('crowbar')) return 'CB';
  if (id.includes('key')) return 'KY';
  if (id.includes('potion')) return 'PT';
  if (id.includes('mushroom')) return 'SH';
  if (id.includes('ore')) return 'OR';
  if (id.includes('shard') || id.includes('pane')) return 'GL';
  if (id.includes('torch')) return 'TR';
  return id.slice(0, 2).toUpperCase();
}
