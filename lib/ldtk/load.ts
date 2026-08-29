// lib/ldtk/load.ts
//
// LDtk JSON -> sim entities + a tilemap handle. ASSETS §4.
//
// THE ONE THING THIS FILE MUST GET RIGHT: `id = e.iid`. That id is the sim key, the
// Phaser `sprite.name`, the `focus_entity` argument, and the `entityId` in every bus
// payload. One id space, no translation layer (AGENTS.md #4). Getting it wrong costs an
// hour of spotlights landing on the wrong barrel, and the failure is silent.

import { unknownItemIds } from '../sim/registry';
import { initialState } from '../sim/reducer';
import type { Entity, EntityKind, GameState } from '../sim/types';

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

type EntityInst = LdtkJson['levels'][0]['layerInstances'][0]['entityInstances'][0];

const ENTITY_KINDS = new Set<EntityKind>([
  'container', 'door', 'shrine', 'enemy', 'elite', 'npc', 'prop',
]);

/**
 * Loads and VALIDATES. Every id in every `contents` field is checked against
 * ITEM_REGISTRY and every `kind` against EntityKind; unknown values throw with the LDtk
 * iid in the message. A level-editor typo should be a boot failure at hour 8, not a chest
 * that grants nothing at hour 11.
 */
export function loadLevel(json: LdtkJson): LoadedLevel {
  const layer = json.levels[0]?.layerInstances.find((l) => l.__identifier === 'Entities');
  const entities: Record<string, Entity> = {};
  for (const e of layer?.entityInstances ?? []) {
    const kind = field<EntityKind>(e, 'kind');
    if (!kind || !ENTITY_KINDS.has(kind)) {
      throw new Error(`LDtk ${e.iid}: unknown kind ${String(kind)}`);
    }
    const contents = field<string[]>(e, 'contents') ?? [];
    const bad = unknownItemIds(contents);
    if (bad.length > 0) {
      throw new Error(`LDtk ${e.iid}: unknown contents ${bad.join(',')}`);
    }
    entities[e.iid] = {
      id: e.iid,
      kind,
      name: field<string>(e, 'name') ?? e.iid,
      tags: field<string[]>(e, 'tags') ?? [],
      state: 'idle',
      tx: Math.floor(e.px[0] / 16),
      ty: Math.floor(e.px[1] / 16),
      roomId: 'r_0_0',
      locked: field<boolean>(e, 'locked') ?? false,
      contents,
      paneWorthy: field<boolean>(e, 'paneWorthy') ?? false,
      seed: field<string>(e, 'seed'),
    };
  }
  return { entities, tilemap: json.levels[0] };
}

/** Merge a loaded level into a fresh GameState. The only caller of `gameStore.hydrate`. */
export function stateFromLevel(level: LoadedLevel): GameState {
  const state = initialState();
  state.entities = level.entities;
  return state;
}

export function field<T>(e: EntityInst, name: string): T | undefined {
  const found = e.fieldInstances.find((f) => f.__identifier === name);
  return found ? (found.__value as T) : undefined;
}
