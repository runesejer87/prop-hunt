import { Room, type Client } from "colyseus";
import {
  GameState,
  PlayerState,
  InputMessage,
  AttackMessage,
  SwingEvent,
  MSG_INPUT,
  MSG_DISGUISE,
  MSG_UNDISGUISE,
  MSG_ATTACK,
  MSG_SWING,
  PROP_TYPES,
  PLACED_PROPS,
  nearestDisguisableProp,
  isBlocked,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TICK_RATE,
  PLAYER_SPEED,
  PLAYER_RADIUS,
  ROOMS,
  TILE,
  roomCenter,
  moveWithCollision,
  LOBBY_COUNTDOWN,
  HIDE_TIME,
  HUNT_TIME,
  END_TIME,
  HUNTER_MAX_HP,
  WRONG_HIT_PENALTY,
  ATTACK_RANGE,
  ATTACK_COOLDOWN,
  SETTLE_TIME,
  type Phase,
} from "@prop-hunt/shared";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class PropHuntRoom extends Room<{ state: GameState }> {
  maxClients = MAX_PLAYERS;
  state = new GameState();

  /** Latest input per player; the server decides the real movement. */
  private moveInputs = new Map<string, InputMessage>();
  /** Seconds left (with decimals) in the current phase. */
  private clockLeft = 0;
  private attackReadyAt = 0;
  /** Seconds each disguised prop has been standing still. */
  private stillFor = new Map<string, number>();

  messages = {
    [MSG_INPUT]: (client: Client, msg: InputMessage) => {
      this.moveInputs.set(client.sessionId, {
        dx: clamp(Math.sign(Number(msg?.dx) || 0), -1, 1),
        dy: clamp(Math.sign(Number(msg?.dy) || 0), -1, 1),
      });
    },
    [MSG_DISGUISE]: (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.role !== "prop" || !player.alive) return;
      const prop = nearestDisguisableProp(player.x, player.y);
      if (prop && PROP_TYPES[prop.type]) {
        if (player.disguise !== prop.type) this.stillFor.set(client.sessionId, 0);
        player.disguise = prop.type;
      }
    },
    [MSG_UNDISGUISE]: (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) this.clearDisguise(player);
    },
    [MSG_ATTACK]: (client: Client, msg: AttackMessage) => this.handleAttack(client.sessionId, msg),
  };

  onCreate() {
    this.state.phase = "lobby";
    this.state.timeLeft = 0;
    this.state.winner = "";
    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), 1000 / TICK_RATE);
  }

  onJoin(client: Client) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = `Player ${this.clients.length}`;
    player.disguise = "";
    player.settled = false;
    player.hp = HUNTER_MAX_HP;
    // Joining mid-round: watch until the next one starts.
    const inRound = this.state.phase !== "lobby";
    player.role = inRound ? "spectator" : "prop";
    player.alive = !inRound;
    this.placeRandomly(player);
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
    this.stillFor.delete(client.sessionId);
  }

  private clearDisguise(player: PlayerState) {
    player.disguise = "";
    player.settled = false;
    this.stillFor.delete(player.id);
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
    const hunterIndex = Math.floor(Math.random() * all.length);
    all.forEach((p, i) => {
      p.role = i === hunterIndex ? "hunter" : "prop";
      p.alive = true;
      this.clearDisguise(p);
      p.hp = HUNTER_MAX_HP;
      if (p.role === "hunter") {
        // The hunter starts in the middle of the hallway.
        const hall = ROOMS.find((r) => r.name === "Hallway")!;
        const c = roomCenter(hall);
        p.x = c.x;
        p.y = c.y;
        this.nudgeToFreeSpot(p);
      } else {
        this.placeRandomly(p);
      }
    });
    this.moveInputs.clear();
    this.state.winner = "";
    this.setPhase("hide", HIDE_TIME);
  }

  private endRound(winner: "props" | "hunter") {
    this.state.winner = winner;
    this.setPhase("end", END_TIME);
  }

  private backToLobby() {
    for (const p of this.players()) {
      p.role = "prop";
      p.alive = true;
      this.clearDisguise(p);
      p.hp = HUNTER_MAX_HP;
      this.placeRandomly(p);
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
      } else if (phase === "end" && this.clockLeft <= 0) {
        this.backToLobby();
      } else if (phase === "hide" || phase === "hunt") {
        this.checkRoundOver(players);
        if (phase === "hunt" && this.state.phase === "hunt" && this.clockLeft <= 0) this.endRound("props");
      }
    }

    this.movePlayers(dt);
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
    if (!hunter || hunter.role !== "hunter" || this.state.phase !== "hunt") return;
    const now = this.clock.currentTime / 1000;
    if (now < this.attackReadyAt) return;
    this.attackReadyAt = now + ATTACK_COOLDOWN;

    // Aim point, limited to the hunter's reach.
    let ax = Number(msg?.x);
    let ay = Number(msg?.y);
    if (!Number.isFinite(ax) || !Number.isFinite(ay)) return;
    const dist = Math.hypot(ax - hunter.x, ay - hunter.y);
    if (dist > ATTACK_RANGE) {
      ax = hunter.x + ((ax - hunter.x) / dist) * ATTACK_RANGE;
      ay = hunter.y + ((ay - hunter.y) / dist) * ATTACK_RANGE;
    }

    // Everything the swing could land on: set pieces and hiding players.
    type Hit = { kind: "prop" | "player"; d: number; player?: PlayerState };
    let best: Hit | undefined;
    const consider = (hit: Hit) => {
      if (!best || hit.d < best.d) best = hit;
    };
    const SLOP = 6;
    for (const p of PLACED_PROPS) {
      const pt = PROP_TYPES[p.type]!;
      if (Math.abs(ax - p.x) <= pt.w / 2 + SLOP && Math.abs(ay - p.y) <= pt.h / 2 + SLOP)
        consider({ kind: "prop", d: Math.hypot(ax - p.x, ay - p.y) });
    }
    for (const pl of this.players()) {
      if (pl.role !== "prop" || !pl.alive) continue;
      const pt = pl.disguise ? PROP_TYPES[pl.disguise] : undefined;
      const hw = (pt ? pt.w : PLAYER_RADIUS * 2) / 2 + SLOP;
      const hh = (pt ? pt.h : PLAYER_RADIUS * 2) / 2 + SLOP;
      if (Math.abs(ax - pl.x) <= hw && Math.abs(ay - pl.y) <= hh)
        // Players win ties: a player standing next to their copy is in front.
        consider({ kind: "player", d: Math.hypot(ax - pl.x, ay - pl.y) - 0.5, player: pl });
    }

    const hit = best as Hit | undefined;
    let result: SwingEvent["result"] = "nothing";
    if (hit?.kind === "player" && hit.player) {
      hit.player.alive = false;
      this.clearDisguise(hit.player);
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
    this.state.players.forEach((player, id) => {
      if (frozen && player.role === "hunter") return; // hunter waits while props hide
      const input = this.moveInputs.get(id);
      const moving = !!input && (input.dx !== 0 || input.dy !== 0);

      // Props that stand still for a moment settle into a perfect copy.
      if (player.disguise) {
        const still = moving ? 0 : (this.stillFor.get(id) ?? 0) + dt;
        this.stillFor.set(id, still);
        const settled = still >= SETTLE_TIME;
        if (player.settled !== settled) player.settled = settled;
      }

      if (!input || !moving) return;
      // Normalise so diagonal movement isn't faster.
      const len = Math.hypot(input.dx, input.dy);
      const step = PLAYER_SPEED * dt;
      const next = moveWithCollision(player.x, player.y, (input.dx / len) * step, (input.dy / len) * step, PLAYER_RADIUS);
      player.x = next.x;
      player.y = next.y;
    });
  }

  /** Put a player on a random open spot in a random room. */
  private placeRandomly(player: PlayerState) {
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
        return;
      }
    }
  }

  /** If the spot is taken, look for a free one nearby. */
  private nudgeToFreeSpot(player: PlayerState) {
    for (let r = 0; r < 200; r += 8) {
      for (let a = 0; a < 8; a++) {
        const x = player.x + Math.cos((a * Math.PI) / 4) * r;
        const y = player.y + Math.sin((a * Math.PI) / 4) * r;
        if (!isBlocked(x, y, PLAYER_RADIUS + 2)) {
          player.x = x;
          player.y = y;
          return;
        }
      }
    }
  }
}
