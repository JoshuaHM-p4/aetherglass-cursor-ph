// lib/ldtk/load.ts
//
// LDtk JSON -> sim entities + a tilemap handle. ASSETS §4.
//
// THE ONE THING THIS FILE MUST GET RIGHT: `id = e.iid`. That id is the sim key, the
// Phaser `sprite.name`, the `focus_entity` argument, and the `entityId` in every bus
// payload. One id space, no translation layer (AGENTS.md #4). Getting it wrong costs an
// hour of spotlights landing on the wrong barrel, and the failure is silent.

import type { Entity, GameState } from '../sim/types';

/** Only the fields we read. Not a full LDtk typing — that is a dependency, not a schema. */
export interface LdtkJson {
  levels: Array<{
    layerInstances: Array<{
      __identifier: string;
      entityInstances: Array<{
        iid: string;
        px: [number, number];
        fieldInstances: Array<{ __identifier: string; __value: unknown }>;
      }>;
    }>;
  }>;
}

export interface LoadedLevel {
  entities: Record<string, Entity>;
  /** Opaque to the sim; handed to Phaser's tilemap loader. */
  tilemap: unknown;
}

/**
 * Loads and VALIDATES. Every id in every `contents` field is checked against
 * ITEM_REGISTRY and every `kind` against EntityKind; unknown values throw with the LDtk
 * iid in the message. A level-editor typo should be a boot failure at hour 8, not a chest
 * that grants nothing at hour 11.
 */
export function loadLevel(json: LdtkJson): LoadedLevel {
  throw new Error('not implemented');
}

/** Merge a loaded level into a fresh GameState. The only caller of `gameStore.hydrate`. */
export function stateFromLevel(level: LoadedLevel): GameState {
  throw new Error('not implemented');
}

export function field<T>(
  e: LdtkJson['levels'][0]['layerInstances'][0]['entityInstances'][0],
  name: string,
): T | undefined {
  throw new Error('not implemented');
}
