// lib/sim/recipes.ts
//
// 6-8 recipes, all discoverable, all validated against ITEM_REGISTRY at boot.

import { bagHasRoomFor, heldQty } from './select';
import type { GameState } from './types';

export interface Recipe {
  id: string;
  name: string;
  /** itemId -> qty consumed. */
  inputs: Readonly<Record<string, number>>;
  /** The single produced itemId. Multi-output recipes are not worth the reducer branch. */
  output: string;
  outputQty: number;
  /** Shown in the bag's craft panel; also fed to `suggest_craft` results. */
  hint: string;
}

export const RECIPES: readonly Recipe[] = [
  {
    id: 'dim_draught',
    name: 'dim draught',
    inputs: { mushroom_foul: 1, ore_iron: 1 },
    output: 'potion_dim',
    outputQty: 1,
    hint: 'A foul cap and a pinch of ore make a dull restorative.',
  },
  {
    id: 'brass_cast',
    name: 'brass cast',
    inputs: { ore_iron: 2 },
    output: 'key_brass',
    outputQty: 1,
    hint: 'Two lumps of ore, folded until they remember a key.',
  },
  {
    id: 'relight',
    name: 'relight',
    inputs: { torch_stub: 1, mushroom_foul: 1 },
    output: 'torch_stub',
    outputQty: 1,
    hint: 'A mushroom as tinder. The stub remembers fire.',
  },
  {
    id: 'foul_tincture',
    name: 'foul tincture',
    inputs: { mushroom_foul: 2 },
    output: 'potion_dim',
    outputQty: 1,
    hint: 'Two caps, crushed. It will not taste like healing.',
  },
  {
    id: 'shard_set',
    name: 'shard set',
    inputs: { pane_shard: 1, potion_dim: 1 },
    output: 'pane_shard',
    outputQty: 1,
    hint: 'Wet the glass. It holds a little longer.',
  },
  {
    id: 'ore_bundle',
    name: 'ore bundle',
    inputs: { ore_iron: 1, torch_stub: 1 },
    output: 'ore_iron',
    outputQty: 2,
    hint: 'Heat and fold. One lump becomes two, poorer each.',
  },
];

/**
 * Recipes fully satisfiable from the bag right now. Used by BOTH the craft grid (to
 * enable buttons) and `suggest_craft` (to name one) — one definition of "craftable",
 * so the Pane can never suggest something the grid would refuse.
 */
export function craftableNow(state: GameState): Recipe[] {
  return RECIPES.filter(
    (r) =>
      Object.entries(r.inputs).every(([id, qty]) => heldQty(state, id) >= qty) &&
      bagHasRoomFor(state, r.output),
  );
}

/** Recipes that use at least one of these ids AND are fully satisfiable. */
export function findRecipesFor(state: GameState, materialIds: readonly string[]): Recipe[] {
  const wanted = new Set(materialIds);
  return craftableNow(state).filter((r) => Object.keys(r.inputs).some((id) => wanted.has(id)));
}

export function recipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
