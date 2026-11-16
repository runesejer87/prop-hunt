import Phaser from "phaser";
import { Client, Callbacks, type Room } from "@colyseus/sdk";
import {
  ROOM_NAME,
  SERVER_PORT,
  MSG_INPUT,
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

  constructor() {
    super("GameScene");
  }

  create() {
    this.drawMap();
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;

    this.status = this.add.text(12, 12, "Connecting…", { color: "#fff" }).setScrollFactor(0).setDepth(100);
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

  private async connect() {
    try {
      // Hosted builds set VITE_SERVER_URL; local dev uses the server on port 2567.
      const serverUrl = import.meta.env.VITE_SERVER_URL || `ws://${location.hostname}:${SERVER_PORT}`;
      const client = new Client(serverUrl);
      this.room = await client.joinOrCreate<GameState>(ROOM_NAME, {}, GameState);
      this.status.setText("Connected — move with WASD / arrow keys");

      const callbacks = Callbacks.get(this.room);
      callbacks.onAdd("players", (p: PlayerState, id: string) => this.addPlayer(p, id));
      callbacks.onRemove("players", (_p: PlayerState, id: string) => {
        this.sprites.get(id)?.destroy();
        this.sprites.delete(id);
      });
      this.room.onLeave(() => this.status.setText("Disconnected"));
    } catch (err) {
      console.error(err);
      this.status.setText(`Could not connect to server: ${(err as Error)?.message ?? err}`);
    }
  }

  private addPlayer(p: PlayerState, id: string) {
    const isMe = id === this.room?.sessionId;
    const dot = this.add.circle(p.x, p.y, PLAYER_RADIUS, isMe ? 0x4ade80 : 0xf59e0b);
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
  }
}
