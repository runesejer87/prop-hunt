import { PLAYER_RADIUS, type GameMap } from "@prop-hunt/shared";

export interface Point {
  x: number;
  y: number;
}

const G = 16;

/**
 * A walkable grid of a map, used by CPU players to find their way around.
 * Cells are 16 px; a cell is walkable if a player standing in its middle fits there.
 */
export class Nav {
  readonly cols: number;
  readonly rows: number;
  private free: Uint8Array;

  constructor(private map: GameMap) {
    this.cols = Math.floor(map.width / G);
    this.rows = Math.floor(map.height / G);
    this.free = new Uint8Array(this.cols * this.rows);
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        this.free[cy * this.cols + cx] = map.isBlocked(cx * G + G / 2, cy * G + G / 2, PLAYER_RADIUS + 1) ? 0 : 1;
      }
    }
  }

  private cellOf(x: number, y: number): [number, number] {
    return [Math.max(0, Math.min(this.cols - 1, Math.floor(x / G))), Math.max(0, Math.min(this.rows - 1, Math.floor(y / G)))];
  }

  private center(cx: number, cy: number): Point {
    return { x: cx * G + G / 2, y: cy * G + G / 2 };
  }

  isFree(x: number, y: number): boolean {
    const [cx, cy] = this.cellOf(x, y);
    return this.free[cy * this.cols + cx] === 1;
  }

  /** The closest walkable cell to a point (in case someone is standing in a squeeze). */
  nearestFree(x: number, y: number, maxRing = 8): [number, number] | undefined {
    const [sx, sy] = this.cellOf(x, y);
    if (this.free[sy * this.cols + sx]) return [sx, sy];
    for (let r = 1; r <= maxRing; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = sx + dx;
          const cy = sy + dy;
          if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
          if (this.free[cy * this.cols + cx]) return [cx, cy];
        }
      }
    }
    return undefined;
  }

  /**
   * Shortest walk from (fx, fy) to anywhere the `goal` test accepts (it gets the middle of each cell).
   * Returns the cells to walk through, or undefined if there is no way.
   */
  path(fx: number, fy: number, goal: (x: number, y: number) => boolean, maxCells = 9000): Point[] | undefined {
    const start = this.nearestFree(fx, fy);
    if (!start) return undefined;
    const prev = new Int32Array(this.cols * this.rows).fill(-2);
    const s = start[1] * this.cols + start[0];
    prev[s] = -1;
    const queue: number[] = [s];
    let head = 0;
    let end = -1;
    while (head < queue.length && head < maxCells) {
      const cur = queue[head++]!;
      const cx = cur % this.cols;
      const cy = Math.floor(cur / this.cols);
      const c = this.center(cx, cy);
      if (goal(c.x, c.y)) {
        end = cur;
        break;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const n = ny * this.cols + nx;
        if (prev[n] !== -2 || !this.free[n]) continue;
        prev[n] = cur;
        queue.push(n);
      }
    }
    if (end < 0) return undefined;
    const out: Point[] = [];
    for (let cur = end; cur >= 0; cur = prev[cur]!) out.push(this.center(cur % this.cols, Math.floor(cur / this.cols)));
    return out.reverse();
  }

  /**
   * Run away: among the places reachable within `maxSteps` cells, the one farthest from `from`.
   * Returns the walk there.
   */
  fleePath(fx: number, fy: number, from: Point, maxSteps = 34): Point[] | undefined {
    const start = this.nearestFree(fx, fy);
    if (!start) return undefined;
    const dist = new Int16Array(this.cols * this.rows).fill(-1);
    const prev = new Int32Array(this.cols * this.rows).fill(-1);
    const s = start[1] * this.cols + start[0];
    dist[s] = 0;
    const queue: number[] = [s];
    let head = 0;
    let best = s;
    let bestScore = -Infinity;
    while (head < queue.length) {
      const cur = queue[head++]!;
      const cx = cur % this.cols;
      const cy = Math.floor(cur / this.cols);
      const c = this.center(cx, cy);
      const score = Math.hypot(c.x - from.x, c.y - from.y) - dist[cur]! * 2;
      if (score > bestScore) {
        bestScore = score;
        best = cur;
      }
      if (dist[cur]! >= maxSteps) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const n = ny * this.cols + nx;
        if (dist[n] !== -1 || !this.free[n]) continue;
        dist[n] = dist[cur]! + 1;
        prev[n] = cur;
        queue.push(n);
      }
    }
    const out: Point[] = [];
    for (let cur = best; cur >= 0; cur = prev[cur]!) out.push(this.center(cur % this.cols, Math.floor(cur / this.cols)));
    return out.reverse();
  }

  /** A random walkable spot near a point, at least `minD` and at most `maxD` pixels away. */
  randomNear(x: number, y: number, minD: number, maxD: number, rng: () => number = Math.random): Point | undefined {
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2;
      const d = minD + rng() * (maxD - minD);
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (px < 0 || py < 0 || px >= this.map.width || py >= this.map.height) continue;
      if (this.isFree(px, py) && !this.map.isBlocked(px, py, PLAYER_RADIUS + 3)) return { x: px, y: py };
    }
    return undefined;
  }

  /** Is the straight line between two points clear for a player to walk? */
  lineClear(a: Point, b: Point): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 0; t <= d; t += 6) {
      const k = d === 0 ? 0 : t / d;
      if (this.map.isBlocked(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, PLAYER_RADIUS - 1)) return false;
    }
    return true;
  }
}

const cache = new Map<string, Nav>();

/** The walkable grid for a map (built once, then shared). */
export function navFor(map: GameMap): Nav {
  let nav = cache.get(map.id);
  if (!nav) {
    nav = new Nav(map);
    cache.set(map.id, nav);
  }
  return nav;
}
