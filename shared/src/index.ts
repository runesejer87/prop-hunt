import { schema, t, type SchemaType } from "@colyseus/schema";

export * from "./map.ts";
export * from "./props.ts";
export * from "./collision.ts";

/** Name used when joining the game room. */
export const ROOM_NAME = "prop_hunt";
export const SERVER_PORT = 2567;

/** 2–4 players per game. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** Server simulation rate (updates per second). */
export const TICK_RATE = 30;

/** Movement speed in pixels per second. */
export const PLAYER_SPEED = 180;
export const PLAYER_RADIUS = 14;

/** "spectator" = joined mid-round, watches until the next round. */
export type Role = "prop" | "hunter" | "spectator";
export type Phase = "lobby" | "hide" | "hunt" | "end";

/** Round timing, in seconds. */
export const LOBBY_COUNTDOWN = 5;
export const HIDE_TIME = 15;
export const HUNT_TIME = 180;
export const END_TIME = 7;

/** Hunter rules. */
export const HUNTER_MAX_HP = 100;
/** Health lost when the hunter hits something that is not a player. */
export const WRONG_HIT_PENALTY = 10;
/** How far from the hunter a swing can land, in pixels. */
export const ATTACK_RANGE = 64;
export const ATTACK_COOLDOWN = 0.5;
/** How far the hunter can see, in pixels. */
export const VISION_RADIUS = 170;

export const PlayerState = schema(
  {
    id: t.string(),
    name: t.string(),
    role: t.string(),
    x: t.number(),
    y: t.number(),
    /** Id of the prop this player is disguised as, or "" when not disguised. */
    disguise: t.string(),
    /** False once the hunter has found you (you become a ghost). */
    alive: t.boolean(),
    /** Hunter health. Props ignore this. */
    hp: t.number(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const GameState = schema(
  {
    players: t.map(PlayerState),
    phase: t.string(),
    /** Seconds left in the current phase (whole seconds). */
    timeLeft: t.number(),
    /** "props" or "hunter" once a round is over, otherwise "". */
    winner: t.string(),
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

/** Become the nearest prop in range. */
export const MSG_DISGUISE = "disguise";
/** Go back to normal. */
export const MSG_UNDISGUISE = "undisguise";

/** Hunter swings at a point in the world: { x, y }. */
export const MSG_ATTACK = "attack";
/** Server tells everyone about a swing, for the on-screen effect. */
export const MSG_SWING = "swing";
export interface AttackMessage {
  x: number;
  y: number;
}
export interface SwingEvent {
  x: number;
  y: number;
  /** What it landed on. */
  result: "player" | "prop" | "nothing";
}
