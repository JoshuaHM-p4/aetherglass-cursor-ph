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
import { CAMERA_ZOOM, TILE } from '../main';
import { isWorldInputBlocked } from '../inputCapture';
import { requestSessionDismiss } from '../../lib/client/paneSessions';
import { setPlayerAnchor, worldToOverlay } from '../playerAnchor';
import { DEAD_TINT, installCombatSystem } from '../systems/combat';
import { installFocusSystem } from '../systems/focus';
import { attachProximityRings, installProximitySystem } from '../systems/proximity';
import { installSessionMarks } from '../systems/sessionMark';
import { plantRoomFade } from '../systems/roomFade';
import { installSoundSystem } from '../systems/sound';

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

/**
 * The one place an entity's `state` becomes pixels. Called on spawn as well as on the
 * diff, so a hydrate that lands a dead slime does not draw it alive.
 */
function applyEntityState(
  sprite: Phaser.Physics.Arcade.Sprite,
  entity: Entity,
): void {
  if (entity.state === 'dead') {
    sprite.setTint(DEAD_TINT).setAlpha(0.5);
    if (sprite.body) sprite.body.enable = false;
    return;
  }
  sprite.clearTint();
  if (entity.kind === 'container') {
    const open = entity.state === 'open';
    if (entity.tags.includes('wood') && sprite.scene.textures.exists('tex-crate')) {
      sprite.setTexture('tex-crate');
    } else {
      sprite.setTexture(open && sprite.scene.textures.exists('tex-chest-open') ? 'tex-chest-open' : 'tex-chest');
    }
    return;
  }
  if (entity.kind === 'door') {
    const open = entity.state === 'open' || entity.state === 'unlocked';
    sprite.setTexture(
      open && sprite.scene.textures.exists('tex-door-open') ? 'tex-door-open' : 'tex-door',
    );
  }
}

function textureFor(entity: Entity, textures: Phaser.Textures.TextureManager): string {
  if (entity.kind === 'container') {
    if (entity.tags.includes('wood') && textures.exists('tex-crate')) return 'tex-crate';
    return 'tex-chest';
  }
  if (entity.kind === 'door') return 'tex-door';
  if (entity.kind === 'shrine') return 'tex-shrine';
  return 'tex-slime';
}

function floorTexture(tx: number, ty: number, scene: Phaser.Scene): string {
  const h = (tx * 13 + ty * 29) % 11;
  if (h === 0 && scene.textures.exists('tex-floor-a')) return 'tex-floor-a';
  if (h === 1 && scene.textures.exists('tex-floor-b')) return 'tex-floor-b';
  return 'tex-floor';
}

