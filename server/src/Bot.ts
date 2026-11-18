import {
  PROP_TYPES,
  PLAYER_RADIUS,
  footprint,
  type BodyState,
  type GameMap,
  type PlacedProp,
  type PlayerState,
  type PingEvent,
  type InspectResult,
  type AlertMessage,
  type TauntEvent,
} from "@prop-hunt/shared";
import { navFor, type Nav, type Point } from "./Nav.ts";

/** What a CPU player is allowed to do and see. Same actions a human has. */
export interface BotApi {
  readonly map: GameMap;
  phase(): string;
  now(): number;
  player(id: string): PlayerState | undefined;
  body(id: string): BodyState | undefined;
  players(): PlayerState[];
  setInput(id: string, dx: number, dy: number): void;
  disguise(id: string): void;
  undisguise(id: string): void;
  taunt(id: string): void;
  ability(id: string): void;
  attack(id: string): void;
  inspect(id: string, on: boolean): void;
  /** Ids of props the hunter can see right now (in range and line of sight), the same rule a human hunter gets. */
  visibleTo(hunterId: string): string[];
  /** Boxes of players disguised as objects (they are solid). */
  solids(exceptId: string): { x: number; y: number; w: number; h: number }[];
}

export type BotLevel = "easy" | "normal";

const LEVEL = {
  easy: { react: 1.4, notice: 0.05, scanMax: 3, shuffle: false, taunts: false, distract: false },
  normal: { react: 0.5, notice: 0.2, scanMax: 6, shuffle: true, taunts: true, distract: true },
} as const;

interface Lead {
  x: number;
  y: number;
  r: number;
  w: number;
  at: number;
}

const boxDist = (x: number, y: number, p: PlacedProp): number => {
  const f = footprint(p.type, p.rot);
  return Math.hypot(Math.max(Math.abs(x - p.x) - f.w / 2, 0), Math.max(Math.abs(y - p.y) - f.h / 2, 0));
};

/**
 * One computer-controlled player. A CPU prop picks an object to copy, walks to it, disguises, finds a
 * spot among lookalikes and holds still; it runs if found or inspected. A CPU hunter patrols the rooms,
 * follows pings and clues, and checks objects with Inspect (it never wastes health on blind swings).
 */
export class BotBrain {
  private nav: Nav;
  private navMapId: string;
  private input = { x: 0, y: 0 };
  private sent = { x: 99, y: 99 };

  // walking
  private path: Point[] = [];
  private pathIdx = 0;
  private pathAt = -99;
  private pathAim: Point = { x: 0, y: 0 };
  private lastCheckAt = 0;
  private lastCheckPos: Point = { x: 0, y: 0 };
  private stuck = 0;

  // prop
  private pstate: "choose" | "toTarget" | "check" | "shuffle" | "hold" | "dodge" | "flee" = "choose";
  private target: PlacedProp | null = null;
  private spot: Point | null = null;
  private since = 0;
  private alerted = false;
  private avoid: Point | null = null;
  private nextTaunt = 0;
  private nextDistract = 0;

  // hunter
  private hstate: "patrol" | "lead" | "scan" | "inspect" | "chase" | "sus" = "patrol";
  private leads: Lead[] = [];
  private patrolGoal: Point | null = null;
  private visited = new Map<number, number>();
  private checked = new Set<number>();
  private scanCenter: Point | null = null;
  private scanRadius = 150;
  private scanLeft = 0;
  private inspectProp: PlacedProp | null = null;
  private inspectUntil = 0;
  private visible: string[] = [];
  private visibleAt = -99;
  private nextNoticeAt = 0;
  private nextAttackAt = 0;
  private nextRadarAt = 0;
  private susId: string | null = null;
  private susUntil = new Map<string, number>();
  private patrolSince = 0;

  constructor(
    readonly id: string,
    readonly level: BotLevel,
    private api: BotApi,
  ) {
    this.nav = navFor(api.map);
    this.navMapId = api.map.id;
  }

  private get L() {
    return LEVEL[this.level];
  }

  /** Where a player cannot stand because another player is disguised there. */
  private solidFn(): ((x: number, y: number) => boolean) | undefined {
    const rects = this.api.solids(this.id);
    if (rects.length === 0) return undefined;
    const m = PLAYER_RADIUS + 3;
    return (x, y) => rects.some((r) => Math.abs(x - r.x) < r.w / 2 + m && Math.abs(y - r.y) < r.h / 2 + m);
  }

