// game/scenes/Overworld.ts
//
// Where the store meets the scene graph. The most important twenty lines in the game
// layer, because this is where "Phaser is downstream of the sim, not beside it" is either
// true or a comment.
//
// HOW PHASER READS TRUTH: `gameStore.subscribe` in `create()`, torn down in `shutdown()`.
// Not props (AGENTS.md #6 — the canvas takes none and never re-mounts), and not the bus
// (facts are not moments). The subscription is coarse — one callback, diffed against the
// previous state — because the number of sprites is ~30 and a per-entity selector web
// costs more than the diff.
//
// WHAT IT SYNCS: entity `state` -> texture frame + physics body enabled. Player tile ->
// nothing (Phaser owns the player's pixel position; the sim's `player.tx/ty` is a
// downstream record of tile crossings, not the authority on where the sprite is). That
// asymmetry is deliberate and is the only place the sim is NOT the source of truth: it
// would otherwise mean quantising smooth movement through a reducer at 60fps.

import Phaser from 'phaser';
import type { Entity, Facing, GameState } from '../../lib/sim/types';
import { gameStore, world } from '../../lib/sim/store';
import { bus } from '../EventBus';
import { GAME_HEIGHT, GAME_WIDTH, TILE } from '../main';
import { installCombatSystem } from '../systems/combat';
import { installFocusSystem } from '../systems/focus';
import { attachProximityRings, installProximitySystem } from '../systems/proximity';

export interface OverworldRefs {
  entityLayer: Phaser.GameObjects.Container;
  player: Phaser.Physics.Arcade.Sprite;
  dimLayer: Phaser.GameObjects.Rectangle;
  spotlight: Phaser.GameObjects.Image;
  leaderLine: Phaser.GameObjects.Graphics;
}

const MAP_W = 30;
const MAP_H = 17;
const SPEED = 80;

function textureFor(entity: Entity): string {
  if (entity.kind === 'container') return 'tex-chest';
  if (entity.kind === 'door') return 'tex-door';
  if (entity.kind === 'shrine') return 'tex-shrine';
  return 'tex-slime';
}

export class Overworld extends Phaser.Scene implements OverworldRefs {
  entityLayer!: Phaser.GameObjects.Container;
  player!: Phaser.Physics.Arcade.Sprite;
  dimLayer!: Phaser.GameObjects.Rectangle;
  spotlight!: Phaser.GameObjects.Image;
  leaderLine!: Phaser.GameObjects.Graphics;
  facing: Facing = 'down';

  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private hpText!: Phaser.GameObjects.Text;
  private lastTx = -1;
  private lastTy = -1;
  private prev: GameState | null = null;
  private unsubStore: (() => void) | null = null;
  private unsubHydrate: (() => void) | null = null;
  private teardownCombat: (() => void) | null = null;
  private teardownProximity: (() => void) | null = null;
  private teardownFocus: (() => void) | null = null;

  constructor() {
    super('Overworld');
  }

  create(): void {
    this.drawFloor();
    this.walls = this.physics.add.staticGroup();
    for (let tx = 0; tx < MAP_W; tx++) {
      this.placeWall(tx, 0);
      this.placeWall(tx, MAP_H - 1);
    }
    for (let ty = 1; ty < MAP_H - 1; ty++) {
      this.placeWall(0, ty);
      this.placeWall(MAP_W - 1, ty);
    }

    const start = world().player;
    this.player = this.physics.add.sprite(start.tx * TILE + 8, start.ty * TILE + 8, 'tex-player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.physics.add.collider(this.player, this.walls);

    this.entityLayer = this.add.container(0, 0);
    this.dimLayer = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(20)
      .setScrollFactor(0);
    this.spotlight = this.add.image(0, 0, 'tex-spot').setVisible(false).setDepth(21);
    this.leaderLine = this.add.graphics().setDepth(22);

    this.hpText = this.add
      .text(4, 4, '', { fontFamily: 'monospace', fontSize: '10px', color: '#c9a86a' })
      .setDepth(30)
      .setScrollFactor(0);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;

    this.spawnEntities();
    this.teardownCombat = installCombatSystem(this);
    this.teardownProximity = installProximitySystem(this);
    this.teardownFocus = installFocusSystem(this);

    this.unsubStore = gameStore.subscribe((s) => {
      this.syncFromStore();
      this.hpText.setText(`HP ${s.state.player.hp}/${s.state.player.hpMax}`);
    });
    this.hpText.setText(`HP ${world().player.hp}/${world().player.hpMax}`);

    this.unsubHydrate = bus.on('sim:hydrated', () => this.spawnEntities());
    this.prev = world();
    bus.emit('world:ready', { sceneKey: 'Overworld' });
  }

  update(): void {
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;
    let vx = 0;
    let vy = 0;
    let facing: Facing | null = null;
    if (left) {
      vx = -SPEED;
      facing = 'left';
    } else if (right) {
      vx = SPEED;
      facing = 'right';
    }
    if (up) {
      vy = -SPEED;
      facing = facing ?? 'up';
    } else if (down) {
      vy = SPEED;
      facing = facing ?? 'down';
    }
    this.player.setVelocity(vx, vy);
    if (facing) {
      this.facing = facing;
      const tx = Math.floor(this.player.x / TILE);
      const ty = Math.floor(this.player.y / TILE);
      if (tx !== this.lastTx || ty !== this.lastTy) {
        this.lastTx = tx;
        this.lastTy = ty;
        bus.emit('world:tile_entered', { tx, ty, facing });
      }
    }
  }

  shutdown(): void {
    this.unsubStore?.();
    this.unsubHydrate?.();
    this.teardownCombat?.();
    this.teardownProximity?.();
    this.teardownFocus?.();
  }

  spawnEntities(): void {
    for (const child of [...this.entityLayer.list]) {
      child.destroy();
    }
    for (const entity of Object.values(world().entities)) {
      const sprite = this.physics.add.sprite(
        entity.tx * TILE + 8,
        entity.ty * TILE + 8,
        textureFor(entity),
      );
      sprite.name = entity.id;
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setImmovable(true);
      body.allowGravity = false;
      this.physics.add.collider(this.player, sprite);
      this.entityLayer.add(sprite);
      attachProximityRings(this, { sprite, paneWorthy: entity.paneWorthy ?? false });
    }
  }

  syncFromStore(): void {
    const next = world();
    const prev = this.prev;
    this.prev = next;
    if (!prev) return;
    for (const [id, entity] of Object.entries(next.entities)) {
      if (prev.entities[id]?.state === entity.state) continue;
      const sprite = this.entityLayer.getByName(id) as Phaser.Physics.Arcade.Sprite | null;
      if (!sprite) continue;
      if (entity.state === 'open') sprite.setTint(0x886644);
      if (entity.state === 'dead') {
        sprite.setTint(0x555555);
        if (sprite.body) sprite.body.enable = false;
      }
    }
  }

  private drawFloor(): void {
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        this.add.image(tx * TILE + 8, ty * TILE + 8, 'tex-floor');
      }
    }
  }

  private placeWall(tx: number, ty: number): void {
    this.walls.create(tx * TILE + 8, ty * TILE + 8, 'tex-wall');
  }
}
