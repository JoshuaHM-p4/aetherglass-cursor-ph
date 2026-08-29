// game/scenes/Overworld.ts
//
// One 12×12 at a time. Phaser is downstream of the sim: loadRoom reads
// `world().dungeon.rooms[player.roomId]` and draws only that cell.

import Phaser from 'phaser';
import {
  ALL_FACINGS,
  EXIT_SPAN,
  EXIT_TILE,
  GHOST_ID,
  OPPOSITE,
  ROOM_SIZE,
  exitDirAt,
  exitMouthCells,
  facingFromDoorId,
} from '../../lib/dungeon/const';
import type { Entity, Facing, GameState, Room } from '../../lib/sim/types';
import { gameStore, world } from '../../lib/sim/store';
import { bus } from '../EventBus';
import { ACTOR_BODY, PROP_BODY, TILE, WALL_BODY } from '../const';
import { isWorldInputBlocked, setRoomWiping } from '../inputCapture';
import { CRAB_BODY, CRAB_SCALE } from '../systems/hitbox';
import { isPlaying } from '../../lib/client/play';
import { requestSessionDismiss } from '../../lib/client/paneSessions';
import { setPlayerAnchor, worldToOverlay } from '../playerAnchor';
import { DEAD_TINT, installCombatSystem } from '../systems/combat';
import { endKnockback, tickKnockback } from '../systems/knockback';
import { installHpBars } from '../systems/hpBar';
import { installFocusSystem } from '../systems/focus';
import { attachProximityRings, installProximitySystem } from '../systems/proximity';
import { installSessionMarks } from '../systems/sessionMark';
import { plantRoomFade } from '../systems/roomFade';
import { installSoundSystem } from '../systems/sound';
import { playRoomMusic, stopRoomMusic } from '../systems/music';
import { playTitleMusic } from '../systems/titleMusic';
import { applyPlayerLook, lookTextureKey } from '../systems/playerLook';
import { applyRoomCamera } from '../systems/roomCamera';
import { wipeRoom } from '../systems/veil';
import { installInteractHint } from '../systems/interactHint';
import { installHitboxDebug } from '../systems/hitboxDebug';
import { installSlimeAi } from '../systems/ai/slime';
import { installGhostAi } from '../systems/ai/ghost';
import { installCrabAi } from '../systems/ai/crab';
import { installSpiderAi } from '../systems/ai/spider';
import { installBatAi } from '../systems/ai/bat';
import { installCyclopsAi } from '../systems/ai/cyclops';
import { installRatAi } from '../systems/ai/rat';

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
/** Outer lip so the scavenger cannot stand in the wall-top of a doorway. */
const OPENING_LIP = 4;

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
  if (entity.tags.includes('spider') && textures.exists('tex-spider')) return 'tex-spider';
  if (entity.tags.includes('bat') && textures.exists('tex-bat')) return 'tex-bat';
  if (entity.tags.includes('cyclops') && textures.exists('tex-cyclops')) return 'tex-cyclops';
  if (entity.tags.includes('rat') && textures.exists('tex-rat')) return 'tex-rat';
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

/** Centre a smaller arcade box so a 16px sprite can walk a 16px doorway. */
function insetBody(sprite: Phaser.Physics.Arcade.Sprite, size: number): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | null;
  if (!body) return;
  body.setSize(size, size, true);
}

