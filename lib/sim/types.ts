// lib/sim/types.ts
//
// The contract. Everything else in Aetherglass is downstream of this file.
// This module imports nothing — not react, not phaser, not next, not zod. Keep it that way.
//
// This is the starter `types.ts` verbatim, plus four additions marked [+]. Each addition
// exists because a downstream module could not be written without it; nothing here is
// speculative. See rationale.md §"Deltas to the near-final contract".

// ---------------------------------------------------------------- items

/**
 * Tags are the reasoning surface for the Pane. The model never sees a hardcoded
 * table of "a crowbar can pry a sealed door" — it infers that from `pry` on the
 * item and `sealed` on the door. Adding a tag adds gameplay; adding a code branch
 * adds maintenance. Prefer tags.
 */
export type ItemTag =
  | 'pry' | 'sharp' | 'blunt' | 'burning' | 'arcane' | 'foul'
  | 'key' | 'fragile' | 'heavy' | 'edible' | 'reagent' | 'light';

export type ItemKind = 'weapon' | 'tool' | 'consumable' | 'material' | 'key' | 'relic';

export interface Item {
  id: string;                 // snake_case, unique, exists in the registry
  name: string;
  kind: ItemKind;
  tags: ItemTag[];
  qty: number;
  stackable: boolean;
  loreKey?: string;           // -> public/assets/flavor.json
  stats?: { damage?: number; reach?: number; heal?: number };
}

// ---------------------------------------------------------------- entities

export type EntityKind = 'container' | 'door' | 'shrine' | 'enemy' | 'elite' | 'npc' | 'prop';
export type EntityState = 'idle' | 'open' | 'unlocked' | 'broken' | 'dead' | 'pacified';

export interface Entity {
  id: string;                 // === LDtk iid === Phaser sprite.name
  kind: EntityKind;
  name: string;
  tags: string[];             // 'sealed', 'runed', 'iron', 'wounded'
  state: EntityState;
  tx: number;                 // tile coords
  ty: number;
  locked?: boolean;
  /** The ONLY item ids `apply_effect:grant` may produce from this entity. */
  contents?: string[];
  hp?: number;
  hpMax?: number;
  paneWorthy?: boolean;       // auto-wakes the Pane + triggers prefetch
  seed?: string;              // authored first-look hint, from LDtk
}

// ---------------------------------------------------------------- state

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface PlayerState {
  hp: number;
  hpMax: number;
  /** 0-100. Drives the crack overlay AND the Pane's voice in the system prompt. */
  paneIntegrity: number;
  tx: number;
  ty: number;
  facing: Facing;
  bag: Item[];
  hotbar: [string | null, string | null, string | null];
}

export interface GameState {
  player: PlayerState;
  entities: Record<string, Entity>;
  flags: Record<string, boolean>;
  /** Last ~20 human-readable events. The tail feeds the context packet. */
  log: string[];
  ui: {
    interactTargetId: string | null;
    paneOpen: boolean;
    bagOpen: boolean;
  };
}

// ---------------------------------------------------------------- actions

export type Action =
  | { type: 'MOVE'; facing: Facing; tx: number; ty: number }
  | { type: 'DAMAGE'; amount: number; source: string }
  | { type: 'HEAL'; amount: number }
  | { type: 'GRANT_ITEM'; itemId: string; qty?: number; fromEntityId?: string }
  | { type: 'CONSUME_ITEM'; itemId: string; qty?: number }
  | { type: 'OPEN_CONTAINER'; entityId: string }
  | { type: 'UNLOCK'; entityId: string; withItemId: string }
  | { type: 'CRAFT'; recipeId: string }
  | { type: 'SET_FLAG'; flag: string; value: boolean }
  | { type: 'SET_ENTITY_STATE'; entityId: string; state: EntityState }
  | { type: 'DAMAGE_PANE'; amount: number }
  // [+] The sword. Without this, Phaser's combat system has no way to reduce
  // Entity.hp and would have to keep its own copy of enemy health — which
  // AGENTS.md forbids and ARCHITECTURE §1.3 calls out by name.
  | { type: 'STRIKE_ENTITY'; entityId: string; amount: number; withItemId: string | null }
  | { type: 'SET_HOTBAR'; slot: 0 | 1 | 2; itemId: string | null }
  | { type: 'SWAP_BAG'; a: number; b: number };

/** snake_case, surfaced to the model verbatim so it can narrate its own failure. */
export type RejectReason =
  | 'no_such_entity' | 'no_such_item' | 'not_nearby'
  | 'already_open' | 'locked' | 'wrong_tool'
  | 'not_in_bag' | 'missing_ingredients' | 'bag_full'
  | 'not_in_contents' | 'unknown_flag' | 'already_dead'
  // [+] ARCHITECTURE §2's own sample reducer returns 'no_such_container', which is
  // not in this union. `wrong_kind` is the general form: the id resolves, but the
  // entity is not the sort of thing this action operates on.
  | 'wrong_kind';

export type SimEvent =
  | { type: 'container_opened'; entityId: string }
  | { type: 'item_gained'; itemId: string }
  | { type: 'item_lost'; itemId: string }
  | { type: 'damaged'; amount: number; source: string }
  | { type: 'healed'; amount: number }
  | { type: 'entity_state_changed'; entityId: string; state: EntityState }
  | { type: 'crafted'; recipeId: string; itemId: string }
  | { type: 'flag_set'; flag: string; value: boolean }
  | { type: 'pane_cracked'; integrity: number }
  // [+] Phaser needs a hit-spark and a knockback tween at the moment of impact,
  // distinct from the player being damaged.
  | { type: 'entity_struck'; entityId: string; amount: number; hpLeft: number }
  | { type: 'player_died'; source: string };

export interface ActionResult {
  state: GameState;
  ok: boolean;
  reason?: RejectReason;
  events: SimEvent[];
}

/**
 * [+] Who asked. Two actors write to this state: the keyboard (via Phaser) and the
 * Pane (via replayed verdicts). We cannot split GameState per actor — there is one
 * world — so instead every write is attributed. Origin is used for log phrasing, for
 * the dev desync overlay, and for the one asymmetry in the store: a pane-origin
 * action that fails local re-validation is dropped and journalled rather than thrown.
 */
export type ActionOrigin = 'boot' | 'keyboard' | 'pane';

// ---------------------------------------------------------------- context packet

/** What the Pane sees. Keep it under ~1200 tokens. Never include the tilemap. */
export interface ContextPacket {
  player: {
    hp: number;
    hpMax: number;
    paneIntegrity: number;
    facing: Facing;
    position: { x: number; y: number };
  };
  inventory: Array<{ id: string; name: string; tags: string[]; qty: number }>;
  /** Nearest 8 only — the Pane can't talk about rooms you haven't reached. */
  nearby: Array<{
    id: string;
    kind: EntityKind;
    name: string;
    state: EntityState;
    tags: string[];
    distance: number;
    seed?: string;
  }>;
  /** What the player pressed Enter on, if anything. */
  focus: string | null;
  recentEvents: string[];
  flags: Record<string, boolean>;
}
