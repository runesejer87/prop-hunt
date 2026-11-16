import { schema, t, type SchemaType } from "@colyseus/schema";

export * from "./map.ts";
export * from "./props.ts";
export * from "./collision.ts";
export * from "./vision.ts";

/** Name used when joining the game room. */
export const ROOM_NAME = "prop_hunt";
export const SERVER_PORT = 2567;

/** 2–4 players per game. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** Server simulation rate (updates per second). */
export const TICK_RATE = 30;

/** Movement speed in pixels per second. */
export const PROP_SPEED = 170;
/** The hunter is faster than props, so running away does not work for long. */
export const HUNTER_SPEED = 215;
/** A disguised prop that moves can only shuffle along. Hiding beats running. */
export const DISGUISED_SPEED = 55;
export const PLAYER_SPEED = PROP_SPEED;

/** How fast a player moves, given their role and whether they are disguised. */
export function moveSpeed(role: string, disguised: boolean): number {
  if (role === "hunter") return HUNTER_SPEED;
  return disguised ? DISGUISED_SPEED : PROP_SPEED;
}

/** A prop that keeps moving gives away roughly where it is every few seconds. */
export const PING_INTERVAL = 2.5;
/** How far (pixels) the revealed spot can be from the prop's real position. */
export const PING_JITTER = 50;
export const PLAYER_RADIUS = 14;

/** "spectator" = joined mid-round, watches until the next round. */
export type Role = "prop" | "hunter" | "spectator";
export type Phase = "lobby" | "hide" | "hunt" | "end";

/** Round timing, in seconds. */
export const LOBBY_COUNTDOWN = 5;
export const HIDE_TIME = 15;
export const HUNT_TIME = 180;
export const END_TIME = 10;

/** Props: stand still this long while disguised to become a perfect copy (no wobble). */
export const SETTLE_TIME = 1.0;

/** Points. Hunter: per prop found, plus a bonus for finding all. Props: for surviving the round. */
export const POINTS_PER_FIND = 2;
export const POINTS_FOUND_ALL_BONUS = 2;
export const POINTS_SURVIVE = 3;
export const MAX_NAME_LENGTH = 14;

/** Hunter rules. */
export const HUNTER_MAX_HP = 100;
/** Health lost when the hunter hits something that is not a player. */
export const WRONG_HIT_PENALTY = 10;
/** How far from the hunter a swing can land, in pixels. */
export const ATTACK_RANGE = 64;
export const ATTACK_COOLDOWN = 0.5;
/** How far the hunter can see, in pixels. Fully dark at this distance. */
export const VISION_RADIUS = 200;

/** Public facts about a player. Every client receives these for everyone. */
export const PlayerState = schema(
  {
    id: t.string(),
    name: t.string(),
    role: t.string(),
    /** False once the hunter has found you (you become a ghost). */
    alive: t.boolean(),
    /** Hunter health. Props ignore this. */
    hp: t.number(),
    /** Total points over all rounds. */
    score: t.number(),
    /** Points earned in the round that just ended (shown on the results screen). */
    gain: t.number(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

/**
 * Where a player is and what they look like. The server only sends a body to a
 * client that is allowed to see it (the hunter only gets bodies in line of sight).
 */
export const BodyState = schema(
  {
    x: t.number(),
    y: t.number(),
    /** Id of the prop this player is disguised as, or "" when not disguised. */
    disguise: t.string(),
    /** Quarter turns of the disguise (0-3), copied from the object and changeable with R. */
    rot: t.number(),
    /** Disguised and standing still long enough: a perfect copy that does not wobble. */
    settled: t.boolean(),
  },
  "BodyState",
);
export type BodyState = SchemaType<typeof BodyState>;

export const GameState = schema(
  {
    players: t.map(PlayerState),
    /** Filtered per client (see PropHuntRoom): you only get the bodies you may see. */
    bodies: t.map(BodyState).view(),
    phase: t.string(),
    /** Seconds left in the current phase (whole seconds). */
    timeLeft: t.number(),
    /** "props" or "hunter" once a round is over, otherwise "". */
    winner: t.string(),
    /** How many rounds have started so far. */
    round: t.number(),
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
/** Turn your disguise a quarter turn, to match how nearby objects face. */
export const MSG_ROTATE = "rotate";

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

/** Server tells the hunter roughly where a moving prop is: { x, y }. */
export const MSG_PING = "ping";
