import Phaser from "phaser";
import { Client, Callbacks, type Room } from "@colyseus/sdk";
import {
  ROOM_NAME,
  SERVER_PORT,
  MSG_INPUT,
  MSG_DISGUISE,
  MSG_UNDISGUISE,
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
  private status!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
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

    this.status = this.add.text(12, 12, "Connecting…", { color: "#fff" }).setScrollFactor(0).setDepth(100);
    this.prompt = this.add
      .text(0, 0, "", { fontFamily: "sans-serif", fontSize: "18px", color: "#fff", backgroundColor: "#000000a0", padding: { x: 10, y: 6 } })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
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
      this.status.setText("WASD / arrows: move   E: become nearby object   Q: back to normal");

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
        if (id === this.room?.sessionId) this.selfRing?.destroy();
      });
      this.room.onLeave(() => this.status.setText("Disconnected"));
    } catch (err) {
      console.error(err);
      this.status.setText(`Could not connect to server: ${(err as Error)?.message ?? err}`);
    }
  }

  private addPlayer(p: PlayerState, id: string) {
    const isMe = id === this.room?.sessionId;
    const dot = this.add.circle(p.x, p.y, PLAYER_RADIUS, isMe ? 0x4ade80 : 0xf59e0b).setDepth(5);
    this.sprites.set(id, dot);
    if (isMe) this.cameras.main.startFollow(dot, true, 0.15, 0.15);
  }

  update(_time: number, delta: number) {
    if (!this.room) return;

    // Send input only when it changes.
    const dx = (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0);
    const dy = (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0);
    if (dx !== this.lastInput.dx || dy !== this.lastInput.dy) {
      this.lastInput = { dx, dy };
      this.room.send(MSG_INPUT, { dx, dy });
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.room.send(MSG_DISGUISE);
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) this.room.send(MSG_UNDISGUISE);

    this.room.state.players.forEach((p: PlayerState, id: string) => {
      const dot = this.sprites.get(id);
      if (!dot) return;

      if (id !== this.room!.sessionId) {
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
    const myDot = this.sprites.get(this.room.sessionId);
    if (myDot) {
      this.selfRing?.setPosition(myDot.x, myDot.y);
      // Hint when there is something to copy nearby.
      const near = nearestDisguisableProp(myDot.x, myDot.y);
      const current = this.room.state.players.get(this.room.sessionId)?.disguise;
      if (near && near.type !== current) {
        this.prompt.setText(`E: become ${PROP_TYPES[near.type]!.name}`).setVisible(true);
        this.prompt.setPosition(this.scale.width / 2, this.scale.height - 24);
      } else {
        this.prompt.setVisible(false);
      }
    }
  }
}
