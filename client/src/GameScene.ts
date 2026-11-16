import Phaser from "phaser";
import { Client, Callbacks, type Room } from "@colyseus/sdk";
import { Fog } from "./Fog.ts";
import { Hud } from "./Hud.ts";
import {
  ROOM_NAME,
  SERVER_PORT,
  MSG_INPUT,
  MSG_DISGUISE,
  MSG_UNDISGUISE,
  MSG_ATTACK,
  MSG_SWING,
  type SwingEvent,
  ATTACK_RANGE,
  VISION_RADIUS,
  PROP_TYPES,
  PLACED_PROPS,
  nearestDisguisableProp,
  type PropType,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TILE,
  ROOMS,
  isWallTile,
  MAP_COLS,
  MAP_ROWS,
  moveWithCollision,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  GameState,
  type PlayerState,
} from "@prop-hunt/shared";

export class GameScene extends Phaser.Scene {
  private room?: Room<any, GameState>;
  private sprites = new Map<string, Phaser.GameObjects.Arc>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private lastInput = { dx: 0, dy: 0 };
  private hud!: Hud;
  private fog!: Fog;
  private connected = false;
  private styleOf = new Map<string, string>();
  private reticle!: Phaser.GameObjects.Graphics;
  private hunterRing!: Phaser.GameObjects.Arc;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private skins = new Map<string, Phaser.GameObjects.Image>();
  private selfRing?: Phaser.GameObjects.Arc;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("GameScene");
  }

  create() {
    this.makePropTextures();
    this.drawMap();
    this.placeProps();
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;
    this.keyE = this.input.keyboard!.addKey("E");
    this.keyQ = this.input.keyboard!.addKey("Q");

    this.keySpace = this.input.keyboard!.addKey("SPACE");
    this.hud = new Hud(this);
    this.fog = new Fog(this, WORLD_WIDTH, WORLD_HEIGHT);
    this.reticle = this.add.graphics().setDepth(60);
    // Props can see roughly what the hunter can see.
    this.hunterRing = this.add.circle(0, 0, VISION_RADIUS).setStrokeStyle(2, 0xef4444, 0.5).setDepth(3).setVisible(false);
    this.input.on("pointerdown", () => this.swing());
    void this.connect();
  }

  /** Draw floors, walls and room names once. */
  private drawMap() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x15171c).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    for (const room of ROOMS) {
      g.fillStyle(room.color).fillRect(room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE);
    }
    // Doorways and corridors are floor tiles outside any room: give them a neutral colour.
    g.fillStyle(0x3a3a40);
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (isWallTile(col, row)) continue;
        const inRoom = ROOMS.some((r) => col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h);
        if (!inRoom) g.fillRect(col * TILE, row * TILE, TILE, TILE);
      }
    }

    // Subtle floor grid
    g.lineStyle(1, 0x000000, 0.12);
    for (let col = 0; col <= MAP_COLS; col++) g.lineBetween(col * TILE, 0, col * TILE, WORLD_HEIGHT);
    for (let row = 0; row <= MAP_ROWS; row++) g.lineBetween(0, row * TILE, WORLD_WIDTH, row * TILE);

    // Walls: only draw ones touching a floor tile, with a lighter edge.
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (!isWallTile(col, row)) continue;
        const nearFloor = [-1, 0, 1].some((dj) => [-1, 0, 1].some((di) => !isWallTile(col + di, row + dj)));
        if (!nearFloor) continue;
        g.fillStyle(0x23252c).fillRect(col * TILE, row * TILE, TILE, TILE);
        g.fillStyle(0x5a5f6b).fillRect(col * TILE, row * TILE, TILE, 3);
      }
    }

    for (const room of ROOMS) {
      this.add
        .text((room.x + room.w / 2) * TILE, (room.y + 0.6) * TILE, room.name.toUpperCase(), {
          fontFamily: "sans-serif",
          fontSize: "14px",
          color: "#ffffff",
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.35)
        .setDepth(1);
    }
  }

  /** Draw each prop type once into a texture; sprites reuse it (cheap for the GPU). */
  private makePropTextures() {
    for (const pt of Object.values(PROP_TYPES)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      this.paintProp(g, pt);
      g.generateTexture(`prop_${pt.id}`, pt.w, pt.h);
      g.destroy();
    }
  }

  private paintProp(g: Phaser.GameObjects.Graphics, pt: PropType) {
    const { w, h } = pt;
    if (pt.shape === "circle") {
      g.fillStyle(pt.accent).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(pt.color).fillCircle(w / 2, h / 2, w / 2 - 2);
    } else {
      g.fillStyle(pt.accent).fillRoundedRect(0, 0, w, h, 4);
      g.fillStyle(pt.color).fillRoundedRect(2, 2, w - 4, h - 4, 3);
    }
    const dark = pt.accent;
    switch (pt.detail) {
      case "cross":
        g.lineStyle(2, dark).lineBetween(4, 4, w - 4, h - 4).lineBetween(w - 4, 4, 4, h - 4);
        break;
      case "back":
        g.fillStyle(dark).fillRoundedRect(3, 3, w - 6, Math.max(5, h * 0.22), 2);
        break;
      case "leaves":
        g.fillStyle(dark);
        for (let a = 0; a < 6; a++) g.fillCircle(w / 2 + Math.cos(a * 1.05) * w * 0.22, h / 2 + Math.sin(a * 1.05) * h * 0.22, w * 0.16);
        g.fillStyle(0x5cb85c).fillCircle(w / 2, h / 2, w * 0.14);
        break;
      case "shade":
        g.fillStyle(0xfff4c0).fillCircle(w / 2, h / 2, w * 0.28);
        break;
      case "pillow":
        g.fillStyle(0xe8ecf4).fillRoundedRect(w * 0.12, 6, w * 0.34, 18, 4).fillRoundedRect(w * 0.54, 6, w * 0.34, 18, 4);
        break;
      case "lines":
        g.lineStyle(2, dark);
        for (let y = 7; y < h - 3; y += 8) g.lineBetween(5, y, w - 5, y);
        break;
      case "globe":
        g.lineStyle(1.5, 0xcfe6f5).strokeCircle(w / 2, h / 2, w * 0.28).lineBetween(w * 0.2, h / 2, w * 0.8, h / 2);
        break;
      case "bowl":
        g.fillStyle(dark).fillCircle(w / 2, h / 2, Math.min(w, h) * 0.28);
        break;
      default:
        break;
    }
  }

  private placeProps() {
    for (const p of PLACED_PROPS) this.add.image(p.x, p.y, `prop_${p.type}`).setDepth(2);
  }

  /** Show a player as a prop (or as a plain dot when `typeId` is empty). */
  private setSkin(id: string, typeId: string) {
    const dot = this.sprites.get(id);
    if (!dot) return;
    const isMe = id === this.room?.sessionId;
    this.skins.get(id)?.destroy();
    this.skins.delete(id);
    const pt = typeId ? PROP_TYPES[typeId] : undefined;
    dot.setVisible(!pt);
    if (isMe) {
      this.selfRing?.destroy();
      this.selfRing = undefined;
    }
    if (!pt) return;
    this.skins.set(id, this.add.image(dot.x, dot.y, `prop_${pt.id}`).setDepth(5));
    if (isMe) {
      // A thin green ring so you can still find yourself among the lookalikes.
      this.selfRing = this.add.circle(dot.x, dot.y, Math.max(pt.w, pt.h) / 2 + 5).setStrokeStyle(2, 0x4ade80).setDepth(4);
    }
  }

  private async connect() {
    try {
      // Hosted builds set VITE_SERVER_URL; local dev uses the server on port 2567.
      const serverUrl = import.meta.env.VITE_SERVER_URL || `ws://${location.hostname}:${SERVER_PORT}`;
      const client = new Client(serverUrl);
      this.room = await client.joinOrCreate<GameState>(ROOM_NAME, {}, GameState);
      this.connected = true;

      const callbacks = Callbacks.get(this.room);
      callbacks.onAdd("players", (p: PlayerState, id: string) => {
        this.addPlayer(p, id);
        callbacks.listen(p, "disguise", (typeId: string) => this.setSkin(id, typeId));
      });
      callbacks.onRemove("players", (_p: PlayerState, id: string) => {
        this.sprites.get(id)?.destroy();
        this.sprites.delete(id);
        this.skins.get(id)?.destroy();
        this.skins.delete(id);
        this.styleOf.delete(id);
        if (id === this.room?.sessionId) this.selfRing?.destroy();
      });
      this.room.onMessage(MSG_SWING, (e: SwingEvent) => this.showSwing(e));
      this.room.onLeave(() => {
        this.connected = false;
      });
    } catch (err) {
      console.error(err);
      this.hud.update({ connected: true, phase: "", timeLeft: 0, winner: "", role: "", alive: true, hp: 0, playerCount: 0, propsLeft: 0 });
      this.add.text(12, 12, `Could not connect to server: ${(err as Error)?.message ?? err}`, { color: "#fff" }).setScrollFactor(0).setDepth(100);
    }
  }

  private addPlayer(p: PlayerState, id: string) {
    const isMe = id === this.room?.sessionId;
    const dot = this.add.circle(p.x, p.y, PLAYER_RADIUS, isMe ? 0x4ade80 : 0xf59e0b).setDepth(5);
    this.sprites.set(id, dot);
    if (isMe) this.cameras.main.startFollow(dot, true, 0.15, 0.15);
  }

  // ------------------------------------------------------------- hunter

  private get me(): PlayerState | undefined {
    return this.room?.state.players.get(this.room.sessionId);
  }

  private canSwing(): boolean {
    const me = this.me;
    return !!this.room && !!me && me.role === "hunter" && this.room.state.phase === "hunt";
  }

  private swing() {
    if (!this.canSwing()) return;
    const ptr = this.input.activePointer;
    this.room!.send(MSG_ATTACK, { x: ptr.worldX, y: ptr.worldY });
  }

  /** A quick ring and message where a swing landed. */
  private showSwing(e: SwingEvent) {
    const color = e.result === "player" ? 0x4ade80 : e.result === "prop" ? 0xef4444 : 0xaaaaaa;
    const ring = this.add.circle(e.x, e.y, 8).setStrokeStyle(3, color).setDepth(70);
    this.tweens.add({ targets: ring, radius: 30, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    if (e.result === "nothing") return;
    const label = this.add
      .text(e.x, e.y - 20, e.result === "player" ? "FOUND!" : "Just an object", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: e.result === "player" ? "#9dffa8" : "#ff8a8a",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(70);
    this.tweens.add({ targets: label, y: label.y - 26, alpha: 0, duration: 900, onComplete: () => label.destroy() });
  }

  // ------------------------------------------------------------- frame

  /** Colour, visibility and transparency of each player's dot / disguise. */
  private styleAndVisibility(id: string, p: PlayerState, dot: Phaser.GameObjects.Arc, myRole: string) {
    const isMe = id === this.room!.sessionId;
    const ghost = !p.alive || p.role === "spectator";
    const key = `${p.role}|${ghost}|${isMe}`;
    if (this.styleOf.get(id) !== key) {
      this.styleOf.set(id, key);
      const color = p.role === "hunter" ? 0xef4444 : isMe ? 0x4ade80 : 0xf59e0b;
      dot.setFillStyle(color, ghost ? 0.35 : 1);
    }
    // The hunter never sees ghosts; everyone else sees them faintly.
    const hidden = ghost && myRole === "hunter";
    const skin = this.skins.get(id);
    dot.setVisible(!skin && !hidden);
    skin?.setVisible(!hidden).setAlpha(ghost ? 0.35 : 1);
  }

  update(_time: number, delta: number) {
    const room = this.room;
    const state = room?.state;
    const me = this.me;
    if (!room || !state || !me) {
      this.hud.update({ connected: this.connected || !room, phase: "", timeLeft: 0, winner: "", role: "", alive: true, hp: 0, playerCount: 0, propsLeft: 0 });
      return;
    }
    const phase = state.phase;
    const myDot = this.sprites.get(room.sessionId);
    const iAmHunter = me.role === "hunter";
    const frozen = iAmHunter && phase === "hide";

    // Send input only when it changes.
    const dx = frozen ? 0 : (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0);
    const dy = frozen ? 0 : (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0);
    if (dx !== this.lastInput.dx || dy !== this.lastInput.dy) {
      this.lastInput = { dx, dy };
      room.send(MSG_INPUT, { dx, dy });
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyE)) room.send(MSG_DISGUISE);
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) room.send(MSG_UNDISGUISE);
    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) this.swing();

    state.players.forEach((p: PlayerState, id: string) => {
      const dot = this.sprites.get(id);
      if (!dot) return;
      this.styleAndVisibility(id, p, dot, me.role);

      if (id !== room.sessionId) {
        // Other players: glide toward the latest server position.
        dot.x = Phaser.Math.Linear(dot.x, p.x, 0.3);
        dot.y = Phaser.Math.Linear(dot.y, p.y, 0.3);
        return;
      }

      // Me: move instantly with the same rules as the server (prediction),
      // so the game feels responsive even when the connection is slow.
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        const step = (PLAYER_SPEED * delta) / 1000;
        const next = moveWithCollision(dot.x, dot.y, (dx / len) * step, (dy / len) * step, PLAYER_RADIUS);
        dot.setPosition(next.x, next.y);
      }

      // Correct drift toward the server's version of events.
      const err = Math.hypot(p.x - dot.x, p.y - dot.y);
      if (err > 120) {
        dot.setPosition(p.x, p.y); // far off: snap
      } else if (dx === 0 && dy === 0) {
        dot.x = Phaser.Math.Linear(dot.x, p.x, 0.2); // standing still: settle
        dot.y = Phaser.Math.Linear(dot.y, p.y, 0.2);
      }
    });

    // Disguise sprites and the self ring follow their player's dot.
    this.skins.forEach((img, id) => {
      const d = this.sprites.get(id);
      if (d) img.setPosition(d.x, d.y);
    });
    if (myDot) this.selfRing?.setPosition(myDot.x, myDot.y).setVisible(me.alive);

    // Hunter: limited vision, plus an aiming marker.
    this.reticle.clear();
    if (iAmHunter && myDot && (phase === "hide" || phase === "hunt")) {
      if (phase === "hide") this.fog.blind();
      else this.fog.see(myDot.x, myDot.y);
      if (phase === "hunt") {
        const ptr = this.input.activePointer;
        const d = Math.hypot(ptr.worldX - myDot.x, ptr.worldY - myDot.y) || 1;
        const k = Math.min(1, ATTACK_RANGE / d);
        const ax = myDot.x + (ptr.worldX - myDot.x) * k;
        const ay = myDot.y + (ptr.worldY - myDot.y) * k;
        this.reticle.lineStyle(1, 0xffffff, 0.25).strokeCircle(myDot.x, myDot.y, ATTACK_RANGE);
        this.reticle.lineStyle(2, 0xffffff, 0.9).strokeCircle(ax, ay, 9).lineBetween(ax - 13, ay, ax + 13, ay).lineBetween(ax, ay - 13, ax, ay + 13);
      }
    } else {
      this.fog.hide();
    }

    // Everyone else can see roughly where the hunter can see.
    let hunterDot: Phaser.GameObjects.Arc | undefined;
    let propsLeft = 0;
    let playerCount = 0;
    state.players.forEach((p: PlayerState, id: string) => {
      playerCount++;
      if (p.role === "hunter") hunterDot = this.sprites.get(id);
      if (p.role === "prop" && p.alive) propsLeft++;
    });
    const showRing = !iAmHunter && !!hunterDot && (phase === "hide" || phase === "hunt");
    this.hunterRing.setVisible(showRing);
    if (showRing && hunterDot) this.hunterRing.setPosition(hunterDot.x, hunterDot.y);

    // Prompt to copy a nearby object (props only).
    let prompt: string | null = null;
    if (myDot && me.role === "prop" && me.alive && phase !== "end") {
      const near = nearestDisguisableProp(myDot.x, myDot.y);
      if (near && near.type !== me.disguise) prompt = `E: become ${PROP_TYPES[near.type]!.name}`;
    }
    this.hud.setPrompt(prompt);

    this.hud.update({
      connected: true,
      phase,
      timeLeft: state.timeLeft,
      winner: state.winner,
      role: me.role,
      alive: me.alive,
      hp: me.hp,
      playerCount,
      propsLeft,
    });
  }
}
