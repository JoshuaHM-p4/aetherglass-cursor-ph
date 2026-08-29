// game/scenes/Overworld.ts
//
// One 12×12 at a time. Phaser is downstream of the sim: loadRoom reads
// `world().dungeon.rooms[player.roomId]` and draws only that cell.

import Phaser from 'phaser';
import {
  ALL_FACINGS,
  EXIT_TILE,
  GHOST_ID,
  ROOM_SIZE,
  exitDirAt,
} from '../../lib/dungeon/const';
import type { Entity, Facing, GameState, Room } from '../../lib/sim/types';
import { gameStore, world } from '../../lib/sim/store';
import { bus } from '../EventBus';
import { PLAYER_BODY, TILE, WALL_BODY } from '../const';
import { isWorldInputBlocked, setRoomWiping } from '../inputCapture';
import { requestSessionDismiss } from '../../lib/client/paneSessions';
import { setPlayerAnchor, worldToOverlay } from '../playerAnchor';
import { DEAD_TINT, installCombatSystem } from '../systems/combat';
import { installFocusSystem } from '../systems/focus';
import { attachProximityRings, installProximitySystem } from '../systems/proximity';
import { installSessionMarks } from '../systems/sessionMark';
import { plantRoomFade } from '../systems/roomFade';
import { installSoundSystem } from '../systems/sound';
import { playRoomMusic } from '../systems/music';
import { wipeRoom } from '../systems/veil';
import { installSlimeAi } from '../systems/ai/slime';
import { installGhostAi } from '../systems/ai/ghost';
import { installCrabAi } from '../systems/ai/crab';

export interface OverworldRefs {
  entityLayer: Phaser.GameObjects.Container;
  player: Phaser.Physics.Arcade.Sprite;
  dimLayer: Phaser.GameObjects.Rectangle;
  spotlight: Phaser.GameObjects.Image;
  leaderLine: Phaser.GameObjects.Graphics;
  walls: Phaser.Physics.Arcade.StaticGroup;
}

const SPEED = 80;
const WORLD = ROOM_SIZE * TILE;

function applyEntityState(sprite: Phaser.Physics.Arcade.Sprite, entity: Entity): void {
  if (entity.state === 'dead') {
    sprite.setTint(DEAD_TINT).setAlpha(0.5);
    if (sprite.body) sprite.body.enable = false;
    return;
  }
  sprite.clearTint();
  if (entity.kind === 'container') {
    const open = entity.state === 'open';
    if (entity.tags.includes('pickup')) {
      sprite.setVisible(!open);
      if (sprite.body) sprite.body.enable = !open;
      return;
    }
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
    if (sprite.body) sprite.body.enable = !open;
  }
}

function textureFor(entity: Entity, textures: Phaser.Textures.TextureManager): string {
  if (entity.tags.includes('ghost') && textures.exists('tex-ghost')) return 'tex-ghost';
  if (entity.tags.includes('crab') && textures.exists('tex-crab')) return 'tex-crab';
  if (entity.tags.includes('fountain') && textures.exists('tex-fountain')) return 'tex-fountain';
  if (entity.tags.includes('heart_container') && textures.exists('tex-heart')) return 'tex-heart';
  if (entity.kind === 'container') {
    if (entity.tags.includes('pickup') && entity.contents?.[0] === 'heart_container' && textures.exists('tex-heart')) {
      return 'tex-heart';
    }
    if (entity.tags.includes('wood') && textures.exists('tex-crate')) return 'tex-crate';
    return 'tex-chest';
  }
  if (entity.kind === 'door') return 'tex-door';
  if (entity.kind === 'shrine' || entity.kind === 'prop') {
    return textures.exists('tex-fountain') ? 'tex-fountain' : 'tex-shrine';
  }
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
  const s = ty === ROOM_SIZE - 1;
  const w = tx === 0;
  const e = tx === ROOM_SIZE - 1;
  const pick = (key: string) => (scene.textures.exists(key) ? key : 'tex-wall');
  if (n && w) return pick('tex-wall-nw');
  if (n && e) return pick('tex-wall-ne');
  if (n) return 'tex-wall';
  if (s) return pick('tex-wall-s');
  if (w) return pick('tex-wall-w');
  if (e) return pick('tex-wall-e');
  return 'tex-wall';
}

function roomZoom(gameW: number, gameH: number): number {
  return Math.max(1, Math.floor(Math.min(gameW, gameH) / WORLD));
}

/** Centre a smaller arcade box so a 16px sprite can walk a 16px doorway. */
function insetBody(sprite: Phaser.Physics.Arcade.Sprite, size: number): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | null;
  if (!body) return;
  body.setSize(size, size, true);
}

