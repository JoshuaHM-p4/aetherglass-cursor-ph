// game/systems/proximity.ts
//
// Who is near the player, computed by the physics engine rather than by scanning state.
//
// WHY IT MATTERS: this runs in the 60fps path. A naive implementation reads
// `gameStore.getState().state.entities` every frame and computes distances — 30 entities
// x 60 frames x nothing gained. Instead each interactable sprite gets two arcade sensor
// circles at spawn:
//
//   reach ring    (1 tile)  -> 'world:interact' eligibility + the "press Enter" glyph
//   approach ring (3 tiles) -> 'world:proximity_enter' -> PrefetchController.arm()
//
// Overlap begin/end are already events in arcade physics, so the bus events fire exactly
// once per crossing and the per-frame cost is the physics engine's, which we are paying
// for movement anyway. No spatial index in lib/sim, no distance code duplicated between
// the sim and the scene (`select.distanceTo` exists for the packet, and only for that).

import Phaser from 'phaser';
import type { Facing } from '../../lib/sim/types';
import { world } from '../../lib/sim/store';
import { bus } from '../EventBus';
import { consumePadAction, isWorldInputBlocked } from '../inputCapture';
import { pickAdjacentEntity } from './interactTarget';

export interface ProximitySpawnArgs {
  /** `sprite.name` is already the entity id — set at spawn, single source of ids. */
  sprite: Phaser.Physics.Arcade.Sprite;
  paneWorthy: boolean;
}

export const RINGS = { reachTiles: 1, approachTiles: 3, tile: 16 } as const;

type RingSprite = Phaser.Physics.Arcade.Sprite & {
  entityId: string;
  paneWorthy: boolean;
  ring: 'reach' | 'approach';
};

/**
 * Per scene, because Phaser reuses the Scene instance across restarts: a module-level
 * group would hand the second run a bag of destroyed sensors.
 */
const sensorGroups = new WeakMap<Phaser.Scene, Phaser.Physics.Arcade.Group>();

function sensors(scene: Phaser.Scene): Phaser.Physics.Arcade.Group {
  let group = sensorGroups.get(scene);
  if (!group) {
    group = scene.physics.add.group();
    sensorGroups.set(scene, group);
  }
  return group;
}

/** Called once per interactable at spawn time, from Overworld's entity pass. */
export function attachProximityRings(
  scene: Phaser.Scene,
  args: ProximitySpawnArgs,
): void {
  const group = sensors(scene);
  const make = (ring: 'reach' | 'approach', tiles: number) => {
    const radius = tiles * RINGS.tile;
    const sensor = scene.physics.add.sprite(args.sprite.x, args.sprite.y, 'tex-floor') as RingSprite;
    sensor.setVisible(false);
    group.add(sensor);
    const body = sensor.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);
    body.allowGravity = false;
    body.checkCollision.none = true;
    // After group.add: Arcade resets the body to the frame. Recentre the circle then.
    body.setCircle(radius, args.sprite.width / 2 - radius, args.sprite.height / 2 - radius);
    sensor.entityId = args.sprite.name;
    sensor.paneWorthy = args.paneWorthy;
    sensor.ring = ring;
    args.sprite.on('destroy', () => sensor.destroy());
    return sensor;
  };
  make('reach', RINGS.reachTiles);
  make('approach', RINGS.approachTiles);
}

/**
 * Installs the overlap handlers and the Enter key binding.
 *
 * The interact target is "the nearest entity inside the reach ring, ties broken by
 * facing" — computed from the current overlap set, which is small (0-3 sprites), not
 * from the entity table.
 */
export function installProximitySystem(scene: Phaser.Scene): () => void {
  const s = scene as Phaser.Scene & { player: Phaser.Physics.Arcade.Sprite; facing: Facing };
  const group = sensors(scene);
  const frameReach = new Set<string>();
  const frameApproach = new Set<string>();
  const heldReach = new Set<string>();
  const heldApproach = new Set<string>();

  const overlap = scene.physics.add.overlap(s.player, group, (_p, obj) => {
    const ring = obj as RingSprite;
    if (ring.ring === 'reach') frameReach.add(ring.entityId);
    else if (ring.ring === 'approach') frameApproach.add(ring.entityId);
  });

  const onEnter = () => {
    if (isWorldInputBlocked()) return;

    // Tile adjacency is the sim's definition of reach (`isAdjacent`). The overlap
    // set is a 60fps hint; Enter is a moment, so we ask the store. Solid chests
    // keep the player tangent to a 1-tile circle, which arcade does not count as
    // overlap, so `heldReach` is often empty when you are standing right there.
    const best = pickAdjacentEntity(world(), s.facing);
    if (best) bus.emit('world:interact', { entityId: best.id });
  };

  const flush = () => {
    for (const id of frameApproach) {
      if (!heldApproach.has(id)) {
        heldApproach.add(id);
        const entity = world().entities[id];
        bus.emit('world:proximity_enter', {
          entityId: id,
          paneWorthy: entity?.paneWorthy ?? false,
        });
      }
    }
    for (const id of [...heldApproach]) {
      if (!frameApproach.has(id)) {
        heldApproach.delete(id);
        bus.emit('world:proximity_exit', { entityId: id });
      }
    }
    for (const id of frameReach) heldReach.add(id);
    for (const id of [...heldReach]) {
      if (!frameReach.has(id)) {
        heldReach.delete(id);
        if (heldReach.size === 0) bus.emit('world:interact_clear', {});
      }
    }
    frameReach.clear();
    frameApproach.clear();
    if (consumePadAction('enter')) onEnter();
  };
  scene.events.on('postupdate', flush);

  const enter = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER, false);
  enter.on('down', onEnter);

  return () => {
    enter.off('down', onEnter);
    scene.events.off('postupdate', flush);
    scene.physics.world.removeCollider(overlap);
    sensorGroups.delete(scene);
    heldReach.clear();
    heldApproach.clear();
  };
}
