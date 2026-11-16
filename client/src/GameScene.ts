import Phaser from "phaser";
import { Client, Callbacks, type Room } from "@colyseus/sdk";
import {
  ROOM_NAME,
  SERVER_PORT,
  MSG_INPUT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_RADIUS,
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
    this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x2a2e38).setOrigin(0);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;

    this.status = this.add.text(12, 12, "Connecting…", { color: "#fff" }).setScrollFactor(0).setDepth(100);
    void this.connect();
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

  update() {
    if (!this.room) return;

    // Send input only when it changes.
    const dx = (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0);
    const dy = (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0);
    if (dx !== this.lastInput.dx || dy !== this.lastInput.dy) {
      this.lastInput = { dx, dy };
      this.room.send(MSG_INPUT, { dx, dy });
    }

    // Smoothly move each dot toward the server position.
    this.room.state.players.forEach((p: PlayerState, id: string) => {
      const dot = this.sprites.get(id);
      if (dot) {
        dot.x = Phaser.Math.Linear(dot.x, p.x, 0.3);
        dot.y = Phaser.Math.Linear(dot.y, p.y, 0.3);
      }
    });
  }
}
