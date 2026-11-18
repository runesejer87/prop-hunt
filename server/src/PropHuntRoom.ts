import { timingSafeEqual } from "node:crypto";
import { Room, ServerError, type Client } from "colyseus";
import { StateView } from "@colyseus/schema";
import { BotBrain, type BotApi, type BotLevel } from "./Bot.ts";
import {
  GameState,
  PlayerState,
  BodyState,
  Sight,
  VISION_RADIUS,
  InputMessage,
  AttackMessage,
  SwingEvent,
  MSG_INPUT,
  MSG_DISGUISE,
  MSG_UNDISGUISE,
  MSG_ROTATE,
  footprint,
  MSG_ATTACK,
  MSG_SWING,
  PROP_TYPES,
  getMap,
  MAP_IDS,
  DEFAULT_MAP_ID,
  type GameMap,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TICK_RATE,
  moveSpeed,
  MSG_PING,
  MSG_ABILITY,
  MSG_TAUNT,
  MSG_ADD_BOT,
  MSG_READY,
  MSG_ROLE,
  MSG_REMOVE_BOT,
  type AddBotMessage,
  MSG_TAUNTED,
  TAUNT_COOLDOWN,
  TAUNT_SOUNDS,
  TAUNT_JITTER,
  type TauntEvent,
  type PingEvent,
  MSG_INSPECT,
  MSG_INSPECT_RESULT,
  MSG_ALERT,
  type InspectMessage,
  type InspectResult,
  type AlertMessage,
  INSPECT_TIME,
  INSPECT_MOVE_LIMIT,
  TIGHTEN_AT,
  SWEEP_EVERY,
  SWEEP_RADIUS,
  RADAR_COOLDOWN_BY_LEVEL,
  CLUE_RADIUS,
  CLUE_JITTER,
  DISTRACT_COOLDOWN,
  DISTRACT_MIN,
  DISTRACT_MAX,
  RADAR_START_DELAY,
  RADAR_RADIUS,
  RADAR_JITTER,
  PING_INTERVAL,
  PING_JITTER,
  PLAYER_RADIUS,
  TILE,
  LOBBY_COUNTDOWN,
  HIDE_TIME,
  HUNT_TIME,
  END_TIME,
  POINTS_PER_FIND,
  POINTS_FOUND_ALL_BONUS,
  POINTS_SURVIVE,
  MAX_NAME_LENGTH,
  HUNTER_MAX_HP,
  WRONG_HIT_PENALTY,
  SWING_REACH,
  SWING_CONE,
  CHASE_TIME,
  CHASE_HEAD_START,
  CHASE_LOCKOUT,
  CATCH_RADIUS,
  POINTS_ESCAPE,
  ATTACK_COOLDOWN,
  SETTLE_TIME,
  type Phase,
} from "@prop-hunt/shared";

