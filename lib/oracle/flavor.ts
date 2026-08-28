// lib/oracle/flavor.ts
//
// Pre-baked strings. Flavor bake (ASSETS §5) is out of this pass; missing keys
// return undefined so the model never reads a placeholder.

export type FlavorKey = `item.${string}` | `look.${string}` | `room.${string}`;

const LORE: Partial<Record<string, string>> = {
  crowbar: 'Bent iron. It has already forced something that did not want to open.',
  sword_short: 'A scavenger\'s blade. Honest, dull at the tip, still sharp enough.',
  key_brass: 'Warm from a pocket that is not yours.',
  mushroom_foul: 'It smells like a closed room. Edible is not the same as wise.',
  ore_iron: 'Heavy, cold, and not yet a tool.',
  potion_dim: 'The liquid forgets the light it used to hold.',
  pane_shard: 'A splinter of the glass you carry. It hums when you bleed.',
  torch_stub: 'Char and wire. It remembers fire if asked correctly.',
};

const HIDDEN: Partial<Record<string, string[]>> = {
  pane_shard: ['light'],
  mushroom_foul: ['foul'],
};

/** Missing keys return undefined, never a placeholder — the model must not read "TODO". */
export function flavor(key: FlavorKey): string | undefined {
  if (key.startsWith('item.')) return LORE[key.slice(5)];
  return undefined;
}

export function getLore(itemId: string): string | undefined {
  return LORE[itemId];
}

/** Tags the registry marks hidden until `identify` is called. */
export function getHiddenTags(itemId: string): string[] {
  return HIDDEN[itemId] ?? [];
}

export function firstLook(entityId: string): string | undefined {
  void entityId;
  return undefined;
}