function wallTexture(tx: number, ty: number, scene: Phaser.Scene): string {
  const n = ty === 0;
  const s = ty === MAP_H - 1;
  const w = tx === 0;
  const e = tx === MAP_W - 1;
  const pick = (key: string) => (scene.textures.exists(key) ? key : 'tex-wall');
  if (n && w) return pick('tex-wall-nw');
  if (n && e) return pick('tex-wall-ne');
  if (n) return 'tex-wall';
  if (s) return pick('tex-wall-s');
  if (w) return pick('tex-wall-w');
  if (e) return pick('tex-wall-e');
  return 'tex-wall';
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
  private lastTx = -1;
  private lastTy = -1;
  private prev: GameState | null = null;
  private unsubStore: (() => void) | null = null;
  private unsubHydrate: (() => void) | null = null;
  private unsubDied: (() => void) | null = null;
  private teardownCombat: (() => void) | null = null;
  private teardownProximity: (() => void) | null = null;
  private teardownFocus: (() => void) | null = null;
  private teardownMarks: (() => void) | null = null;
  private teardownSound: (() => void) | null = null;

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
    plantRoomFade(this, {
      mapW: MAP_W,
      mapH: MAP_H,
      tile: TILE,
      wallKeyAt: (tx, ty) => wallTexture(tx, ty, this),
    });

    const start = world().player;
    this.facing = start.facing;
    this.player = this.physics.add.sprite(start.tx * TILE + 8, start.ty * TILE + 8, 'tex-player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.physics.add.collider(this.player, this.walls);

    const worldW = MAP_W * TILE;
    const worldH = MAP_H * TILE;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setSize(this.scale.gameSize.width, this.scale.gameSize.height);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.scale.on('resize', this.onResize, this);

    this.entityLayer = this.add.container(0, 0);
    this.dimLayer = this.add
      .rectangle(0, 0, worldW, worldH, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(20);
    this.spotlight = this.add.image(0, 0, 'tex-spot').setVisible(false).setDepth(21);
    this.leaderLine = this.add.graphics().setDepth(22);

    this.cursors = this.input.keyboard!.addKeys(
      {
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      },
      false,
    ) as Phaser.Types.Input.Keyboard.CursorKeys;
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D', false) as typeof this.wasd;

    this.plantTorches();
    this.spawnEntities();
    this.teardownCombat = installCombatSystem(this);
    this.teardownProximity = installProximitySystem(this);
    this.teardownFocus = installFocusSystem(this);
    this.teardownMarks = installSessionMarks(this);
    this.teardownSound = installSoundSystem(this);

    this.unsubStore = gameStore.subscribe(() => {
      this.syncFromStore();
    });

    this.unsubHydrate = bus.on('sim:hydrated', () => {
      this.resetPlayer();
      this.spawnEntities();
    });
    this.unsubDied = bus.on('sim:event', (event) => {
      if (event.type !== 'player_died') return;
      this.player.setVelocity(0, 0);
      this.haltWalk();
      this.player.setTint(DEAD_TINT);
      this.player.setAngle(90);
    });
    this.prev = world();
    // Phaser emits SHUTDOWN but never calls the method, and a restarted scene that
    // subscribed twice moves the player two tiles per keypress.
    this.events.once('shutdown', this.shutdown, this);
    bus.emit('world:ready', { sceneKey: 'Overworld' });
  }

  update(): void {
    this.syncAnchor();
    if (isWorldInputBlocked()) {
      this.player.setVelocity(0, 0);
      this.haltWalk();
      return;
    }
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
    if (facing === 'left') this.player.setFlipX(true);
    if (facing === 'right') this.player.setFlipX(false);
    const moving = vx !== 0 || vy !== 0;
    if (moving) requestSessionDismiss();
    if (moving) this.playWalk();
    else this.haltWalk();
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

  private playWalk(): void {
    if (!this.anims.exists('player-walk')) return;
    if (this.player.anims.currentAnim?.key === 'player-walk' && this.player.anims.isPlaying) return;
    this.player.play('player-walk');
  }

  private haltWalk(): void {
    if (this.player.anims.isPlaying) this.player.anims.stop();
    if (this.player.texture.key !== 'tex-player') this.player.setTexture('tex-player');
  }

  private resetPlayer(): void {
    const start = world().player;
    this.facing = start.facing;
    this.lastTx = start.tx;
    this.lastTy = start.ty;
    this.player.setPosition(start.tx * TILE + 8, start.ty * TILE + 8);
    this.player.setVelocity(0, 0);
    this.player.setFlipX(start.facing === 'left');
    this.player.setAngle(0);
    this.player.setAlpha(1);
    this.player.clearTint();
    this.haltWalk();
  }

  shutdown(): void {
    this.unsubStore?.();
    this.unsubHydrate?.();
    this.unsubDied?.();
    this.teardownCombat?.();
    this.teardownProximity?.();
    this.teardownFocus?.();
    this.teardownMarks?.();
    this.teardownSound?.();
    this.unsubStore = null;
    this.unsubHydrate = null;
    this.unsubDied = null;
    this.teardownCombat = null;
    this.teardownProximity = null;
    this.teardownFocus = null;
    this.teardownMarks = null;
    this.teardownSound = null;
    this.scale.off('resize', this.onResize, this);
    this.prev = null;
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
  }

  spawnEntities(): void {
    for (const child of [...this.entityLayer.list]) {
      child.destroy();
    }
    for (const entity of Object.values(world().entities)) {
      const sprite = this.physics.add.sprite(
        entity.tx * TILE + 8,
        entity.ty * TILE + 8,
        textureFor(entity, this.textures),
      );
      sprite.name = entity.id;
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setImmovable(true);
      body.allowGravity = false;
      this.physics.add.collider(this.player, sprite);
      this.entityLayer.add(sprite);
      applyEntityState(sprite, entity);
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
      applyEntityState(sprite, entity);
    }
  }

  private syncAnchor(): void {
    const canvas = this.game.canvas;
    const overlay = canvas.closest('main') ?? canvas.parentElement;
    if (!overlay) return;
    const view = this.cameras.main.worldView;
    const canvasBox = canvas.getBoundingClientRect();
    const overlayBox = overlay.getBoundingClientRect();
    const screen = worldToOverlay(this.player.x, this.player.y, {
      viewX: view.x,
      viewY: view.y,
      viewW: view.width,
      viewH: view.height,
      canvasLeft: canvasBox.left,
      canvasTop: canvasBox.top,
      canvasW: canvasBox.width,
      canvasH: canvasBox.height,
      overlayLeft: overlayBox.left,
      overlayTop: overlayBox.top,
    });
    setPlayerAnchor({
      x: screen.x,
      y: screen.y,
      facing: this.player.flipX ? -1 : 1,
    });
  }

  private drawFloor(): void {
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        this.add.image(tx * TILE + 8, ty * TILE + 8, floorTexture(tx, ty, this));
      }
    }
  }

  private placeWall(tx: number, ty: number): void {
    this.walls.create(tx * TILE + 8, ty * TILE + 8, wallTexture(tx, ty, this));
  }

  private plantTorches(): void {
    if (!this.textures.exists('tex-torch')) return;
    const xs = [3, 8, 12, 18, 24];
    for (const tx of xs) {
      const x = tx * TILE + 8;
      const y = 8;
      const torch = this.add.image(x, y, 'tex-torch').setDepth(6);
      const glow = this.textures.exists('tex-glow')
        ? this.add.image(x, TILE + 4, 'tex-glow').setDepth(5).setAlpha(0.4)
        : null;
      this.tweens.add({
        targets: glow ? [torch, glow] : torch,
        alpha: { from: 0.55, to: 1 },
        duration: 140 + ((tx * 17) % 90),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}
