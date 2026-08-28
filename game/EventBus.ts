// game/EventBus.ts
//
// ===========================================================================
// OPEN QUESTION 2 — the EventBus contract, resolved.
//
// TWO RULES, and they decide every membership question below:
//
//   1. THE BUS CARRIES MOMENTS; THE STORE CARRIES FACTS. If it has a duration, read it
//      from `gameStore` (Phaser subscribes directly — the store is vanilla zustand for
//      exactly this reason). If it happens at an instant, emit it. So there is no
//      `sim:hp_changed` and no `sim:state` event: HP is a fact and Phaser reads it. There
//      IS `sim:event`, because a SimEvent is a moment.
//
//   2. NAMESPACE BY PRODUCER, NOT BY TOPIC. `sim:` is emitted only by the store, `world:`
//      only by Phaser, `pane:` only by React. One producer per channel means a listener
//      always knows who to blame, and it structurally prevents the two-writers problem
//      from reappearing on the bus after we were careful about it in the store.
//
//      This renames ARCHITECTURE §5's `world:focus` to `pane:focus`. The spotlight is
//      produced by the Pane and consumed by Phaser; under producer-namespacing `world:`
//      would be a lie. It is the only deliberate divergence from the doc's code samples.
//
// Payload discipline: every payload is a plain object with a snake_case-keyed shape.
// Entity references are ALWAYS `entityId`, and that id is the LDtk iid, the sim key, and
// `sprite.name` — one id space, no mapping layer (AGENTS.md #4).
//
// Typing: the template's EventBus is an untyped Phaser.Events.EventEmitter. We keep the
// instance and put a typed facade in front of it. `emit`/`on` are generic over BusEvents,
// so a typo in an event name or a payload field is a compile error — which is the whole
// reason to bother, since a silently-misspelled event is invisible until the demo.
// ===========================================================================

import type { Facing, RejectReason, SimEvent } from '../lib/sim/types';
import type { FocusData } from '../lib/oracle/protocol';

export interface BusEvents {
  // ------------------------------------------------------------------ sim -> world
  // Producer: lib/sim/store.ts. Consumer: Phaser systems, and the HUD for flashes.

  /** Every SimEvent from every committed action, in order. Sparks, shakes, sounds. */
  'sim:event': SimEvent;
  /**
   * A pane proposal the live world refused after the fact. Consumed by the dev overlay
   * only — the player-facing recovery is a journal line, not a visual.
   */
  'sim:desync': { entityId: string | null; action: string; reason: RejectReason };
  /** Store hydrated (boot, LDtk load). Phaser (re)spawns sprites from `state.entities`. */
  'sim:hydrated': { entityCount: number };

  // ------------------------------------------------------------------ world -> sim/react
  // Producer: Phaser. Consumer: the store (via an adapter) and React.

  /** Scene is up and the entity layer exists. React waits for this before allowing `look`. */
  'world:ready': { sceneKey: string };
  /**
   * Player crossed into a new tile. Throttled to tile boundaries, NOT per frame — the
   * 60fps movement path is pure Phaser, and this is the discrete moment it produces.
   */
  'world:tile_entered': { tx: number; ty: number; facing: Facing };
  /** Sword connected. Phaser resolved the hitbox; the sim decides the damage's legality. */
  'world:attack_landed': { entityId: string; facing: Facing; withItemId: string | null };
  /** Player touched a hazard or an enemy body. */
  'world:player_hurt': { amount: number; source: string };
  /** Enter pressed on an adjacent entity. Wakes the Pane. */
  'world:interact': { entityId: string };
  /** Walked out of reach of the interact target. Clears `ui.interactTargetId`. */
  'world:interact_clear': Record<string, never>;
  /**
   * Arcade-physics overlap sensor, radius PREFETCH_RADIUS_TILES. THE PREFETCH TRIGGER.
   * The physics engine is the spatial index, so nothing scans the entity table per frame.
   */
  'world:proximity_enter': { entityId: string; paneWorthy: boolean };
  'world:proximity_exit': { entityId: string };

  // ------------------------------------------------------------------ pane -> world
  // Producer: React/the Pane. Consumer: Phaser.

  /** The signature effect. Fired from `onData` mid-stream, before the sentence finishes. */
  'pane:focus': FocusData;
  /** New turn started, or the dwell expired early. Phaser un-dims. */
  'pane:focus_clear': Record<string, never>;
  /** The glass woke or slept. Phaser dips the ambient light and plays the glass-ring. */
  'pane:awake': { open: boolean; reason: 'interact' | 'typed' | 'closed' };
  /** Breathing blur is CSS; this is for the in-world glass shimmer only. */
  'pane:thinking': { thinking: boolean };

  // ------------------------------------------------------------------ hud -> world
  /** Tab. Phaser dims and stops accepting movement input while the bag is open. */
  'hud:bag_toggled': { open: boolean };
}

export type BusEventName = keyof BusEvents;

export interface TypedBus {
  emit<K extends BusEventName>(event: K, payload: BusEvents[K]): void;
  on<K extends BusEventName>(event: K, fn: (payload: BusEvents[K]) => void): () => void;
  off<K extends BusEventName>(event: K, fn: (payload: BusEvents[K]) => void): void;
  /** Removes every listener for a scene teardown. Phaser scenes restart; React does not. */
  clear(): void;
}

/** Wraps the template's Phaser.Events.EventEmitter singleton. Module-scope safe: no `window`. */
export const bus: TypedBus = null as never;

/**
 * Installed once at app start. Translates `world:*` moments into Actions and dispatches
 * them with origin 'keyboard'.
 *
 * This adapter is the only place Phaser's vocabulary meets the sim's, and it is
 * deliberately not inside a scene: scenes restart, and a restarted scene must not
 * re-register a dispatcher. Returns its own teardown.
 *
 * Tracing a flow needs three files: Overworld.ts emits -> this adapter dispatches ->
 * reducer.ts decides.
 */
export function installWorldAdapter(): () => void {
  throw new Error('not implemented');
  // TODO
  //   world:tile_entered   -> MOVE
  //   world:attack_landed  -> STRIKE_ENTITY   (then SET_ENTITY_STATE 'dead' if hp <= 0,
  //                                            decided by the reducer, not here)
  //   world:player_hurt    -> DAMAGE, and DAMAGE_PANE on heavy hits
  //   world:interact       -> SET_UI interact target (store method, not an Action)
}
