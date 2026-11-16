import { Room, type Client } from "colyseus";
import {
  GameState,
  PlayerState,
  InputMessage,
  MSG_INPUT,
  MSG_DISGUISE,
  MSG_UNDISGUISE,
  PROP_TYPES,
  nearestDisguisableProp,
  isBlocked,
  MAX_PLAYERS,
  TICK_RATE,
  PLAYER_SPEED,
  PLAYER_RADIUS,
  ROOMS,
  TILE,
  roomCenter,
  moveWithCollision,
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
    [MSG_DISGUISE]: (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const prop = nearestDisguisableProp(player.x, player.y);
      if (prop && PROP_TYPES[prop.type]) player.disguise = prop.type;
    },
    [MSG_UNDISGUISE]: (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.disguise = "";
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
    player.disguise = "";
    // Start in a random room, on a spot that isn't inside a wall or prop.
    const room = ROOMS[Math.floor(Math.random() * ROOMS.length)]!;
    const c = roomCenter(room);
    player.x = c.x;
    player.y = c.y;
    for (let i = 0; i < 200; i++) {
      const x = room.x * TILE + (1 + Math.random() * (room.w - 2)) * TILE;
      const y = room.y * TILE + (1 + Math.random() * (room.h - 2)) * TILE;
      if (!isBlocked(x, y, PLAYER_RADIUS + 2)) {
        player.x = x;
        player.y = y;
        break;
      }
    }
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
      const step = PLAYER_SPEED * dt;
      const next = moveWithCollision(player.x, player.y, (input.dx / len) * step, (input.dy / len) * step, PLAYER_RADIUS);
      player.x = next.x;
      player.y = next.y;
    });
  }
}
