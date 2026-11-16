import { timingSafeEqual } from "node:crypto";
import { Room, ServerError, type Client } from "colyseus";
import { StateView } from "@colyseus/schema";
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
  type PingEvent,
  DISTRACT_COOLDOWN,
  DISTRACT_MIN,
  DISTRACT_MAX,
  RADAR_COOLDOWN,
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
  ATTACK_RANGE,
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

  messages = {
    [MSG_INPUT]: (client: Client, msg: InputMessage) => {
      this.moveInputs.set(client.sessionId, {
        dx: clamp(Math.sign(Number(msg?.dx) || 0), -1, 1),
        dy: clamp(Math.sign(Number(msg?.dy) || 0), -1, 1),
      });
    },
    [MSG_DISGUISE]: (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      const body = this.state.bodies.get(client.sessionId);
      if (!player || !body || player.role !== "prop" || !player.alive) return;
      const prop = this.map.nearestDisguisableProp(body.x, body.y);
      if (prop && PROP_TYPES[prop.type]) {
        if (body.disguise !== prop.type || body.rot !== prop.rot) this.stillFor.set(client.sessionId, 0);
        body.disguise = prop.type;
        body.rot = prop.rot;
      }
    },
    [MSG_ROTATE]: (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      const body = this.state.bodies.get(client.sessionId);
      if (!player || !body || !body.disguise || !player.alive) return;
      body.rot = (body.rot + 1) % 4;
      this.stillFor.set(client.sessionId, 0); // changing shape makes you wobble again
    },
    [MSG_UNDISGUISE]: (client: Client) => {
      const body = this.state.bodies.get(client.sessionId);
      if (body) this.clearDisguise(client.sessionId, body);
    },
    [MSG_ATTACK]: (client: Client, msg: AttackMessage) => this.handleAttack(client.sessionId, msg),
    [MSG_ABILITY]: (client: Client) => this.useAbility(client),
  };

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
    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), 1000 / TICK_RATE);
  }

  /** A tidy display name: letters, numbers, spaces and a few symbols, not too long. */
  private cleanName(raw: unknown): string {
    const text = typeof raw === "string" ? raw : "";
    const name = text.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
    return name || `Player ${this.clients.length}`;
  }

  onJoin(client: Client, options?: { name?: unknown }) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = this.cleanName(options?.name);
    player.score = 0;
    player.gain = 0;
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

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.state.bodies.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
    this.stillFor.delete(client.sessionId);
    this.noise.delete(client.sessionId);
    this.hunts.delete(client.sessionId);
    this.cooldowns.delete(client.sessionId);
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
          show = !!sight && !!other && other.role === "prop" && other.alive && this.hunterCanSee(sight, myBody, body, view.has(body));
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

  private startRound() {
    const all = this.players();
    // The player who has been hunter the fewest times goes next (ties are random).
    const fewest = Math.min(...all.map((p) => this.hunts.get(p.id) ?? 0));
    const candidates = all.filter((p) => (this.hunts.get(p.id) ?? 0) === fewest);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)]!;
    this.hunts.set(chosen.id, fewest + 1);
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
    for (const p of all) this.setCooldown(p.id, 0);
    this.state.winner = "";
    this.setPhase("hide", HIDE_TIME);
  }

  /** A different map each round (the first round can be any of them). */
  private chooseNextMap() {
    const pool = this.state.round <= 1 ? [...MAP_IDS] : MAP_IDS.filter((id) => id !== this.map.id);
    const next = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]! : this.map.id;
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
      if (players.length >= MIN_PLAYERS) {
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
        this.setPhase("hunt", HUNT_TIME);
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

  private handleAttack(sessionId: string, msg: AttackMessage) {
    const hunter = this.state.players.get(sessionId);
    const hunterBody = this.state.bodies.get(sessionId);
    if (!hunter || !hunterBody || hunter.role !== "hunter" || this.state.phase !== "hunt") return;
    const now = this.clock.currentTime / 1000;
    if (now < this.attackReadyAt) return;
    this.attackReadyAt = now + ATTACK_COOLDOWN;

    // Aim point, limited to the hunter's reach.
    let ax = Number(msg?.x);
    let ay = Number(msg?.y);
    if (!Number.isFinite(ax) || !Number.isFinite(ay)) return;
    const dist = Math.hypot(ax - hunterBody.x, ay - hunterBody.y);
    if (dist > ATTACK_RANGE) {
      ax = hunterBody.x + ((ax - hunterBody.x) / dist) * ATTACK_RANGE;
      ay = hunterBody.y + ((ay - hunterBody.y) / dist) * ATTACK_RANGE;
    }

    // Everything the swing could land on: set pieces and hiding players.
    type Hit = { kind: "prop" | "player"; d: number; id?: string };
    let best: Hit | undefined;
    const consider = (hit: Hit) => {
      if (!best || hit.d < best.d) best = hit;
    };
    const SLOP = 6;
    for (const p of this.map.props) {
      const fp = footprint(p.type, p.rot);
      if (Math.abs(ax - p.x) <= fp.w / 2 + SLOP && Math.abs(ay - p.y) <= fp.h / 2 + SLOP)
        consider({ kind: "prop", d: Math.hypot(ax - p.x, ay - p.y) });
    }
    for (const pl of this.players()) {
      if (pl.role !== "prop" || !pl.alive) continue;
      const body = this.state.bodies.get(pl.id);
      if (!body) continue;
      const fp = body.disguise ? footprint(body.disguise, body.rot) : undefined;
      const hw = (fp ? fp.w : PLAYER_RADIUS * 2) / 2 + SLOP;
      const hh = (fp ? fp.h : PLAYER_RADIUS * 2) / 2 + SLOP;
      if (Math.abs(ax - body.x) <= hw && Math.abs(ay - body.y) <= hh)
        // Players win ties: a player standing next to their copy is in front.
        consider({ kind: "player", d: Math.hypot(ax - body.x, ay - body.y) - 0.5, id: pl.id });
    }

    const hit = best as Hit | undefined;
    let result: SwingEvent["result"] = "nothing";
    if (hit?.kind === "player" && hit.id) {
      const found = this.state.players.get(hit.id)!;
      found.alive = false;
      this.clearDisguise(hit.id, this.state.bodies.get(hit.id)!);
      result = "player";
    } else if (hit?.kind === "prop") {
      hunter.hp = Math.max(0, hunter.hp - WRONG_HIT_PENALTY);
      result = "prop";
    }
    this.broadcast(MSG_SWING, { x: ax, y: ay, result } satisfies SwingEvent);
  }

  // ------------------------------------------------------------- movement

  private movePlayers(dt: number) {
    const frozen = this.state.phase === "hide";
    this.state.bodies.forEach((body, id) => {
      const player = this.state.players.get(id);
      if (!player) return;
      if (frozen && player.role === "hunter") return; // hunter waits while props hide
      const input = this.moveInputs.get(id);
      const moving = !!input && (input.dx !== 0 || input.dy !== 0);

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
      // Normalise so diagonal movement isn't faster.
      const len = Math.hypot(input.dx, input.dy);
      const step = moveSpeed(player.role, !!body.disguise) * dt;
      const next = this.map.moveWithCollision(body.x, body.y, (input.dx / len) * step, (input.dy / len) * step, PLAYER_RADIUS);
      body.x = next.x;
      body.y = next.y;
    });
  }

  private hunterClient() {
    return this.clients.find((c) => this.state.players.get(c.sessionId)?.role === "hunter");
  }

  /** Tell the hunter (only) about a spot near this prop. */
  private sendPing(body: BodyState) {
    const hunter = this.hunterClient();
    if (!hunter) return;
    const j = () => (Math.random() * 2 - 1) * PING_JITTER;
    hunter.send(MSG_PING, { x: body.x + j(), y: body.y + j(), kind: "noise" } satisfies PingEvent);
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
  private useAbility(client: Client) {
    if (this.state.phase !== "hunt") return;
    const player = this.state.players.get(client.sessionId);
    const body = this.state.bodies.get(client.sessionId);
    if (!player || !body || !player.alive) return;
    if ((this.cooldowns.get(client.sessionId) ?? 0) > 0) return;

    if (player.role === "prop") {
      const hunter = this.hunterClient();
      if (!hunter) return;
      // Pick an open spot a good distance away.
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = DISTRACT_MIN + Math.random() * (DISTRACT_MAX - DISTRACT_MIN);
        const x = body.x + Math.cos(a) * r;
        const y = body.y + Math.sin(a) * r;
        if (this.map.isBlocked(x, y, PLAYER_RADIUS)) continue;
        hunter.send(MSG_PING, { x, y, kind: "noise" } satisfies PingEvent);
        this.setCooldown(client.sessionId, DISTRACT_COOLDOWN);
        return;
      }
    } else if (player.role === "hunter") {
      client.send(MSG_PING, { x: body.x, y: body.y, kind: "pulse" } satisfies PingEvent);
      this.state.players.forEach((other, id) => {
        const ob = this.state.bodies.get(id);
        if (!ob || other.role !== "prop" || !other.alive) return;
        if (Math.hypot(ob.x - body.x, ob.y - body.y) > RADAR_RADIUS) return;
        const j = () => (Math.random() * 2 - 1) * RADAR_JITTER;
        client.send(MSG_PING, { x: ob.x + j(), y: ob.y + j(), kind: "radar" } satisfies PingEvent);
      });
      this.setCooldown(client.sessionId, RADAR_COOLDOWN);
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