export class Overworld extends Phaser.Scene implements OverworldRefs {
  entityLayer!: Phaser.GameObjects.Container;
  player!: Phaser.Physics.Arcade.Sprite;
  dimLayer!: Phaser.GameObjects.Rectangle;
  spotlight!: Phaser.GameObjects.Image;
  leaderLine!: Phaser.GameObjects.Graphics;
  walls!: Phaser.Physics.Arcade.StaticGroup;
  facing: Facing = 'down';

  private floorLayer!: Phaser.GameObjects.Container;
  private fadeImage: Phaser.GameObjects.Image | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private lastTx = -1;
  private lastTy = -1;
  private loadedRoomId: string | null = null;
  private prev: GameState | null = null;
  private unsubStore: (() => void) | null = null;
  private unsubHydrate: (() => void) | null = null;
  private unsubDied: (() => void) | null = null;
  private unsubRoom: (() => void) | null = null;
  private teardownCombat: (() => void) | null = null;
  private teardownProximity: (() => void) | null = null;
  private teardownFocus: (() => void) | null = null;
  private teardownMarks: (() => void) | null = null;
  private teardownSound: (() => void) | null = null;
  private teardownSlime: (() => void) | null = null;
  private teardownGhost: (() => void) | null = null;
  private teardownCrab: (() => void) | null = null;

  constructor() {
    super('Overworld');
  }

