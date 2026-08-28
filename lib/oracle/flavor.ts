// lib/oracle/flavor.ts
//
// Pre-baked strings from public/assets/flavor.json (ASSETS §5). Server-side read, cached
// at module scope — it is a static import, so Next inlines it and there is no fetch.
//
// The point is latency and offline insurance: 80% of the Pane's output on the frequent
// paths is a lookup, and only choices/negotiation/consequences hit the model.

export type FlavorKey = `item.${string}` | `look.${string}` | `room.${string}`;

/** Missing keys return undefined, never a placeholder — the model must not read "TODO". */
export function flavor(key: FlavorKey): string | undefined {
  throw new Error('not implemented');
}

export function getLore(itemId: string): string | undefined {
  throw new Error('not implemented');
}

/** Tags the registry marks hidden until `identify` is called. */
export function getHiddenTags(itemId: string): string[] {
  throw new Error('not implemented');
}

/**
 * First-look line for an entity. Used by the 'look' turn kind as a FAST PATH: if the
 * entity is a plain prop with a baked `look.` line and no locked/contents fields, the
 * Pane says the baked line and no model call happens at all. This is what keeps the
 * demo responsive while walking down a corridor full of barrels.
 */
export function firstLook(entityId: string): string | undefined {
  throw new Error('not implemented');
}
