import { Room, type Client } from "colyseus";
import {
  GameState,
  PlayerState,
  InputMessage,
  MSG_INPUT,
  MAX_PLAYERS,
  TICK_RATE,
  PLAYER_SPEED,
  PLAYER_RADIUS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "@prop-hunt/shared";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class PropHuntRoom extends Room<{ state: GameState }> {
  maxClients = MAX_PLAYERS;
  state = new GameState();

  /** Latest input per player; the server decides the real movement. */
  private moveInputs = new Map<string, InputMessage>();

  messages = {
    [MSG_INPUT]: (client: Client, msg: InputMessage) => {
      this.moveInputs.set(client.sessionId, {
        dx: clamp(Math.sign(Number(msg?.dx) || 0), -1, 1),
        dy: clamp(Math.sign(Number(msg?.dy) || 0), -1, 1),
      });
    },
  };

  onCreate() {
    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), 1000 / TICK_RATE);
  }

  onJoin(client: Client) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = `Player ${this.clients.length}`;
    player.role = "prop";
    player.x = WORLD_WIDTH / 2 + (Math.random() - 0.5) * 200;
    player.y = WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 200;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
  }

  private update(dt: number) {
    this.state.players.forEach((player, id) => {
      const input = this.moveInputs.get(id);
      if (!input || (input.dx === 0 && input.dy === 0)) return;
      // Normalise so diagonal movement isn't faster.
      const len = Math.hypot(input.dx, input.dy);
      player.x = clamp(player.x + (input.dx / len) * PLAYER_SPEED * dt, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
      player.y = clamp(player.y + (input.dy / len) * PLAYER_SPEED * dt, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);
    });
  }
}