/** Locked doors block the whole 3-tile mouth so you cannot walk around the gate. */
function sizeDoorBody(sprite: Phaser.Physics.Arcade.Sprite, entityId: string): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | null;
  if (!body) return;
  const dir = facingFromDoorId(entityId);
  const span = TILE * (EXIT_SPAN * 2 + 1);
  if (dir === 'up' || dir === 'down') body.setSize(span, TILE, true);
  else if (dir === 'left' || dir === 'right') body.setSize(TILE, span, true);
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
  private lips: Phaser.GameObjects.Rectangle[] = [];
  private loadedRoomId: string | null = null;
  private prev: GameState | null = null;
  private unsubStore: (() => void) | null = null;
  private unsubHydrate: (() => void) | null = null;
  private unsubDied: (() => void) | null = null;
  private unsubRoom: (() => void) | null = null;
  private unsubPlaying: (() => void) | null = null;
  private walkKey = 'player-walk';
  private teardownCombat: (() => void) | null = null;
  private teardownHpBars: (() => void) | null = null;
  private teardownProximity: (() => void) | null = null;
  private teardownFocus: (() => void) | null = null;
  private teardownMarks: (() => void) | null = null;
  private teardownSound: (() => void) | null = null;
  private teardownSlime: (() => void) | null = null;
  private teardownGhost: (() => void) | null = null;
  private teardownCrab: (() => void) | null = null;
  private teardownSpider: (() => void) | null = null;
  private teardownBat: (() => void) | null = null;
  private teardownCyclops: (() => void) | null = null;
  private teardownRat: (() => void) | null = null;
  private teardownHitboxes: (() => void) | null = null;
  private teardownHint: (() => void) | null = null;

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
    insetBody(this.player, ACTOR_BODY);
    this.physics.add.collider(this.player, this.walls);

    this.physics.world.setBounds(0, 0, WORLD, WORLD);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setSize(this.scale.gameSize.width, this.scale.gameSize.height);
    this.applyCamera();
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
    this.teardownHpBars = installHpBars(this);
    this.teardownProximity = installProximitySystem(this);
    this.teardownFocus = installFocusSystem(this);
    this.teardownMarks = installSessionMarks(this);
    this.teardownSound = installSoundSystem(this);
    this.teardownSlime = installSlimeAi(this);
    this.teardownGhost = installGhostAi(this);
    this.teardownCrab = installCrabAi(this);
    this.teardownSpider = installSpiderAi(this);
    this.teardownBat = installBatAi(this);
    this.teardownCyclops = installCyclopsAi(this);
    this.teardownRat = installRatAi(this);
    this.teardownHitboxes = installHitboxDebug(this);
    this.teardownHint = installInteractHint(this);

    this.unsubStore = gameStore.subscribe(() => {
      this.syncFromStore();
    });

    this.unsubHydrate = bus.on('sim:hydrated', () => {
      this.applyLook();
      this.loadRoom(world().player.roomId, true);
    });
    this.unsubPlaying = bus.on('menu:playing', ({ playing }) => {
      this.setMenuPlaying(playing);
    });
    this.unsubRoom = bus.on('sim:event', (event) => {
      if (event.type !== 'room_entered') return;
      if (event.roomId === this.loadedRoomId) return;
      setRoomWiping(true);
      wipeRoom(
        this,
        () => this.loadRoom(event.roomId, true),
        () => setRoomWiping(false),
      );
    });
    this.unsubDied = bus.on('sim:event', (event) => {
      if (event.type !== 'player_died') return;
      endKnockback(this.player);
      this.player.setVelocity(0, 0);
      this.haltWalk();
      this.player.setTint(DEAD_TINT);
      this.player.setAngle(90);
    });
    this.prev = world();
    this.events.once('shutdown', this.shutdown, this);
    bus.emit('world:ready', { sceneKey: 'Overworld' });
    this.applyLook();
    this.time.delayedCall(0, () => {
      if (!isPlaying()) this.setMenuPlaying(false);
    });
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
    this.applyCamera();
    this.physics.world.setBounds(0, 0, WORLD, WORLD);
    this.dimLayer.setSize(WORLD, WORLD);
    if (isPlaying()) playRoomMusic(this, room.kind);
    else stopRoomMusic();
  }

  update(): void {
    this.syncAnchor();
    if (isWorldInputBlocked()) {
      this.player.setVelocity(0, 0);
      this.haltWalk();
      return;
    }
    const knocked = tickKnockback(this.player, this.time.now);
    let away: Facing | null = null;
    if (!knocked) {
      const left = this.cursors.left.isDown || this.wasd.A.isDown;
      const right = this.cursors.right.isDown || this.wasd.D.isDown;
      const up = this.cursors.up.isDown || this.wasd.W.isDown;
      const down = this.cursors.down.isDown || this.wasd.S.isDown;
      let vx = 0;
      let vy = 0;
      if (left) {
        vx = -SPEED;
        away = 'left';
      } else if (right) {
        vx = SPEED;
        away = 'right';
      }
      if (up) {
        vy = -SPEED;
        away = away ?? 'up';
      } else if (down) {
        vy = SPEED;
        away = away ?? 'down';
      }
      this.player.setVelocity(vx, vy);
      if (away === 'left') this.player.setFlipX(true);
      if (away === 'right') this.player.setFlipX(false);
      const moving = vx !== 0 || vy !== 0;
      if (moving) requestSessionDismiss();
      if (moving) this.playWalk();
      else this.haltWalk();
      if (away) this.facing = away;
    } else {
      this.haltWalk();
    }
    const tx = Math.floor(this.player.x / TILE);
    const ty = Math.floor(this.player.y / TILE);
    if (tx !== this.lastTx || ty !== this.lastTy) {
      this.lastTx = tx;
      this.lastTy = ty;
      bus.emit('world:tile_entered', { tx, ty, facing: this.facing });
      this.tryPickup(tx, ty);
    }
    this.tryPassage(tx, ty, away);
  }

  private tryPassage(tx: number, ty: number, away: Facing | null): void {
    if (isWorldInputBlocked()) return;
    const dir = exitDirAt(tx, ty);
    if (!dir) return;
    if (away && away === OPPOSITE[dir]) return;
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
    if (!this.anims.exists(this.walkKey)) return;
    if (this.player.anims.currentAnim?.key === this.walkKey && this.player.anims.isPlaying) return;
    this.player.play(this.walkKey);
  }

  private haltWalk(): void {
    if (this.player.anims.isPlaying) this.player.anims.stop();
    const idle = lookTextureKey(world().player.appearance);
    const tex = this.textures.exists(idle) ? idle : 'tex-player';
    if (this.player.texture.key !== tex) this.player.setTexture(tex);
  }

  private applyLook(): void {
    this.walkKey = applyPlayerLook(this, this.player, world().player.appearance);
  }

  private setMenuPlaying(playing: boolean): void {
    this.applyLook();
    if (playing) {
      this.scene.resume('Overworld');
      const room = world().dungeon.rooms[world().player.roomId];
      if (room) playRoomMusic(this, room.kind);
      return;
    }
    this.player.setVelocity(0, 0);
    this.haltWalk();
    stopRoomMusic();
    playTitleMusic();
    this.scene.pause('Overworld');
  }

  private resetPlayer(): void {
    const start = world().player;
    this.facing = start.facing;
    this.lastTx = start.tx;
    this.lastTy = start.ty;
    this.player.setPosition(start.tx * TILE + 8, start.ty * TILE + 8);
    endKnockback(this.player);
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
    this.unsubPlaying?.();
    this.teardownCombat?.();
    this.teardownHpBars?.();
    this.teardownProximity?.();
    this.teardownFocus?.();
    this.teardownMarks?.();
    this.teardownSound?.();
    this.teardownSlime?.();
    this.teardownGhost?.();
    this.teardownCrab?.();
    this.teardownSpider?.();
    this.teardownBat?.();
    this.teardownCyclops?.();
    this.teardownRat?.();
    this.teardownHitboxes?.();
    this.teardownHint?.();
    this.scale.off('resize', this.onResize, this);
    this.prev = null;
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.applyCamera();
  }

  private applyCamera(): void {
    applyRoomCamera(this, this.player);
  }

  private clearDecor(): void {
    for (const child of [...this.floorLayer.list]) child.destroy();
    this.walls.clear(true, true);
    for (const lip of this.lips) lip.destroy();
    this.lips = [];
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
      const foe = entity.kind === 'enemy' || entity.kind === 'elite';
      insetBody(sprite, foe ? ACTOR_BODY : PROP_BODY);
      if (entity.tags.includes('crab')) {
        sprite.setScale(CRAB_SCALE).setAlpha(0).setDepth(12);
        insetBody(sprite, CRAB_BODY);
        body.enable = false;
      }
      if (entity.kind === 'door') sizeDoorBody(sprite, entity.id);
      if (entity.tags.includes('pickup')) {
        body.checkCollision.none = true;
      } else if (entity.tags.includes('bat')) {
        body.checkCollision.none = true;
      } else {
        this.physics.add.collider(this.player, sprite);
      }
      if (
        entity.tags.includes('slime') ||
        entity.tags.includes('crab') ||
        entity.tags.includes('cyclops') ||
        entity.tags.includes('rat') ||
        entity.tags.includes('spider')
      ) {
        this.physics.add.collider(sprite, this.walls);
        body.setImmovable(false);
      }
      if (entity.tags.includes('spider')) {
        body.enable = false;
        sprite.setAlpha(0);
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
    const visualHoles = new Set<string>();
    const walkHoles = new Set<string>();
    for (const dir of ALL_FACINGS) {
      if (!room.exits[dir]) continue;
      const e = EXIT_TILE[dir];
      visualHoles.add(`${e.tx},${e.ty}`);
      for (const cell of exitMouthCells(dir)) walkHoles.add(`${cell.tx},${cell.ty}`);
    }
    for (let tx = 0; tx < ROOM_SIZE; tx++) {
      this.placePerimeterWall(tx, 0, visualHoles, walkHoles);
      this.placePerimeterWall(tx, ROOM_SIZE - 1, visualHoles, walkHoles);
    }
    for (let ty = 1; ty < ROOM_SIZE - 1; ty++) {
      this.placePerimeterWall(0, ty, visualHoles, walkHoles);
      this.placePerimeterWall(ROOM_SIZE - 1, ty, visualHoles, walkHoles);
    }
    this.placeOpeningLips(room);
  }

  private placeOpeningLips(room: Room): void {
    for (const dir of ALL_FACINGS) {
      if (!room.exits[dir]) continue;
      const cells = exitMouthCells(dir);
      if (cells.length === 0) continue;
      const minTx = Math.min(...cells.map((c) => c.tx));
      const maxTx = Math.max(...cells.map((c) => c.tx));
      const minTy = Math.min(...cells.map((c) => c.ty));
      const maxTy = Math.max(...cells.map((c) => c.ty));
      const left = minTx * TILE;
      const top = minTy * TILE;
      const spanX = (maxTx - minTx + 1) * TILE;
      const spanY = (maxTy - minTy + 1) * TILE;
      let cx: number;
      let cy: number;
      let w: number;
      let h: number;
      if (dir === 'up') {
        cx = left + spanX / 2;
        cy = OPENING_LIP / 2;
        w = spanX;
        h = OPENING_LIP;
      } else if (dir === 'down') {
        cx = left + spanX / 2;
        cy = WORLD - OPENING_LIP / 2;
        w = spanX;
        h = OPENING_LIP;
      } else if (dir === 'left') {
        cx = OPENING_LIP / 2;
        cy = top + spanY / 2;
        w = OPENING_LIP;
        h = spanY;
      } else {
        cx = WORLD - OPENING_LIP / 2;
        cy = top + spanY / 2;
        w = OPENING_LIP;
        h = spanY;
      }
      const lip = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
      this.physics.add.existing(lip, true);
      this.physics.add.collider(this.player, lip);
      this.lips.push(lip);
    }
  }

  private placePerimeterWall(
    tx: number,
    ty: number,
    visualHoles: Set<string>,
    walkHoles: Set<string>,
  ): void {
    const key = `${tx},${ty}`;
    if (visualHoles.has(key)) return;
    const texture = wallTexture(tx, ty, this);
    const x = tx * TILE + 8;
    const y = ty * TILE + 8;
    if (walkHoles.has(key)) {
      // Same art as the rest of the wall, but no body — the locked door's
      // 3-tile box (or the opening lips on an unlocked exit) is the collider.
      const wall = this.walls.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
      const body = wall.body as Phaser.Physics.Arcade.StaticBody | null;
      if (body) {
        body.enable = false;
        body.checkCollision.none = true;
      }
      return;
    }
    const wall = this.walls.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
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
