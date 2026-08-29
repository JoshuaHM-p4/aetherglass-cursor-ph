// lib/sim/registry.ts
//
// The closed world of items. `GRANT_ITEM` cannot produce an id that is not a key here,
// and LDtk `contents` fields are validated against these keys at load time — so a typo
// in the level editor is a boot-time error, not a chest that silently grants nothing.
//
// Authored by hand (8-12 items). `qty` and `stackable` come from the template; the
// instance in the bag is a clone with its own qty.

import type { Item } from './types';

/** An item as authored: everything except the per-instance quantity. */
export type ItemTemplate = Omit<Item, 'qty'> & { qty?: never };

export const ITEM_REGISTRY: Readonly<Record<string, ItemTemplate>> = {
  crowbar: {
    id: 'crowbar',
    name: 'iron crowbar',
    kind: 'tool',
    tags: ['pry', 'heavy'],
    stackable: false,
  },
  wooden_sword: {
    id: 'wooden_sword',
    name: 'wooden sword',
    kind: 'weapon',
    tags: ['blunt'],
    stackable: false,
    stats: { damage: 1, reach: 1, cooldownMs: 320, swingMs: 220, cone: 0.7, knock: 0.7 },
  },
  sword_short: {
    id: 'sword_short',
    name: 'short sword',
    kind: 'weapon',
    tags: ['sharp'],
    stackable: false,
    stats: { damage: 2, reach: 1, cooldownMs: 260, swingMs: 180, cone: 1.16, knock: 1 },
  },
  saber: {
    id: 'saber',
    name: 'saber',
    kind: 'weapon',
    tags: ['sharp'],
    stackable: false,
    stats: { damage: 2, reach: 1, cooldownMs: 160, swingMs: 120, cone: 0.7, knock: 0.8 },
  },
  knife: {
    id: 'knife',
    name: 'knife',
    kind: 'weapon',
    tags: ['sharp'],
    stackable: false,
    stats: { damage: 1, reach: 1, cooldownMs: 110, swingMs: 90, cone: 0.5, knock: 0.5 },
  },
  hammer: {
    id: 'hammer',
    name: 'hammer',
    kind: 'weapon',
    tags: ['blunt', 'heavy'],
    stackable: false,
    stats: { damage: 4, reach: 1, cooldownMs: 420, swingMs: 280, cone: 1.4, knock: 1.8 },
  },
  axe: {
    id: 'axe',
    name: 'axe',
    kind: 'weapon',
    tags: ['sharp', 'heavy'],
    stackable: false,
    stats: { damage: 3, reach: 1, cooldownMs: 280, swingMs: 200, cone: 1.0, knock: 1.1 },
  },
  staff: {
    id: 'staff',
    name: 'staff',
    kind: 'weapon',
    tags: ['arcane', 'bolt'],
    stackable: false,
    stats: { damage: 2, reach: 6, cooldownMs: 280, swingMs: 140, knock: 0.4 },
  },
  pole: {
    id: 'pole',
    name: 'pole',
    kind: 'weapon',
    tags: ['blunt'],
    stackable: false,
    stats: { damage: 2, reach: 3, cooldownMs: 280, swingMs: 200, cone: 1.3, knock: 0.5 },
  },
  shield_wood: {
    id: 'shield_wood',
    name: 'wooden shield',
    kind: 'shield',
    tags: ['block'],
    stackable: false,
    stats: { cooldownMs: 360 },
  },
  shield_iron: {
    id: 'shield_iron',
    name: 'iron shield',
    kind: 'shield',
    tags: ['block'],
    stackable: false,
    stats: { damage: 1, cooldownMs: 280 },
  },
  key_brass: {
    id: 'key_brass',
    name: 'brass key',
    kind: 'key',
    tags: ['key'],
    stackable: false,
  },
  mushroom_foul: {
    id: 'mushroom_foul',
    name: 'foul mushroom',
    kind: 'consumable',
    tags: ['foul', 'edible'],
    stackable: true,
  },
  ore_iron: {
    id: 'ore_iron',
    name: 'iron ore',
    kind: 'material',
    tags: ['heavy', 'reagent'],
    stackable: true,
  },
  potion_dim: {
    id: 'potion_dim',
    name: 'dim potion',
    kind: 'consumable',
    tags: ['arcane'],
    stackable: true,
    stats: { heal: 4, cooldownMs: 280 },
  },
  potion_red: {
    id: 'potion_red',
    name: 'red potion',
    kind: 'consumable',
    tags: ['edible'],
    stackable: true,
    stats: { heal: 6, cooldownMs: 280 },
  },
  potion_blue: {
    id: 'potion_blue',
    name: 'blue potion',
    kind: 'consumable',
    tags: ['ward', 'arcane'],
    stackable: true,
    stats: { cooldownMs: 280 },
  },
  potion_green: {
    id: 'potion_green',
    name: 'green potion',
    kind: 'consumable',
    tags: ['haste'],
    stackable: true,
    stats: { cooldownMs: 280 },
  },
  pane_shard: {
    id: 'pane_shard',
    name: 'shard of the pane',
    kind: 'relic',
    tags: ['arcane', 'fragile', 'light'],
    stackable: false,
  },
  torch_stub: {
    id: 'torch_stub',
    name: 'torch stub',
    kind: 'tool',
    tags: ['burning', 'light'],
    stackable: true,
  },
  key: {
    id: 'key',
    name: 'iron key',
    kind: 'key',
    tags: ['key'],
    stackable: true,
  },
  master_key: {
    id: 'master_key',
    name: 'master key',
    kind: 'key',
    tags: ['master_key'],
    stackable: false,
  },
  heart_container: {
    id: 'heart_container',
    name: 'heart container',
    kind: 'relic',
    tags: ['light'],
    stackable: false,
  },
} as unknown as Readonly<Record<string, ItemTemplate>>;

export type ItemId = keyof typeof ITEM_REGISTRY & string;

/** Closed list for grant schemas. The model sees these ids; it cannot name a fourth coin. */
export const ITEM_IDS = Object.keys(ITEM_REGISTRY) as [string, ...string[]];

export function isKnownItem(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ITEM_REGISTRY, id);
}

/** Fresh bag-ready instance. Throws only on a programmer error (unknown id after a guard). */
export function instantiate(id: string, qty = 1): Item {
  const template = ITEM_REGISTRY[id];
  if (!template) {
    throw new Error(`instantiate: unknown item id "${id}"`);
  }
  return { ...template, qty };
}

/**
 * Boot-time consistency check over a loaded level: every id in every entity's
 * `contents`, and every recipe input/output, must exist here. Returns the offending
 * ids so `lib/ldtk/load.ts` can throw with a useful message at H8 instead of at demo time.
 */
export function unknownItemIds(ids: readonly string[]): string[] {
  return ids.filter((id) => !isKnownItem(id));
}
