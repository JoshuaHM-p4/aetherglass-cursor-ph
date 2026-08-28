// lib/sim/recipes.ts
//
// 6-8 recipes, all discoverable, all validated against ITEM_REGISTRY at boot.

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

export const RECIPES: readonly Recipe[] = [];

/**
 * Recipes fully satisfiable from the bag right now. Used by BOTH the craft grid (to
 * enable buttons) and `suggest_craft` (to name one) — one definition of "craftable",
 * so the Pane can never suggest something the grid would refuse.
 */
export function craftableNow(state: GameState): Recipe[] {
  throw new Error('not implemented');
}

/** Recipes that use at least one of these ids AND are fully satisfiable. */
export function findRecipesFor(state: GameState, materialIds: readonly string[]): Recipe[] {
  throw new Error('not implemented');
}

export function recipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
