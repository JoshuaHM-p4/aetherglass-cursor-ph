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
  // crowbar:   { id: 'crowbar', name: 'iron crowbar', kind: 'tool', tags: ['pry','heavy','iron'] ... }
  // sword_short, key_brass, mushroom_foul, ore_iron, potion_dim, pane_shard, torch_stub
} as unknown as Readonly<Record<string, ItemTemplate>>;

export type ItemId = keyof typeof ITEM_REGISTRY & string;

export function isKnownItem(id: string): boolean {
  throw new Error('not implemented');
}

/** Fresh bag-ready instance. Throws only on a programmer error (unknown id after a guard). */
export function instantiate(id: string, qty = 1): Item {
  throw new Error('not implemented');
}

/**
 * Boot-time consistency check over a loaded level: every id in every entity's
 * `contents`, and every recipe input/output, must exist here. Returns the offending
 * ids so `lib/ldtk/load.ts` can throw with a useful message at H8 instead of at demo time.
 */
export function unknownItemIds(ids: readonly string[]): string[] {
  throw new Error('not implemented');
}