  /** New round (or new role): forget everything. */
  reset() {
    this.sent = { x: 99, y: 99 };
    this.nav = navFor(this.api.map);
    this.navMapId = this.api.map.id;
    this.path = [];
    this.input = { x: 0, y: 0 };
    this.pstate = "choose";
    this.target = null;
    this.spot = null;
    this.alerted = false;
    this.avoid = null;
    this.nextTaunt = this.api.now() + 12 + Math.random() * 20;
    this.nextDistract = this.api.now() + 6;
    this.hstate = "patrol";
    this.leads = [];
    this.patrolGoal = null;
    this.visited.clear();
    this.checked.clear();
    this.scanCenter = null;
    this.inspectProp = null;
    this.nextRadarAt = 0;
    this.susId = null;
    this.susUntil.clear();
    this.stuck = 0;
  }

  // ---------------------------------------------------------------- hearing

  /** The same messages a human's browser would get. */
  hear(type: string, payload: unknown) {
    const now = this.api.now();
    if (type === "ping") {
      const p = payload as PingEvent;
      if (p.kind === "pulse") return;
      const w = p.kind === "radar" ? 3 : p.kind === "dust" ? 2.2 : p.kind === "noise" ? 2 : 1.5;
      this.addLead({ x: p.x, y: p.y, r: p.kind === "area" ? (p.r ?? 100) : 70, w, at: now });
    } else if (type === "taunted") {
      const t = payload as TauntEvent;
      const me = this.api.player(this.id);
      if (me?.role === "hunter") this.addLead({ x: t.x, y: t.y, r: 110, w: 2.5, at: now });
    } else if (type === "inspected") {
      const r = payload as InspectResult;
      if (r.result === "clear" && r.propId !== undefined) this.checked.add(r.propId);
    } else if (type === "alert") {
      this.alerted = (payload as AlertMessage).active;
    }
  }

  private addLead(l: Lead) {
    this.leads.push(l);
    if (this.leads.length > 6) this.leads.shift();
  }

  // -------------------------------------------------------------- the update

  update(dt: number) {
    const me = this.api.body(this.id);
    const pl = this.api.player(this.id);
    if (!me || !pl) return;
    if (this.navMapId !== this.api.map.id) this.reset();
    const phase = this.api.phase();
    if (!pl.alive || pl.role === "spectator" || phase === "lobby" || phase === "end") {
      this.stop();
      this.flush();
      return;
    }
    this.checkStuck(me);
    if (pl.role === "prop") this.updateProp(dt, me, pl, phase);
    else if (pl.role === "hunter") this.updateHunter(dt, me, pl, phase);
    this.flush();
  }

  private flush() {
    if (Math.abs(this.input.x - this.sent.x) > 0.02 || Math.abs(this.input.y - this.sent.y) > 0.02) {
      this.sent = { ...this.input };
      this.api.setInput(this.id, this.input.x, this.input.y);
    }
  }

  private stop() {
    this.input = { x: 0, y: 0 };
  }

