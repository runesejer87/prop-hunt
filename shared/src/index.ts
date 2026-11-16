import { schema, t, type SchemaType } from "@colyseus/schema";

export * from "./mapdef.ts";
export * from "./props.ts";
export * from "./gamemap.ts";
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
export function moveSpeed(role: string, disguised: boolean, running = false): number {
  if (role === "hunter") return HUNTER_SPEED;
  if (running) return CHASE_SPEED;
  return disguised ? DISGUISED_SPEED : PROP_SPEED;
}

/** Abilities (key F). Props: Distract sends the hunter a fake ping. Hunter: Radar pings props nearby. */
export const DISTRACT_COOLDOWN = 15;
export const DISTRACT_MIN = 120;
export const DISTRACT_MAX = 260;
export const RADAR_COOLDOWN = 25;
/** First radar is available this many seconds after the hunt begins. */
export const RADAR_START_DELAY = 8;
export const RADAR_RADIUS = 320;
export const RADAR_JITTER = 24;

/** Inspect (hold E as the hunter): check one object safely, at the cost of time instead of health. */
export const INSPECT_TIME = 2;
/** If the inspected player moves more than this (pixels) the inspection fails and reveals them. */
export const INSPECT_MOVE_LIMIT = 18;

/** The hunt tightens: seconds into the hunt when each level starts. */
export const TIGHTEN_AT = [60, 120] as const;
/** At levels 1 and 2, every prop gives a rough area ping this often (seconds)... */
export const SWEEP_EVERY = [20, 10] as const;
/** ...and the area it lands in has this radius (pixels). */
export const SWEEP_RADIUS = [110, 64] as const;
/** The radar recharges faster as the hunt tightens (index = level 0, 1, 2). */
export const RADAR_COOLDOWN_BY_LEVEL = [25, 18, 12] as const;

/** When a prop disguises or undisguises within this distance of the hunter, a dust puff shows nearby. */
export const CLUE_RADIUS = 380;
export const CLUE_JITTER = 40;

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

/**
 * A found prop is not out yet: it is exposed and gets a short sprint, faster than the hunter.
 * The hunter must touch it (or swing at it) in time. If it escapes, it carries on, but cannot disguise for a moment.
 */
export const CHASE_TIME = 3;
export const CHASE_SPEED = 250;
/** A found prop gets this long (seconds) to break away before the hunter can catch it by touching. */
export const CHASE_HEAD_START = 0.45;
/** After a chase ends (escaped), no disguising for this many seconds. */
export const CHASE_LOCKOUT = 2;
/** How close (pixels between centres) the hunter must get to catch a runner by touching. */
export const CATCH_RADIUS = 32;
export const POINTS_ESCAPE = 1;

/** Hunter rules. */
export const HUNTER_MAX_HP = 100;
/** Health lost when the hunter hits something that is not a player. */
export const WRONG_HIT_PENALTY = 10;
/** How far from the hunter a swing can land, in pixels. */
export const ATTACK_RANGE = 64;
/** The hunter hits whatever is in front of them, up to this far, within this much of a cone (radians each side). */
export const SWING_REACH = 62;
export const SWING_CONE = 0.4;
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
    /** Seconds until your ability (F) is ready again; 0 means ready. */
    cooldown: t.number(),
    /** Hunter only: how far through an inspection (0 to 100). 0 when not inspecting. */
    inspect: t.number(),
    /** A computer-controlled player. */
    bot: t.boolean(),
    /** Seconds left of the sprint a found prop gets before it is caught or escapes. 0 when not being chased. */
    chase: t.number(),
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
    /** Id of the map in play (see MAP_DEFS). It changes between rounds. */
    map: t.string(),
    /** How far the hunt has tightened (0, 1 or 2). */
    alert: t.number(),
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
  /** What it landed on. "caught": a prop was found and is running. "escaped": the runner got away. */
  result: "player" | "prop" | "nothing" | "caught" | "escaped";
}

/** Server tells the hunter roughly where something is. */
export const MSG_PING = "ping";
export interface PingEvent {
  x: number;
  y: number;
  /**
   * "noise": a moving prop or a decoy (they look the same). "radar": found by the hunter's radar.
   * "pulse": the radar sweep itself. "area": a rough area where a prop is (the hunt tightening).
   * "dust": someone just disguised or undisguised nearby.
   */
  kind: "noise" | "radar" | "pulse" | "area" | "dust";
  /** For "area": the real position is somewhere inside this radius. */
  r?: number;
}
/** Use your ability. */
export const MSG_ABILITY = "ability";

/** Hunter starts or stops inspecting what is under the mouse: { x, y, on }. */
export const MSG_INSPECT = "inspect";
export interface InspectMessage {
  x: number;
  y: number;
  on: boolean;
}
/** Server to the hunter: how an inspection ended. */
export const MSG_INSPECT_RESULT = "inspected";
export interface InspectResult {
  x: number;
  y: number;
  /** "clear": just an object. "found": it was a player. "moved": it moved away, so it was a player. "none": nothing there. */
  result: "clear" | "found" | "moved" | "none";
  /** For "clear": which object, so it can be ticked off. */
  propId?: number;
}
/** Server to a prop: the hunter is inspecting you (active) or has stopped. */
export const MSG_ALERT = "alert";
export interface AlertMessage {
  active: boolean;
}

/** A prop taunts the hunter with a silly sound (Space). It gives away roughly where you are. */
export const MSG_TAUNT = "taunt";
/** Server to everyone: someone taunted. */
export const MSG_TAUNTED = "taunted";
export const TAUNT_COOLDOWN = 5;
export const TAUNT_SOUNDS = 5;
/** The hunter is told a spot this close (pixels) to the taunter, not the exact place. */
export const TAUNT_JITTER = 90;
export interface TauntEvent {
  x: number;
  y: number;
  /** Which silly sound: 0 to TAUNT_SOUNDS - 1. */
  sound: number;
}

/** Lobby: add or remove a computer-controlled player. */
export const MSG_ADD_BOT = "addBot";
export const MSG_REMOVE_BOT = "removeBot";
export interface AddBotMessage {
  level?: "easy" | "normal";
}
