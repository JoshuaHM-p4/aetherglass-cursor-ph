// lib/oracle/flavor.ts
//
// Pre-baked strings. Flavor bake (ASSETS §5) is out of this pass; missing keys
// return undefined so the model never reads a placeholder.

export type FlavorKey = `item.${string}` | `look.${string}` | `room.${string}`;

const LORE: Partial<Record<string, string>> = {
  crowbar: 'Bent iron. It has already forced something that did not want to open.',
  wooden_sword: 'Practice wood. It still remembers being a branch.',
  sword_short: 'A scavenger\'s blade. Honest, dull at the tip, still sharp enough.',
  saber: 'A curve meant for drawing, not chopping.',
  knife: 'Short, honest, and already used.',
  hammer: 'More door than blade. It does not care what it hits.',
  axe: 'A wedge with a handle. The dungeon has plenty of both.',
  staff: 'It does not cut. It sends.',
  pole: 'Long enough to keep the worst of it off you.',
  shield_wood: 'Boards and a strap. It buys a moment, not a life.',
  shield_iron: 'Heavy rim. Things bounce off if you time it.',
  key_brass: 'Warm from a pocket that is not yours.',
  mushroom_foul: 'It smells like a closed room. Edible is not the same as wise.',
  ore_iron: 'Heavy, cold, and not yet a tool.',
  potion_dim: 'The liquid forgets the light it used to hold.',
  potion_red: 'It smells like iron and apology.',
  potion_blue: 'Cold glass. For a breath, the world cannot find you.',
  potion_green: 'Bitter. The next swing arrives early.',
  pane_shard: 'A splinter of the glass you carry. It hums when you bleed.',
  torch_stub: 'Char and wire. It remembers fire if asked correctly.',
  key: 'Cut for a lock that is still waiting.',
  master_key: 'Heavier than it looks. The dungeon itself was the mould.',
  heart_container: 'A sealed well of extra life. It does not fit in a pocket.',
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
