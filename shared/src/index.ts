import { schema, t, type SchemaType } from "@colyseus/schema";

/** Name used when joining the game room. */
export const ROOM_NAME = "prop_hunt";
export const SERVER_PORT = 2567;

/** 2–4 players per game. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** Server simulation rate (updates per second). */
export const TICK_RATE = 30;

/** World size in pixels (placeholder until the real room map exists). */
export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 1200;

/** Movement speed in pixels per second. */
export const PLAYER_SPEED = 180;
export const PLAYER_RADIUS = 14;

export type Role = "prop" | "hunter";

export const PlayerState = schema(
  {
    id: t.string(),
    name: t.string(),
    role: t.string(),
    x: t.number(),
    y: t.number(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const GameState = schema(
  {
    players: t.map(PlayerState),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;

/** Messages the client sends to the server. */
export interface InputMessage {
  /** Direction on each axis: -1, 0 or 1. */
  dx: number;
  dy: number;
}
export const MSG_INPUT = "input";