  private setDir(from: Point, to: Point) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const l = Math.hypot(dx, dy) || 1;
    const raw = { x: dx / l, y: dy / l };
    // Turn gently instead of snapping to the new direction (no twitching at corners).
    const cur = this.input;
    if (Math.hypot(cur.x, cur.y) < 0.1) {
      this.input = raw;
      return;
    }
    const sx = cur.x * 0.65 + raw.x * 0.35;
    const sy = cur.y * 0.65 + raw.y * 0.35;
    const sl = Math.hypot(sx, sy);
    this.input = sl < 0.2 ? raw : { x: sx / sl, y: sy / sl };
  }

  private lineMode = false;

  /** Of the next few path points, the farthest one we can walk to in a straight line: smooth, no corner-hugging. */
  private lookAhead(me: BodyState, solid: ((x: number, y: number) => boolean) | undefined): Point {
    const last = this.path.length - 1;
    while (this.pathIdx < last && Math.hypot(this.path[this.pathIdx]!.x - me.x, this.path[this.pathIdx]!.y - me.y) < 14) this.pathIdx++;
    let best = this.path[this.pathIdx]!;
    for (let j = Math.min(last, this.pathIdx + 10); j > this.pathIdx; j--) {
      if (this.nav.lineClear(me, this.path[j]!, solid, 3)) {
        best = this.path[j]!;
        break;
      }
    }
    return best;
  }

  /** If we have been trying to move but have not got anywhere, shake things up. */
  private checkStuck(me: BodyState) {
    const now = this.api.now();
    if (now - this.lastCheckAt < 0.6) return;
    const moved = Math.hypot(me.x - this.lastCheckPos.x, me.y - this.lastCheckPos.y);
    const trying = Math.abs(this.input.x) + Math.abs(this.input.y) > 0.1;
    // A disguised prop only shuffles, so it moves less (and that is fine).
    const slow = me.disguise !== "";
    if (trying && moved < (slow ? 2 : 6)) this.stuck++;
    else this.stuck = 0;
    this.lastCheckAt = now;
    this.lastCheckPos = { x: me.x, y: me.y };
    if (this.stuck >= 3) {
      this.stuck = 0;
      this.path = [];
      this.onStuck();
    }
  }

  private onStuck() {
    // Pick something else to do.
    this.target = null;
    this.spot = null;
    this.patrolGoal = null;
    this.inspectProp = null;
    if (this.pstate === "toTarget" || this.pstate === "shuffle") this.pstate = this.pstate === "shuffle" ? "hold" : "choose";
    if (this.hstate === "scan" || this.hstate === "inspect" || this.hstate === "lead") this.hstate = "patrol";
  }

  /**
   * Walk toward `aim` until `arrived(x, y)` is true for where we stand. Uses a straight line when it is
   * short and clear (so we end up facing the right way), otherwise a path through the rooms.
   * Returns true once we have arrived.
   */
  private walk(me: BodyState, aim: Point, arrived: (x: number, y: number) => boolean): boolean {
    if (arrived(me.x, me.y)) {
      this.stop();
      return true;
    }
    const now = this.api.now();
    const d = Math.hypot(aim.x - me.x, aim.y - me.y);
    const solid = this.solidFn();
    // Straight line when it is short and clear (with a little slack so we do not flip between modes).
    if (d < (this.lineMode ? 150 : 100) && this.nav.lineClear(me, aim, solid)) {
      this.lineMode = true;
      this.setDir(me, aim);
      return false;
    }
    this.lineMode = false;
    const aimMoved = Math.hypot(aim.x - this.pathAim.x, aim.y - this.pathAim.y) > 50;
    if (this.path.length === 0 || now - this.pathAt > 1.5 || aimMoved) {
      this.path = this.nav.path(me.x, me.y, arrived, 9000, solid) ?? [];
      this.pathIdx = 0;
      this.pathAt = now;
      this.pathAim = { ...aim };
    }
    if (this.path.length === 0) {
      this.setDir(me, aim); // no path: just head that way
      return false;
    }
    this.setDir(me, this.lookAhead(me, solid));
    return false;
  }

  // ------------------------------------------------------------------- props

  private hunterBody(): BodyState | undefined {
    const h = this.api.players().find((p) => p.role === "hunter");
    return h ? this.api.body(h.id) : undefined;
  }

  private updateProp(dt: number, me: BodyState, pl: PlayerState, phase: string) {
    void dt;
    const now = this.api.now();
    const hb = this.hunterBody();

    // Found: run!
    if (pl.chase > 0) {
      this.pstate = "flee";
    } else if (this.pstate === "flee") {
      this.pstate = "choose";
      this.avoid = hb ? { x: hb.x, y: hb.y } : null;
      this.target = null;
    }
    // Being inspected: slip away.
    if (this.alerted && this.pstate !== "flee" && this.pstate !== "dodge") {
      this.pstate = "dodge";
      this.since = now;
      this.api.undisguise(this.id);
    }

    switch (this.pstate) {
      case "flee": {
        if (!hb) return this.stop();
        if (this.path.length === 0 || now - this.pathAt > 0.8) {
          this.path = this.nav.fleePath(me.x, me.y, hb, 34, this.solidFn()) ?? [];
          this.pathIdx = 0;
          this.pathAt = now;
        }
        this.followPath(me);
        return;
      }
      case "dodge": {
        if (!hb) {
          this.pstate = "choose";
          return;
        }
        if (this.path.length === 0 || now - this.pathAt > 1) {
          this.path = this.nav.fleePath(me.x, me.y, hb, 30, this.solidFn()) ?? [];
          this.pathIdx = 0;
          this.pathAt = now;
        }
        this.followPath(me);
        // Once the inspection is off us and we are well away, find somewhere new to hide.
        if (!this.alerted && now - this.since > 1.2 && Math.hypot(me.x - hb.x, me.y - hb.y) > 200) {
          this.pstate = "choose";
          this.avoid = { x: hb.x, y: hb.y };
          this.target = null;
          this.path = [];
        }
        return;
      }
      case "choose": {
        this.target = this.pickTarget(me);
        this.path = [];
        this.pstate = this.target ? "toTarget" : "hold";
        this.since = now;
        this.stop();
        return;
      }
      case "toTarget": {
        const t = this.target;
        if (!t) {
          this.pstate = "choose";
          return;
        }
        const arrived = this.walk(me, { x: t.x, y: t.y }, (x, y) => boxDist(x, y, t) < 22);
        if (arrived) {
          this.api.disguise(this.id);
          this.pstate = "check";
          this.since = now;
        } else if (now - this.since > 25) {
          this.pstate = "choose";
        }
        return;
      }
      case "check": {
        this.stop();
        if (now - this.since < 0.4) return;
        if (me.disguise) {
          // Two identical objects side by side give the game away: move to a spot among other lookalikes.
          this.spot = this.L.shuffle ? this.pickShuffleSpot(me) : null;
          this.pstate = this.spot ? "shuffle" : "hold";
          this.since = now;
          this.path = [];
        } else if (now - this.since > 2.6) {
          this.pstate = "choose"; // could not copy it (maybe locked out): try another
          this.avoid = null;
        }
        return;
      }
      case "shuffle": {
        const s = this.spot;
        if (!s) {
          this.pstate = "hold";
          return;
        }
        const arrived = this.walk(me, s, (x, y) => Math.hypot(x - s.x, y - s.y) < 10);
        if (arrived || now - this.since > 6) {
          this.pstate = "hold";
          this.since = now;
          this.stop();
        }
        return;
      }
      default: {
        // hold: stay perfectly still, with the odd silly sound when the hunter is far away
        this.stop();
        if (phase !== "hunt" || !hb) return;
        const d = Math.hypot(hb.x - me.x, hb.y - me.y);
        if (this.L.taunts && now > this.nextTaunt && d > 280) {
          this.api.taunt(this.id);
          this.nextTaunt = now + 25 + Math.random() * 35;
        }
        if (this.L.distract && pl.cooldown === 0 && now > this.nextDistract && d < 260) {
          this.api.ability(this.id);
          this.nextDistract = now + 4 + Math.random() * 6;
        }
      }
    }
  }

  private followPath(me: BodyState) {
    if (this.path.length === 0) return this.stop();
    const last = this.path[this.path.length - 1]!;
    if (this.pathIdx >= this.path.length - 1 && Math.hypot(last.x - me.x, last.y - me.y) < 10) return this.stop();
    this.setDir(me, this.lookAhead(me, this.solidFn()));
  }

  /** An object to copy: close by, and of a kind that appears in several places so it blends in. */
  private pickTarget(me: BodyState): PlacedProp | null {
    const props = this.api.map.props.filter((p) => !p.stacked && PROP_TYPES[p.type]!.disguisable);
    const counts = new Map<string, number>();
    for (const p of props) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    const scored = props
      .filter((p) => !this.avoid || Math.hypot(p.x - this.avoid.x, p.y - this.avoid.y) > 260)
      .map((p) => {
        const common = (counts.get(p.type) ?? 1) >= 3 ? 1.6 : 1;
        return { p, score: (Math.hypot(p.x - me.x, p.y - me.y) / common) * (0.7 + Math.random() * 0.6) };
      })
      .sort((a, b) => a.score - b.score);
    return scored.slice(0, 5)[Math.floor(Math.random() * Math.min(5, scored.length))]?.p ?? null;
  }

  /**
   * Somewhere to blend in: right next to another object of the same kind (so we look like part of a set),
   * but not on top of the one we copied. Falls back to a nearby spot.
   */
  private pickShuffleSpot(me: BodyState): Point | null {
    const type = me.disguise;
    const mates = this.api.map.props
      .filter((p) => p.type === type && !p.stacked && Math.hypot(p.x - me.x, p.y - me.y) > 40 && Math.hypot(p.x - me.x, p.y - me.y) < 320)
      .sort(() => Math.random() - 0.5);
    for (const m of mates.slice(0, 4)) {
      const f = footprint(m.type, m.rot);
      const spot = this.nav.randomNear(m.x, m.y, Math.max(f.w, f.h) / 2 + 22, Math.max(f.w, f.h) / 2 + 46);
      if (spot) return spot;
    }
    return this.nav.randomNear(me.x, me.y, 70, 150) ?? null;
  }

  // ------------------------------------------------------------------ hunter

  private refreshVisible() {
    const now = this.api.now();
    if (now - this.visibleAt < 0.25) return;
    this.visibleAt = now;
    this.visible = this.api.visibleTo(this.id);
  }

  private dbgState = "";
  private updateHunter(dt: number, me: BodyState, pl: PlayerState, phase: string) {
    void dt;
    if (process.env.BOT_DEBUG && this.dbgState !== this.hstate) {
      this.dbgState = this.hstate;
      console.log(`[bot ${this.api.now().toFixed(1)}s] hunter ${this.hstate} at ${Math.round(me.x)},${Math.round(me.y)} stuck=${this.stuck}`);
    }
    const now = this.api.now();
    if (phase !== "hunt") return this.stop();
    if (pl.inspect > 0) return this.stop();
    this.refreshVisible();

    // Mark the rooms we pass through as visited.
    const room = this.api.map.roomIndexAt(Math.floor(me.x / 32), Math.floor(me.y / 32));
    if (room >= 0) this.visited.set(room, now);

    // 1. A runner, or a prop standing about in the open: go and hit it.
    let hit: { id: string; body: BodyState } | null = null;
    for (const p of this.api.players()) {
      if (p.role !== "prop" || !p.alive) continue;
      const b = this.api.body(p.id);
      if (!b) continue;
      if (p.chase > 0 || (!b.disguise && this.visible.includes(p.id))) {
        const d = Math.hypot(b.x - me.x, b.y - me.y);
        if (!hit || d < Math.hypot(hit.body.x - me.x, hit.body.y - me.y)) hit = { id: p.id, body: b };
      }
    }
    if (hit) {
      this.hstate = "chase";
      const t = hit.body;
      this.walk(me, t, (x, y) => Math.hypot(x - t.x, y - t.y) < 30);
      if (Math.hypot(t.x - me.x, t.y - me.y) < 56 && now > this.nextAttackAt) {
        this.api.attack(this.id);
        this.nextAttackAt = now + 0.6;
      }
      return;
    }

    // 2. Something looks wrong: a copy that wobbles, or (sometimes) one that just feels off.
    if (this.hstate !== "inspect" && this.hstate !== "sus") this.looksWrong(me, now);

    // 2b. Go and check the spot that looks wrong, and hold Inspect on it.
    if (this.hstate === "sus" && this.susId) {
      const b = this.api.body(this.susId);
      if (!b || !this.api.player(this.susId)?.alive) {
        this.hstate = "patrol";
      } else {
        // Disguised players are solid, so "arrived" means close to the edge of the object, not its middle.
        const fp = b.disguise ? footprint(b.disguise, b.rot) : { w: 24, h: 24 };
        const arrived = this.walk(me, b, (x, y) => Math.hypot(Math.max(Math.abs(x - b.x) - fp.w / 2, 0), Math.max(Math.abs(y - b.y) - fp.h / 2, 0)) < 24);
        if (arrived) {
          this.api.inspect(this.id, true);
          this.inspectProp = null;
          this.inspectUntil = now + 2.3;
          this.susUntil.set(this.susId, now + 10);
          this.hstate = "inspect";
        }
        return;
      }
    }

    // 3. Mid-inspection: wait for it to finish.
    if (this.hstate === "inspect") {
      this.stop();
      if (now >= this.inspectUntil) {
        this.api.inspect(this.id, false);
        if (this.inspectProp) this.checked.add(this.inspectProp.id);
        this.inspectProp = null;
        this.hstate = this.scanLeft > 0 ? "scan" : "patrol";
      }
      return;
    }

    // 4. Use the radar when it is ready.
    if (pl.cooldown === 0 && now >= this.nextRadarAt) {
      this.api.ability(this.id);
      this.nextRadarAt = now + 2;
    }

    // 5. Follow the best fresh lead.
    this.leads = this.leads.filter((l) => now - l.at < 14);
    const lead = this.leads
      .filter((l) => now - l.at >= this.L.react)
      .sort((a, b) => b.w * 100 - (now - b.at) - (a.w * 100 - (now - a.at)))[0];
    if (lead && this.hstate !== "scan") {
      this.hstate = "lead";
      const aim = { x: lead.x, y: lead.y };
      const arrived = this.walk(me, aim, (x, y) => Math.hypot(x - aim.x, y - aim.y) < Math.max(40, Math.min(80, lead.r * 0.6)));
      if (arrived) {
        this.leads = this.leads.filter((l) => l !== lead);
        this.startScan(aim, Math.max(120, lead.r + 40));
      }
      return;
    }

    // 6. Check the objects around here, one at a time.
    if (this.hstate === "scan" && this.scanCenter) {
      const next = this.nextToCheck(me);
      if (!next || this.scanLeft <= 0) {
        this.hstate = "patrol";
        return;
      }
      const t = next;
      const arrived = this.walk(me, { x: t.x, y: t.y }, (x, y) => boxDist(x, y, t) < 26);
      if (arrived) {
        // We walked straight at it, so we are facing it: hold Inspect.
        this.api.inspect(this.id, true);
        this.inspectProp = t;
        this.inspectUntil = now + 2.3;
        this.scanLeft--;
        this.hstate = "inspect";
      }
      return;
    }

    // 7. Otherwise, patrol the rooms.
    this.patrol(me, now);
  }

  private startScan(at: Point, radius: number) {
    this.scanCenter = at;
    this.scanRadius = radius;
    this.scanLeft = this.L.scanMax;
    this.hstate = "scan";
    this.path = [];
  }

  /** The nearest object near the scan spot that we have not checked. */
  private nextToCheck(me: BodyState): PlacedProp | undefined {
    const c = this.scanCenter!;
    return this.api.map.props
      .filter((p) => !p.stacked && PROP_TYPES[p.type]!.disguisable && !this.checked.has(p.id) && Math.hypot(p.x - c.x, p.y - c.y) < this.scanRadius)
      .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  }

  /** A disguised player that is visible and wobbling gives themselves away; sometimes a settled one feels odd. */
  private looksWrong(me: BodyState, now: number) {
    for (const p of this.api.players()) {
      if (p.role !== "prop" || !p.alive || !this.visible.includes(p.id)) continue;
      if (now < (this.susUntil.get(p.id) ?? 0)) continue;
      const b = this.api.body(p.id);
      if (!b || !b.disguise) continue;
      const d = Math.hypot(b.x - me.x, b.y - me.y);
      const wobbling = !b.settled;
      const feelsOff = now >= this.nextNoticeAt && d < 170 && Math.random() < this.L.notice;
      if (d < 220 && (wobbling || feelsOff)) {
        this.susId = p.id;
        this.hstate = "sus";
        this.path = [];
        this.nextNoticeAt = now + 3;
        return;
      }
      if (now >= this.nextNoticeAt) this.nextNoticeAt = now + 2.5;
    }
  }

  private patrol(me: BodyState, now: number) {
    this.hstate = "patrol";
    if (!this.patrolGoal) {
      // Head for the room we have not visited for the longest time.
      const rooms = this.api.map.rooms.map((r, i) => ({ r, i, t: this.visited.get(i) ?? -999 + Math.random() * 40 }));
      rooms.sort((a, b) => a.t - b.t);
      const pick = rooms[Math.floor(Math.random() * Math.min(2, rooms.length))]!;
      const c = this.api.map.roomCenter(pick.r);
      this.patrolGoal = this.nav.randomNear(c.x, c.y, 0, Math.min(pick.r.w, pick.r.h) * 12) ?? c;
      this.patrolSince = now;
      this.path = [];
    }
    const g = this.patrolGoal;
    const arrived = this.walk(me, g, (x, y) => Math.hypot(x - g.x, y - g.y) < 28);
    if (arrived || now - this.patrolSince > 40) {
      this.patrolGoal = null;
      this.startScan(g, 170);
    }
  }
}