/** Extra distance beyond the vision radius that the server uses for line-of-sight checks. */
const REVEAL_MARGIN = 40;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class PropHuntRoom extends Room<{ state: GameState }> {
  maxClients = MAX_PLAYERS;
  state = new GameState();

  /** The map in play. It changes between rounds. */
  private map: GameMap = getMap(DEFAULT_MAP_ID);
  /** Latest input per player; the server decides the real movement. */
  private moveInputs = new Map<string, InputMessage>();
  /** Seconds left (with decimals) in the current phase. */
  private clockLeft = 0;
  private attackReadyAt = 0;
  /** Seconds each disguised prop has been standing still. */
  private stillFor = new Map<string, number>();
  /** Seconds each moving prop has been on the move since it last gave itself away. */
  private noise = new Map<string, number>();
  /** How many times each player has been the hunter, so the job rotates. */
  private hunts = new Map<string, number>();
  /** Seconds left before each player can use their ability again. */
  private cooldowns = new Map<string, number>();
  /** The hunter's inspection in progress, if any. */
  private inspecting?: {
    hunterId: string;
    kind: "prop" | "player";
    targetId?: string;
    propId?: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    left: number;
  };
  /** The way each player last walked (a unit vector). The hunter swings and inspects this way. */
  private facing = new Map<string, { x: number; y: number }>();
  /** Props that were just found and are sprinting for their lives. */
  private chasing = new Map<string, { left: number; grace: number }>();
  /** Computer-controlled players. */
  private bots = new Map<string, BotBrain>();
  private botCount = 0;
  /** How long the hunt lasts. The HUNT_TIME_OVERRIDE environment variable shortens it for testing. */
  private huntTime = Number(process.env.HUNT_TIME_OVERRIDE) || HUNT_TIME;
  /** What a CPU player can do and see: the same things a human can. */
  private botApi: BotApi = {
    map: undefined as unknown as GameMap, // replaced by the getter below
    phase: () => this.state.phase,
    now: () => this.clock.currentTime / 1000,
    player: (id) => this.state.players.get(id),
    body: (id) => this.state.bodies.get(id),
    players: () => this.players(),
    setInput: (id, dx, dy) => this.moveInputs.set(id, { dx: clamp(dx, -1, 1), dy: clamp(dy, -1, 1) }),
    disguise: (id) => this.doDisguise(id),
    undisguise: (id) => this.doUndisguise(id),
    taunt: (id) => this.doTaunt(id),
    ability: (id) => this.useAbility(id),
    attack: (id) => this.handleAttack(id, { x: 0, y: 0 }),
    inspect: (id, on) => this.doInspect(id, on),
    visibleTo: (hunterId) => this.visibleProps(hunterId),
  };
  /** Time (seconds, room clock) before which a prop that just escaped cannot disguise. */
  private lockUntil = new Map<string, number>();
  /** How many chases each prop has escaped this round. */
  private escapes = new Map<string, number>();
  /** Room-clock time before which a prop cannot taunt again. */
  private tauntReadyAt = new Map<string, number>();
  /** Seconds into the hunt at which the next tightening sweep happens. */
  private nextSweepAt = 0;

  constructor() {
    super();
    Object.defineProperty(this.botApi, "map", { get: () => this.map });
  }

  messages = {
    [MSG_INPUT]: (client: Client, msg: InputMessage) => {
      // Each part is -1 to 1. Keyboards send whole numbers; a touch joystick sends anything in between.
      this.moveInputs.set(client.sessionId, {
        dx: clamp(Number(msg?.dx) || 0, -1, 1),
        dy: clamp(Number(msg?.dy) || 0, -1, 1),
      });
    },
    [MSG_DISGUISE]: (client: Client) => this.doDisguise(client.sessionId),
    [MSG_ROTATE]: (client: Client) => this.doRotate(client.sessionId),
    [MSG_UNDISGUISE]: (client: Client) => this.doUndisguise(client.sessionId),
    [MSG_ATTACK]: (client: Client, msg: AttackMessage) => this.handleAttack(client.sessionId, msg),
    [MSG_ABILITY]: (client: Client) => this.useAbility(client.sessionId),
    [MSG_INSPECT]: (client: Client, msg: InspectMessage) => this.doInspect(client.sessionId, !!msg?.on),
    [MSG_TAUNT]: (client: Client) => this.doTaunt(client.sessionId),
    [MSG_ADD_BOT]: (_client: Client, msg: AddBotMessage) => this.addBot(msg?.level === "easy" ? "easy" : "normal"),
    [MSG_REMOVE_BOT]: () => this.removeBot(),
    [MSG_ROLE]: (client: Client, msg: { role?: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.state.phase !== "lobby") return;
      const role = msg?.role;
      // Only one hunter: if someone else already took it, the answer is no.
      if (role === "hunter" && this.players().some((o) => !o.bot && o.wantHunter && o.id !== p.id)) return;
      p.wantHunter = role === "hunter";
      p.wantHider = role === "hider";
    },
    [MSG_READY]: (client: Client, msg: { ready?: boolean }) => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.state.phase === "lobby") p.ready = msg?.ready ?? !p.ready;
    },
  };

  // --------------------------------------------------- actions (by player id)
  // Humans and CPU players both go through these.

  /** Send something to one player: a browser, or a CPU player's brain. */
  private sendTo(id: string, type: string, payload: unknown) {
    const client = this.clients.find((c) => c.sessionId === id);
    if (client) client.send(type, payload);
    else this.bots.get(id)?.hear(type, payload);
  }

  private doDisguise(id: string) {
    const player = this.state.players.get(id);
    const body = this.state.bodies.get(id);
    if (!player || !body || player.role !== "prop" || !player.alive) return;
    if (this.chasing.has(id) || this.clock.currentTime / 1000 < (this.lockUntil.get(id) ?? 0)) return;
    const prop = this.map.nearestDisguisableProp(body.x, body.y);
    if (prop && PROP_TYPES[prop.type]) {
      if (body.disguise !== prop.type || body.rot !== prop.rot) this.stillFor.set(id, 0);
      body.disguise = prop.type;
      body.rot = prop.rot;
      this.puffClue(body);
    }
  }

  private doRotate(id: string) {
    const player = this.state.players.get(id);
    const body = this.state.bodies.get(id);
    if (!player || !body || !body.disguise || !player.alive) return;
    body.rot = (body.rot + 1) % 4;
    this.stillFor.set(id, 0); // changing shape makes you wobble again
  }

  private doUndisguise(id: string) {
    const body = this.state.bodies.get(id);
    if (!body) return;
    if (body.disguise) this.puffClue(body);
    this.clearDisguise(id, body);
  }

  /**
   * Only people who know the password may join. Set it with the GAME_PASSWORD environment
   * variable on the server; if it is not set (local development), anyone can join.
   */
  onAuth(_client: Client, options: { password?: unknown }) {
    const wanted = process.env.GAME_PASSWORD;
    if (!wanted) return true;
    const given = typeof options?.password === "string" ? options.password : "";
    const a = Buffer.from(given);
    const b = Buffer.from(wanted);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ServerError(401, "Wrong password");
    return true;
  }

  onCreate() {
    this.state.phase = "lobby";
    this.state.map = this.map.id;
    this.state.timeLeft = 0;
    this.state.winner = "";
    this.state.round = 0;
    // A slow tick must not make everyone jump: cap how much time one step covers.
    this.setSimulationInterval((deltaMs) => this.update(Math.min(deltaMs, 100) / 1000), 1000 / TICK_RATE);
  }

  /** A tidy display name: letters, numbers, spaces and a few symbols, not too long. */
  private cleanName(raw: unknown): string {
    const text = typeof raw === "string" ? raw : "";
    const name = text.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
    return name || `Player ${this.clients.length}`;
  }

  onJoin(client: Client, options?: { name?: unknown }) {
    // A human takes a CPU player's seat if the game is full.
    if (this.players().length >= MAX_PLAYERS) this.removeBot();
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = this.cleanName(options?.name);
    player.score = 0;
    player.gain = 0;
    player.ready = false;
    player.wantHunter = false;
    player.wantHider = false;
    player.hp = HUNTER_MAX_HP;
    // Joining mid-round: watch until the next one starts.
    const inRound = this.state.phase !== "lobby";
    player.role = inRound ? "spectator" : "prop";
    player.alive = !inRound;

    const body = new BodyState();
    body.disguise = "";
    body.rot = 0;
    body.settled = false;
    this.placeRandomly(body);

    this.state.players.set(client.sessionId, player);
    this.state.bodies.set(client.sessionId, body);

    // Each client gets its own view of the bodies; see syncViews().
    client.view = new StateView();
    client.view.add(body);
  }

  /** A dropped connection (bad wifi, phone sleeping): keep the player's seat for a while. */
  async onDrop(client: Client) {
    this.moveInputs.delete(client.sessionId); // stand still while gone
    await this.allowReconnection(client, 30);
  }

  onReconnect(client: Client) {
    const body = this.state.bodies.get(client.sessionId);
    if (!client.view) client.view = new StateView();
    if (body) client.view.add(body);
  }

  onLeave(client: Client) {
    this.forget(client.sessionId);
  }

  /** Remove everything we know about a player. */
  private forget(id: string) {
    this.state.players.delete(id);
    this.state.bodies.delete(id);
    this.moveInputs.delete(id);
    this.stillFor.delete(id);
    this.noise.delete(id);
    this.hunts.delete(id);
    this.cooldowns.delete(id);
    this.facing.delete(id);
    this.chasing.delete(id);
    this.lockUntil.delete(id);
    this.escapes.delete(id);
    this.tauntReadyAt.delete(id);
    this.bots.delete(id);
  }

  // ------------------------------------------------------------- CPU players

  private static readonly BOT_NAMES = ["Ava", "Ben", "Cleo", "Dax", "Eli", "Fay"];

  /** Add a computer-controlled player (in the lobby, if there is room). */
  private addBot(level: BotLevel) {
    if (this.state.phase !== "lobby" || this.players().length >= MAX_PLAYERS) return;
    const id = `cpu_${++this.botCount}_${Math.random().toString(36).slice(2, 6)}`;
    const player = new PlayerState();
    player.id = id;
    const taken = new Set(this.players().map((p) => p.name));
    const name = PropHuntRoom.BOT_NAMES.map((n) => `CPU ${n}`).find((n) => !taken.has(n)) ?? `CPU ${this.botCount}`;
    player.name = name;
    player.bot = true;
    player.ready = true;
    player.wantHunter = false;
    player.wantHider = false;
    player.score = 0;
    player.gain = 0;
    player.hp = HUNTER_MAX_HP;
    player.role = "prop";
    player.alive = true;
    const body = new BodyState();
    body.disguise = "";
    body.rot = 0;
    body.settled = false;
    this.placeRandomly(body);
    this.state.players.set(id, player);
    this.state.bodies.set(id, body);
    this.bots.set(id, new BotBrain(id, level, this.botApi));
  }

  /** Remove a computer-controlled player (the newest one), if the game is in the lobby or someone needs the seat. */
  private removeBot() {
    const id = [...this.bots.keys()].pop();
    if (!id) return;
    this.cancelInspect(false);
    this.forget(id);
  }

  /** The ids of props the hunter can see right now, by the same rule a human hunter gets. */
  private visibleProps(hunterId: string): string[] {
    const hb = this.state.bodies.get(hunterId);
    if (!hb) return [];
    const sight = new Sight(this.map, hb.x, hb.y, VISION_RADIUS + REVEAL_MARGIN);
    const out: string[] = [];
    this.state.bodies.forEach((body, id) => {
      const other = this.state.players.get(id);
      if (!other || other.role !== "prop" || !other.alive) return;
      if (this.hunterCanSee(sight, hb, body, false)) out.push(id);
    });
    return out;
  }

  // ------------------------------------------------------------ visibility

  /**
   * Decide, for every client, which bodies it is allowed to receive.
   * Props, ghosts and spectators see everyone. The hunter sees only bodies that
   * are close and in line of sight; nothing at all while blind; everything once the round ends.
   * Anything not sent can't be read out of the network traffic.
   */
  private syncViews() {
    const phase = this.state.phase as Phase;
    for (const client of this.clients) {
      const view = client.view;
      const me = this.state.players.get(client.sessionId);
      const myBody = this.state.bodies.get(client.sessionId);
      if (!view || !me || !myBody) continue;

      const restricted = me.role === "hunter" && (phase === "hide" || phase === "hunt");
      const sight = restricted && phase === "hunt" ? new Sight(this.map, myBody.x, myBody.y, VISION_RADIUS + REVEAL_MARGIN) : undefined;

      this.state.bodies.forEach((body, id) => {
        let show = true;
        if (restricted && id !== client.sessionId) {
          const other = this.state.players.get(id);
          const running = this.chasing.has(id) && phase === "hunt";
          show = running || (!!sight && !!other && other.role === "prop" && other.alive && this.hunterCanSee(sight, myBody, body, view.has(body)));
        }
        const shown = view.has(body);
        if (show && !shown) view.add(body);
        else if (!show && shown) view.remove(body);
      });
    }
  }

  /** Close enough and in line of sight (centre or any corner of the target). */
  private hunterCanSee(sight: Sight, from: BodyState, target: BodyState, alreadyVisible: boolean): boolean {
    // A little slack once visible, so things don't flicker at the edge.
    const reach = VISION_RADIUS + (alreadyVisible ? REVEAL_MARGIN / 2 : 0);
    if (Math.hypot(target.x - from.x, target.y - from.y) > reach) return false;
    const fp = target.disguise ? footprint(target.disguise, target.rot) : undefined;
    const hw = (fp ? fp.w : PLAYER_RADIUS * 2) / 2;
    const hh = (fp ? fp.h : PLAYER_RADIUS * 2) / 2;
    const spots: [number, number][] = [
      [target.x, target.y],
      [target.x - hw, target.y - hh],
      [target.x + hw, target.y - hh],
      [target.x - hw, target.y + hh],
      [target.x + hw, target.y + hh],
    ];
    return spots.some(([x, y]) => sight.sees(x, y));
  }

  private clearDisguise(id: string, body: BodyState) {
    body.disguise = "";
    body.rot = 0;
    body.settled = false;
    this.stillFor.delete(id);
  }

  // ---------------------------------------------------------------- rounds

  private setPhase(phase: Phase, seconds: number) {
    this.state.phase = phase;
    this.clockLeft = seconds;
    this.state.timeLeft = Math.ceil(seconds);
  }

  private players(): PlayerState[] {
    return [...this.state.players.values()];
  }

  /**
   * Who hunts this round: the player who asked for it. If nobody did, it changes every round:
   * whoever has hunted the fewest times (not counting players who asked to hide), ties picked at random.
   */
  private lobbyHunter(): PlayerState | undefined {
    const all = this.players();
    const asked = all.find((p) => !p.bot && p.wantHunter);
    if (asked) return asked;
    if (all.length === 0) return undefined;
    const pool = all.filter((p) => !p.wantHider);
    const from = pool.length > 0 ? pool : all;
    const fewest = Math.min(...from.map((p) => this.hunts.get(p.id) ?? 0));
    let tied = from.filter((p) => (this.hunts.get(p.id) ?? 0) === fewest);
    // Never the same hunter twice in a row when someone else is just as due.
    if (tied.length > 1) tied = tied.filter((p) => p.id !== this.lastHunter);
    return tied[Math.floor(Math.random() * tied.length)];
  }

  private lastHunter = "";

  private startRound() {
    const all = this.players();
    // The lobby decides: the player who asked to be the hunter, or else the first CPU player.
    const chosen = this.lobbyHunter() ?? all[0]!;
    const fewest = this.hunts.get(chosen.id) ?? 0;
    this.hunts.set(chosen.id, fewest + 1);
    this.lastHunter = chosen.id;
    this.state.round += 1;
    this.chooseNextMap();
    all.forEach((p) => {
      const body = this.state.bodies.get(p.id)!;
      p.gain = 0;
      p.role = p === chosen ? "hunter" : "prop";
      p.alive = true;
      p.hp = HUNTER_MAX_HP;
      this.clearDisguise(p.id, body);
      if (p.role === "hunter") {
        // The hunter starts in the middle of the hallway.
        const start = this.map.rooms.find((r) => r.name === this.map.def.hunterStart) ?? this.map.rooms[0]!;
        const c = this.map.roomCenter(start);
        body.x = c.x;
        body.y = c.y;
        this.nudgeToFreeSpot(body);
      } else {
        this.placeRandomly(body);
      }
    });
    this.moveInputs.clear();
    this.cancelInspect(false);
    this.bots.forEach((b) => b.reset());
    this.chasing.clear();
    this.lockUntil.clear();
    this.escapes.clear();
    for (const p of all) p.chase = 0;
    this.state.alert = 0;
    for (const p of all) this.setCooldown(p.id, 0);
    this.state.winner = "";
    this.setPhase("hide", HIDE_TIME);
  }

  /** A different map each round (the first round can be any of them). */
  private chooseNextMap() {
    const pool = this.state.round <= 1 ? [...MAP_IDS] : MAP_IDS.filter((id) => id !== this.map.id);
    // Testing only: FORCE_MAP=garden always plays that map.
    const forced = process.env.FORCE_MAP && MAP_IDS.includes(process.env.FORCE_MAP) ? process.env.FORCE_MAP : undefined;
    const next = forced ?? (pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]! : this.map.id);
    this.map = getMap(next);
    this.state.map = this.map.id;
  }

  private endRound(winner: "props" | "hunter") {
    // Points: the hunter earns for each prop found; props earn for surviving.
    const all = this.players();
    const found = all.filter((p) => p.role === "prop" && !p.alive).length;
    for (const p of all) {
      let gain = 0;
      if (p.role === "hunter") gain = found * POINTS_PER_FIND + (winner === "hunter" ? POINTS_FOUND_ALL_BONUS : 0);
      else if (p.role === "prop" && p.alive) gain = POINTS_SURVIVE;
      if (p.role === "prop") gain += (this.escapes.get(p.id) ?? 0) * POINTS_ESCAPE;
      p.gain = gain;
      p.score += gain;
    }
    this.state.winner = winner;
    this.setPhase("end", END_TIME);
  }

  private backToLobby() {
    for (const p of this.players()) {
      const body = this.state.bodies.get(p.id)!;
      p.role = "prop";
      p.alive = true;
      p.ready = p.bot;
      p.wantHunter = false;
      p.wantHider = false;
      p.hp = HUNTER_MAX_HP;
      this.clearDisguise(p.id, body);
      this.placeRandomly(body);
    }
    this.moveInputs.clear();
    this.state.winner = "";
    this.setPhase("lobby", 0);
  }

  private update(dt: number) {
    const phase = this.state.phase as Phase;
    const players = this.players();

    if (phase === "lobby") {
      if (players.length >= MIN_PLAYERS && players.every((p) => p.ready)) {
        if (this.clockLeft <= 0) this.clockLeft = LOBBY_COUNTDOWN;
        this.clockLeft -= dt;
        this.state.timeLeft = Math.max(0, Math.ceil(this.clockLeft));
        if (this.clockLeft <= 0) this.startRound();
      } else {
        this.clockLeft = 0;
        this.state.timeLeft = 0;
      }
    } else {
      this.clockLeft -= dt;
      this.state.timeLeft = Math.max(0, Math.ceil(this.clockLeft));

      if (phase === "hide" && this.clockLeft <= 0) {
        this.setPhase("hunt", this.huntTime);
        // Abilities start ready, except the hunter's radar which needs a few seconds.
        for (const p of this.players()) this.setCooldown(p.id, p.role === "hunter" ? RADAR_START_DELAY : 0);
      } else if (phase === "end" && this.clockLeft <= 0) {
        this.backToLobby();
      } else if (phase === "hide" || phase === "hunt") {
        this.checkRoundOver(players);
        if (phase === "hunt" && this.state.phase === "hunt" && this.clockLeft <= 0) this.endRound("props");
      }
    }

    this.tickCooldowns(dt);
    this.tickInspect(dt);
    this.tickChase(dt);
    this.bots.forEach((b) => b.update(dt));
    this.updateTightening();
    this.movePlayers(dt);
    this.syncViews();
  }

  private checkRoundOver(players: PlayerState[]) {
    const hunter = players.find((p) => p.role === "hunter");
    const livingProps = players.filter((p) => p.role === "prop" && p.alive);
    if (!hunter) return this.endRound("props"); // hunter left
    if (hunter.hp <= 0) return this.endRound("props");
    if (livingProps.length === 0) return this.endRound("hunter");
  }

  // --------------------------------------------------------------- hunter

  /**
   * What is in front of the hunter, the way they last walked: the nearest thing within reach, looking a
   * little to each side. Returns the thing and the spot where it was found.
   */
  private frontTarget(hunterId: string, hunterBody: BodyState) {
    const f = this.facing.get(hunterId) ?? { x: 0, y: 1 };
    const base = Math.atan2(f.y, f.x);
    const offsets = [0, SWING_CONE / 2, -SWING_CONE / 2, SWING_CONE, -SWING_CONE];
    for (const dist of [26, 42, SWING_REACH]) {
      for (const off of offsets) {
        const px = hunterBody.x + Math.cos(base + off) * dist;
        const py = hunterBody.y + Math.sin(base + off) * dist;
        const hit = this.findTargetAt(px, py);
        if (hit) return { hit, x: px, y: py };
      }
    }
    return { hit: undefined, x: hunterBody.x + Math.cos(base) * 42, y: hunterBody.y + Math.sin(base) * 42 };
  }

  /** What is at this point: a set piece (furniture) or a hiding player. The closest wins; players win ties. */
  private findTargetAt(ax: number, ay: number): { kind: "prop" | "player"; d: number; id?: string; propId?: number } | undefined {
    let best: { kind: "prop" | "player"; d: number; id?: string; propId?: number } | undefined;
    const consider = (hit: NonNullable<typeof best>) => {
      if (!best || hit.d < best.d) best = hit;
    };
    const SLOP = 6;
    for (const p of this.map.props) {
      const fp = footprint(p.type, p.rot);
      if (Math.abs(ax - p.x) <= fp.w / 2 + SLOP && Math.abs(ay - p.y) <= fp.h / 2 + SLOP)
        consider({ kind: "prop", d: Math.hypot(ax - p.x, ay - p.y), propId: p.id });
    }
    for (const pl of this.players()) {
      if (pl.role !== "prop" || !pl.alive) continue;
      const body = this.state.bodies.get(pl.id);
      if (!body) continue;
      const fp = body.disguise ? footprint(body.disguise, body.rot) : undefined;
      const slop = this.chasing.has(pl.id) ? SLOP + 8 : SLOP; // a runner is easier to hit
      const hw = (fp ? fp.w : PLAYER_RADIUS * 2) / 2 + slop;
      const hh = (fp ? fp.h : PLAYER_RADIUS * 2) / 2 + slop;
      if (Math.abs(ax - body.x) <= hw && Math.abs(ay - body.y) <= hh)
        consider({ kind: "player", d: Math.hypot(ax - body.x, ay - body.y) - 0.5, id: pl.id });
    }
    return best;
  }

  /** A player has been found: out of the round. */
  private eliminate(id: string) {
    const found = this.state.players.get(id);
    const body = this.state.bodies.get(id);
    if (!found || !body) return;
    this.chasing.delete(id);
    found.chase = 0;
    found.alive = false;
    this.clearDisguise(id, body);
  }

  private handleAttack(sessionId: string, msg: AttackMessage) {
    const hunter = this.state.players.get(sessionId);
    const hunterBody = this.state.bodies.get(sessionId);
    if (!hunter || !hunterBody || hunter.role !== "hunter" || this.state.phase !== "hunt") return;
    const now = this.clock.currentTime / 1000;
    if (now < this.attackReadyAt) return;
    this.attackReadyAt = now + ATTACK_COOLDOWN;
    this.cancelInspect(false);

    const { hit, x, y } = this.frontTarget(sessionId, hunterBody);
    let result: SwingEvent["result"] = "nothing";
    if (hit?.kind === "player" && hit.id) {
      // The first hit exposes a hiding prop; a second hit on a runner puts them out.
      if (this.chasing.has(hit.id)) {
        this.eliminate(hit.id);
        result = "player";
      } else {
        this.startChase(hit.id, x, y);
        return;
      }
    } else if (hit?.kind === "prop") {
      hunter.hp = Math.max(0, hunter.hp - WRONG_HIT_PENALTY);
      result = "prop";
    }
    this.broadcast(MSG_SWING, { x, y, result } satisfies SwingEvent);
  }

  /** A prop was found: it is exposed and sprints, and the hunter must touch it before time runs out. */
  private startChase(id: string, x: number, y: number) {
    const player = this.state.players.get(id);
    const body = this.state.bodies.get(id);
    if (!player || !body || !player.alive) return;
    this.clearDisguise(id, body);
    this.chasing.set(id, { left: CHASE_TIME, grace: CHASE_HEAD_START });
    player.chase = CHASE_TIME;
    this.sendTo(id, MSG_ALERT, { active: false } satisfies AlertMessage);
    this.broadcast(MSG_SWING, { x, y, result: "caught" } satisfies SwingEvent);
  }

  private tickChase(dt: number) {
    if (this.chasing.size === 0) return;
    const hunterEntry = [...this.state.players.values()].find((p) => p.role === "hunter");
    const hunterBody = hunterEntry ? this.state.bodies.get(hunterEntry.id) : undefined;
    for (const [id, c] of [...this.chasing]) {
      const player = this.state.players.get(id);
      const body = this.state.bodies.get(id);
      if (!player || !body || !player.alive || this.state.phase !== "hunt") {
        this.chasing.delete(id);
        if (player) player.chase = 0;
        continue;
      }
      // Touched by the hunter: out (after the runner's short head start).
      c.grace -= dt;
      if (c.grace <= 0 && hunterBody && Math.hypot(body.x - hunterBody.x, body.y - hunterBody.y) <= CATCH_RADIUS) {
        this.eliminate(id);
        this.broadcast(MSG_SWING, { x: body.x, y: body.y, result: "player" } satisfies SwingEvent);
        continue;
      }
      c.left -= dt;
      if (c.left > 0) {
        const shown = Math.ceil(c.left * 10) / 10;
        if (player.chase !== shown) player.chase = shown;
        continue;
      }
      // Time is up: escaped.
      this.chasing.delete(id);
      player.chase = 0;
      this.lockUntil.set(id, this.clock.currentTime / 1000 + CHASE_LOCKOUT);
      this.escapes.set(id, (this.escapes.get(id) ?? 0) + 1);
      this.broadcast(MSG_SWING, { x: body.x, y: body.y, result: "escaped" } satisfies SwingEvent);
    }
  }

  // -------------------------------------------------------------- inspect

  /**
   * Hold E as the hunter: check the object under the mouse. It takes INSPECT_TIME seconds and the
   * hunter cannot move. Ordinary objects come back "clear" at no cost. A hiding player is found.
   * The player is warned and can slip away, which also gives them away.
   */
  private doInspect(id: string, on: boolean) {
    const hunter = this.state.players.get(id);
    const hunterBody = this.state.bodies.get(id);
    if (!hunter || !hunterBody || hunter.role !== "hunter") return;
    if (!on) {
      if (this.inspecting?.hunterId === id) this.cancelInspect(false);
      return;
    }
    if (this.state.phase !== "hunt" || this.inspecting) return;

    const front = this.frontTarget(id, hunterBody);
    const aim = { x: front.x, y: front.y };
    const hit = front.hit;
    if (!hit) {
      this.sendTo(id, MSG_INSPECT_RESULT, { x: aim.x, y: aim.y, result: "none" } satisfies InspectResult);
      return;
    }
    const targetBody = hit.kind === "player" && hit.id ? this.state.bodies.get(hit.id) : undefined;
    this.inspecting = {
      hunterId: id,
      kind: hit.kind,
      targetId: hit.id,
      propId: hit.propId,
      x: aim.x,
      y: aim.y,
      startX: targetBody?.x ?? aim.x,
      startY: targetBody?.y ?? aim.y,
      left: INSPECT_TIME,
    };
    this.moveInputs.set(id, { dx: 0, dy: 0 });
    // Tell the player being inspected.
    if (hit.id) this.sendTo(hit.id, MSG_ALERT, { active: true } satisfies AlertMessage);
  }

  /** Stop an inspection. `reveal`: the target moved, which gives it away. */
  private cancelInspect(reveal: boolean) {
    const ins = this.inspecting;
    if (!ins) return;
    this.inspecting = undefined;
    const hunter = this.state.players.get(ins.hunterId);
    if (hunter) hunter.inspect = 0;
    if (ins.targetId) this.sendTo(ins.targetId, MSG_ALERT, { active: false } satisfies AlertMessage);
    if (reveal && ins.targetId) {
      const tb = this.state.bodies.get(ins.targetId);
      if (tb) {
        this.sendTo(ins.hunterId, MSG_INSPECT_RESULT, { x: tb.x, y: tb.y, result: "moved" } satisfies InspectResult);
        this.sendTo(ins.hunterId, MSG_PING, { x: tb.x, y: tb.y, kind: "radar" } satisfies PingEvent);
      }
    }
  }

  private tickInspect(dt: number) {
    const ins = this.inspecting;
    if (!ins) return;
    const hunter = this.state.players.get(ins.hunterId);
    const hunterBody = this.state.bodies.get(ins.hunterId);
    if (!hunter || !hunterBody || hunter.role !== "hunter" || this.state.phase !== "hunt") return this.cancelInspect(false);

    // A player who walks off while being inspected gives themselves away.
    if (ins.kind === "player" && ins.targetId) {
      const target = this.state.players.get(ins.targetId);
      const tb = this.state.bodies.get(ins.targetId);
      if (!target || !tb || !target.alive) return this.cancelInspect(false);
      if (Math.hypot(tb.x - ins.startX, tb.y - ins.startY) > INSPECT_MOVE_LIMIT) return this.cancelInspect(true);
    }

    ins.left -= dt;
    const progress = Math.min(100, Math.round((1 - Math.max(0, ins.left) / INSPECT_TIME) * 100));
    if (hunter.inspect !== progress) hunter.inspect = progress;
    if (ins.left > 0) return;

    // Done.
    this.cancelInspect(false);
    if (ins.kind === "player" && ins.targetId) {
      this.startChase(ins.targetId, ins.startX, ins.startY);
      this.sendTo(ins.hunterId, MSG_INSPECT_RESULT, { x: ins.startX, y: ins.startY, result: "found" } satisfies InspectResult);
    } else {
      this.sendTo(ins.hunterId, MSG_INSPECT_RESULT, { x: ins.x, y: ins.y, result: "clear", propId: ins.propId } satisfies InspectResult);
    }
  }

  // ----------------------------------------------------------------- taunt

  /**
   * Space as a prop: make a silly sound that everyone hears, from where you are. It is funny, but it
   * gives you away: the hunter is told roughly (not exactly) where it came from.
   */
  private doTaunt(id: string) {
    const player = this.state.players.get(id);
    const body = this.state.bodies.get(id);
    if (!player || !body || player.role !== "prop" || this.state.phase === "end") return;
    const now = this.clock.currentTime / 1000;
    if (now < (this.tauntReadyAt.get(id) ?? 0)) return;
    this.tauntReadyAt.set(id, now + TAUNT_COOLDOWN);

    const sound = Math.floor(Math.random() * TAUNT_SOUNDS);
    const j = () => (Math.random() * 2 - 1) * TAUNT_JITTER;
    for (const other of this.players()) {
      const fuzzy = other.role === "hunter" && other.id !== id;
      this.sendTo(other.id, MSG_TAUNTED, { x: body.x + (fuzzy ? j() : 0), y: body.y + (fuzzy ? j() : 0), sound } satisfies TauntEvent);
    }
  }

  // ------------------------------------------------- the hunt tightens

  /** 0 at first, then 1 and 2 as the hunt goes on. */
  private updateTightening() {
    if (this.state.phase !== "hunt") {
      if (this.state.alert !== 0) this.state.alert = 0;
      return;
    }
    const elapsed = this.huntTime - this.clockLeft;
    const level = elapsed >= TIGHTEN_AT[1] ? 2 : elapsed >= TIGHTEN_AT[0] ? 1 : 0;
    if (level !== this.state.alert) {
      this.state.alert = level;
      this.nextSweepAt = elapsed; // the first sweep comes straight away
    }
    if (level > 0 && elapsed >= this.nextSweepAt) {
      this.sweep(level);
      this.nextSweepAt = elapsed + SWEEP_EVERY[level - 1]!;
    }
  }

  /** Tell the hunter roughly where every prop is: a circle that holds the prop somewhere inside. */
  private sweep(level: number) {
    const hunter = this.hunterId();
    if (!hunter) return;
    const r = SWEEP_RADIUS[level - 1]!;
    for (const p of this.players()) {
      const body = this.state.bodies.get(p.id);
      if (!body || p.role !== "prop" || !p.alive) continue;
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r * 0.7;
      this.sendTo(hunter, MSG_PING, { x: body.x + Math.cos(a) * d, y: body.y + Math.sin(a) * d, kind: "area", r } satisfies PingEvent);
    }
  }

  /** A puff of dust near where someone just disguised or undisguised, if the hunter is close. */
  private puffClue(body: BodyState) {
    if (this.state.phase !== "hunt") return;
    const hunter = this.hunterId();
    const hb = hunter ? this.state.bodies.get(hunter) : undefined;
    if (!hunter || !hb || Math.hypot(body.x - hb.x, body.y - hb.y) > CLUE_RADIUS) return;
    const j = () => (Math.random() * 2 - 1) * CLUE_JITTER;
    this.sendTo(hunter, MSG_PING, { x: body.x + j(), y: body.y + j(), kind: "dust" } satisfies PingEvent);
  }

  // ------------------------------------------------------------- movement

  private movePlayers(dt: number) {
    const frozen = this.state.phase === "hide";
    this.state.bodies.forEach((body, id) => {
      const player = this.state.players.get(id);
      if (!player) return;
      if (frozen && player.role === "hunter") return; // hunter waits while props hide
      if (this.inspecting?.hunterId === id) return; // and while inspecting
      const input = this.moveInputs.get(id);
      const moving = !!input && Math.hypot(input.dx, input.dy) > 0.05;

      // Props that stand still for a moment settle into a perfect copy.
      if (body.disguise) {
        const still = moving ? 0 : (this.stillFor.get(id) ?? 0) + dt;
        this.stillFor.set(id, still);
        const settled = still >= SETTLE_TIME;
        if (body.settled !== settled) body.settled = settled;
      }

      // A prop that keeps moving during the hunt gives away roughly where it is.
      if (this.state.phase === "hunt" && player.role === "prop" && player.alive) {
        const n = moving ? (this.noise.get(id) ?? 0) + dt : Math.max(0, (this.noise.get(id) ?? 0) - dt);
        if (n >= PING_INTERVAL) {
          this.sendPing(body);
          this.noise.set(id, 0);
        } else {
          this.noise.set(id, n);
        }
      }

      if (!input || !moving) return;
      // Diagonals are no faster; a half-pushed joystick is half speed.
      const len = Math.hypot(input.dx, input.dy);
      const step = moveSpeed(player.role, !!body.disguise, this.chasing.has(id)) * dt * Math.min(1, len);
      this.facing.set(id, { x: input.dx / len, y: input.dy / len });
      // Players disguised as objects are solid, just like the real thing.
      const solid = (px: number, py: number, r: number) => {
        let hit = false;
        this.state.bodies.forEach((other, oid) => {
          if (hit || oid === id || !other.disguise) return;
          const op = this.state.players.get(oid);
          if (!op || op.role !== "prop" || !op.alive) return;
          const fp = footprint(other.disguise, other.rot);
          if (Math.abs(px - other.x) < fp.w / 2 + r && Math.abs(py - other.y) < fp.h / 2 + r) hit = true;
        });
        return hit;
      };
      // Walk in small pieces so a long step can never pass through a wall.
      const pieces = Math.max(1, Math.ceil(step / 6));
      let x = body.x;
      let y = body.y;
      for (let i = 0; i < pieces; i++) {
        const n = this.map.moveWithCollision(x, y, ((input.dx / len) * step) / pieces, ((input.dy / len) * step) / pieces, PLAYER_RADIUS, solid);
        x = n.x;
        y = n.y;
      }
      body.x = x;
      body.y = y;
    });
  }

  private hunterId(): string | undefined {
    return this.players().find((p) => p.role === "hunter")?.id;
  }

  /** Tell the hunter (only) about a spot near this prop. */
  private sendPing(body: BodyState) {
    const hunter = this.hunterId();
    if (!hunter) return;
    const j = () => (Math.random() * 2 - 1) * PING_JITTER;
    this.sendTo(hunter, MSG_PING, { x: body.x + j(), y: body.y + j(), kind: "noise" } satisfies PingEvent);
  }

  // ------------------------------------------------------------- abilities

  private setCooldown(id: string, seconds: number) {
    this.cooldowns.set(id, seconds);
    const player = this.state.players.get(id);
    if (player) player.cooldown = Math.ceil(seconds);
  }

  private tickCooldowns(dt: number) {
    this.cooldowns.forEach((left, id) => {
      if (left <= 0) return;
      const next = Math.max(0, left - dt);
      this.cooldowns.set(id, next);
      const player = this.state.players.get(id);
      if (player && player.cooldown !== Math.ceil(next)) player.cooldown = Math.ceil(next);
    });
  }

  /**
   * F key. Props: "Distract" sends the hunter a fake noise somewhere else, which looks just like a
   * real one. Hunter: "Radar" pings every prop close by, even hidden, still ones, but not exactly.
   */
  private useAbility(id: string) {
    if (this.state.phase !== "hunt") return;
    const player = this.state.players.get(id);
    const body = this.state.bodies.get(id);
    if (!player || !body || !player.alive) return;
    if ((this.cooldowns.get(id) ?? 0) > 0) return;

    if (player.role === "prop") {
      const hunter = this.hunterId();
      if (!hunter) return;
      // Pick an open spot a good distance away.
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = DISTRACT_MIN + Math.random() * (DISTRACT_MAX - DISTRACT_MIN);
        const x = body.x + Math.cos(a) * r;
        const y = body.y + Math.sin(a) * r;
        if (this.map.isBlocked(x, y, PLAYER_RADIUS)) continue;
        this.sendTo(hunter, MSG_PING, { x, y, kind: "noise" } satisfies PingEvent);
        this.setCooldown(id, DISTRACT_COOLDOWN);
        return;
      }
    } else if (player.role === "hunter") {
      this.sendTo(id, MSG_PING, { x: body.x, y: body.y, kind: "pulse" } satisfies PingEvent);
      this.state.players.forEach((other, otherId) => {
        const ob = this.state.bodies.get(otherId);
        if (!ob || other.role !== "prop" || !other.alive) return;
        if (Math.hypot(ob.x - body.x, ob.y - body.y) > RADAR_RADIUS) return;
        const j = () => (Math.random() * 2 - 1) * RADAR_JITTER;
        this.sendTo(id, MSG_PING, { x: ob.x + j(), y: ob.y + j(), kind: "radar" } satisfies PingEvent);
      });
      this.setCooldown(id, RADAR_COOLDOWN_BY_LEVEL[this.state.alert] ?? RADAR_COOLDOWN_BY_LEVEL[0]);
    }
  }

  /** Put a body on a random open spot in a random room. */
  private placeRandomly(body: BodyState) {
    const rooms = this.map.rooms;
    const room = rooms[Math.floor(Math.random() * rooms.length)]!;
    const c = this.map.roomCenter(room);
    body.x = c.x;
    body.y = c.y;
    for (let i = 0; i < 200; i++) {
      const x = room.x * TILE + (1 + Math.random() * (room.w - 2)) * TILE;
      const y = room.y * TILE + (1 + Math.random() * (room.h - 2)) * TILE;
      if (!this.map.isBlocked(x, y, PLAYER_RADIUS + 2)) {
        body.x = x;
        body.y = y;
        return;
      }
    }
  }

  /** If the spot is taken, look for a free one nearby. */
  private nudgeToFreeSpot(body: BodyState) {
    for (let r = 0; r < 200; r += 8) {
      for (let a = 0; a < 8; a++) {
        const x = body.x + Math.cos((a * Math.PI) / 4) * r;
        const y = body.y + Math.sin((a * Math.PI) / 4) * r;
        if (!this.map.isBlocked(x, y, PLAYER_RADIUS + 2)) {
          body.x = x;
          body.y = y;
          return;
        }
      }
    }
  }
}
