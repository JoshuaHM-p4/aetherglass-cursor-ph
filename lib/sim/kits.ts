import { appearanceOf, type AppearanceId } from './appearances';
import { instantiate } from './registry';
import type { GameState } from './types';

export interface Kit {
  itemIds: string[];
  label: string;
}

const KITS: Record<AppearanceId, Kit> = {
  wanderer: { itemIds: ['wooden_sword'], label: 'wooden sword' },
  mage: { itemIds: ['staff'], label: 'staff' },
  violet: { itemIds: ['hammer'], label: 'hammer' },
  wright: { itemIds: ['axe'], label: 'axe' },
  squire: { itemIds: ['pole', 'shield_wood'], label: 'pole + wooden shield' },
  hood: { itemIds: ['knife'], label: 'knife' },
};

export function kitFor(appearance: AppearanceId | string): Kit {
  const id = appearanceOf(appearance).id;
  return KITS[id];
}

export function kitLine(appearance: AppearanceId | string): string {
  const kit = kitFor(appearance);
  return `${appearanceOf(appearance).label} · ${kit.label}`;
}

/** Replace bag and hotbar with the appearance's starting kit. Construction only. */
export function applyKit(state: GameState, appearance: AppearanceId | string): void {
  const ids = kitFor(appearance).itemIds;
  state.player.bag = ids.map((id) => instantiate(id));
  state.player.hotbar = [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null];
}