  create(): void {
    this.floorLayer = this.add.container(0, 0);
    this.walls = this.physics.add.staticGroup();
    this.entityLayer = this.add.container(0, 0);

    const start = world().player;
    this.facing = start.facing;
    this.player = this.physics.add.sprite(start.tx * TILE + 8, start.ty * TILE + 8, 'tex-player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    insetBody(this.player, PLAYER_BODY);
    this.physics.add.collider(this.player, this.walls);

    this.physics.world.setBounds(0, 0, WORLD, WORLD);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setSize(this.scale.gameSize.width, this.scale.gameSize.height);
    this.lockCamera();
    this.scale.on('resize', this.onResize, this);

    this.dimLayer = this.add
      .rectangle(0, 0, WORLD, WORLD, 0x000000, 0)
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

    this.loadRoom(start.roomId, true);
    this.teardownCombat = installCombatSystem(this);
    this.teardownProximity = installProximitySystem(this);
    this.teardownFocus = installFocusSystem(this);
    this.teardownMarks = installSessionMarks(this);
    this.teardownSound = installSoundSystem(this);
    this.teardownSlime = installSlimeAi(this);
    this.teardownGhost = installGhostAi(this);
    this.teardownCrab = installCrabAi(this);

    this.unsubStore = gameStore.subscribe(() => {
      this.syncFromStore();
    });

    this.unsubHydrate = bus.on('sim:hydrated', () => {
      this.loadRoom(world().player.roomId, true);
    });
    this.unsubRoom = bus.on('sim:event', (event) => {
      if (event.type === 'room_entered' && event.roomId !== this.loadedRoomId) {
        setRoomWiping(true);
        wipeRoom(
          this,
          () => this.loadRoom(event.roomId, true),
          () => setRoomWiping(false),
        );
      }
    });
    this.unsubDied = bus.on('sim:event', (event) => {
      if (event.type !== 'player_died') return;
      this.player.setVelocity(0, 0);
      this.haltWalk();
      this.player.setTint(DEAD_TINT);
      this.player.setAngle(90);
    });
    this.prev = world();
    this.events.once('shutdown', this.shutdown, this);
    bus.emit('world:ready', { sceneKey: 'Overworld' });
  }

  loadRoom(roomId: string, snapPlayer: boolean): void {
    const state = world();
    const room = state.dungeon.rooms[roomId];
    if (!room) return;
    this.loadedRoomId = roomId;
    this.clearDecor();
    this.drawFloor();
    this.buildWalls(room);
    this.fadeImage = plantRoomFade(this, {
      mapW: ROOM_SIZE,
      mapH: ROOM_SIZE,
      tile: TILE,
      wallKeyAt: (tx, ty) => wallTexture(tx, ty, this),
    });
    this.plantTorches(room);
    this.spawnEntities(roomId);
    if (snapPlayer) this.resetPlayer();
    this.lockCamera();
    this.physics.world.setBounds(0, 0, WORLD, WORLD);
    this.dimLayer.setSize(WORLD, WORLD);
    playRoomMusic(this, room.kind);
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
        this.tryPickup(tx, ty);
      }
      this.tryPassage(tx, ty, facing);
    }
  }

  private tryPassage(tx: number, ty: number, facing: Facing): void {
    const dir = exitDirAt(tx, ty);
    if (!dir || dir !== facing) return;
    const room = world().dungeon.rooms[world().player.roomId];
    const passage = room?.exits[dir];
    if (!passage || passage.lock !== 'open') return;
    bus.emit('world:enter_passage', { dir });
  }

  private tryPickup(tx: number, ty: number): void {
    const state = world();
    for (const entity of Object.values(state.entities)) {
      if (entity.roomId !== state.player.roomId) continue;
      if (!entity.tags.includes('pickup') || entity.state === 'open') continue;
      if (entity.tx !== tx || entity.ty !== ty) continue;
      gameStore.getState().dispatch({ type: 'OPEN_CONTAINER', entityId: entity.id }, 'keyboard');
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
    this.unsubRoom?.();
    this.teardownCombat?.();
    this.teardownProximity?.();
    this.teardownFocus?.();
    this.teardownMarks?.();
    this.teardownSound?.();
    this.teardownSlime?.();
    this.teardownGhost?.();
    this.teardownCrab?.();
    this.scale.off('resize', this.onResize, this);
    this.prev = null;
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.lockCamera();
  }

  private lockCamera(): void {
    const zoom = roomZoom(this.scale.gameSize.width, this.scale.gameSize.height);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.setBounds(0, 0, WORLD, WORLD);
    this.cameras.main.stopFollow();
    this.cameras.main.centerOn(WORLD / 2, WORLD / 2);
  }

  private clearDecor(): void {
    for (const child of [...this.floorLayer.list]) child.destroy();
    this.walls.clear(true, true);
    for (const child of [...this.entityLayer.list]) child.destroy();
    this.fadeImage?.destroy();
    this.fadeImage = null;
  }

  spawnEntities(roomId: string): void {
    for (const entity of Object.values(world().entities)) {
      if (entity.roomId !== roomId) continue;
      if (entity.id === GHOST_ID) continue;
      const sprite = this.physics.add.sprite(
        entity.tx * TILE + 8,
        entity.ty * TILE + 8,
        textureFor(entity, this.textures),
      );
      sprite.name = entity.id;
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setImmovable(true);
      body.allowGravity = false;
      insetBody(sprite, PLAYER_BODY);
      if (entity.tags.includes('pickup')) {
        body.checkCollision.none = true;
      } else {
        this.physics.add.collider(this.player, sprite);
      }
      if (entity.tags.includes('slime') || entity.tags.includes('crab')) {
        this.physics.add.collider(sprite, this.walls);
        body.setImmovable(false);
      }
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
      if (entity.roomId !== next.player.roomId) continue;
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
    for (let ty = 0; ty < ROOM_SIZE; ty++) {
      for (let tx = 0; tx < ROOM_SIZE; tx++) {
        const img = this.add.image(tx * TILE + 8, ty * TILE + 8, floorTexture(tx, ty, this));
        this.floorLayer.add(img);
      }
    }
  }

  private buildWalls(room: Room): void {
    const openings = new Set<string>();
    for (const dir of ALL_FACINGS) {
      if (room.exits[dir]) {
        const e = EXIT_TILE[dir];
        openings.add(`${e.tx},${e.ty}`);
      }
    }
    for (let tx = 0; tx < ROOM_SIZE; tx++) {
      this.placeWallUnlessOpen(tx, 0, openings);
      this.placeWallUnlessOpen(tx, ROOM_SIZE - 1, openings);
    }
    for (let ty = 1; ty < ROOM_SIZE - 1; ty++) {
      this.placeWallUnlessOpen(0, ty, openings);
      this.placeWallUnlessOpen(ROOM_SIZE - 1, ty, openings);
    }
  }

  private placeWallUnlessOpen(tx: number, ty: number, openings: Set<string>): void {
    if (openings.has(`${tx},${ty}`)) return;
    const wall = this.walls.create(tx * TILE + 8, ty * TILE + 8, wallTexture(tx, ty, this)) as Phaser.Physics.Arcade.Sprite;
    insetBody(wall, WALL_BODY);
  }

  private plantTorches(room: Room): void {
    if (!this.textures.exists('tex-torch')) return;
    if (room.kind === 'master') return;
    const spots = [
      [2, 1],
      [9, 1],
    ] as const;
    for (const [tx, ty] of spots) {
      const x = tx * TILE + 8;
      const y = ty * TILE + 8;
      const torch = this.add.image(x, y, 'tex-torch').setDepth(6);
      this.floorLayer.add(torch);
      const glow = this.textures.exists('tex-glow')
        ? this.add.image(x, y + TILE, 'tex-glow').setDepth(5).setAlpha(0.4)
        : null;
      if (glow) this.floorLayer.add(glow);
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
