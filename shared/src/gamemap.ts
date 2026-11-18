import type { MapDef, Room, Rot } from "./mapdef.ts";
import { PROP_TYPES, footprint, DISGUISE_RANGE } from "./props.ts";
import { HOUSE } from "./maps/house.ts";
import { OFFICE } from "./maps/office.ts";
import { DINER } from "./maps/diner.ts";

export const TILE = 32;

export interface PlacedProp {
  id: number;
  type: string;
  /** Centre, in pixels. */
  x: number;
  y: number;
  rot: Rot;
  /** Sits on top of another object (a vase on a table), so it may overlap. */
  stacked?: boolean;
}

export const TILE_FLOOR = 0;
export const TILE_WALL = 1;

/** A box that blocks sight: a wall tile or a large piece of furniture. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A playable map: walls, rooms and furniture, with the rules that depend on them
 * (collision, which object you can copy). The server and each browser build one from the same data.
 */
export class GameMap {
  readonly id: string;
  readonly name: string;
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  readonly rooms: readonly Room[];
  readonly def: MapDef;
  /** cols * rows tiles, row by row. */
  readonly tiles: Uint8Array;
  readonly props: readonly PlacedProp[];
  /** Big furniture that blocks sight. */
  readonly bigProps: readonly Box[];

  constructor(def: MapDef) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.cols = def.cols;
    this.rows = def.rows;
    this.width = def.cols * TILE;
    this.height = def.rows * TILE;
    this.rooms = def.rooms;

    const t = new Uint8Array(def.cols * def.rows).fill(TILE_WALL);
    const carve = (x: number, y: number, w: number, h: number) => {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) t[j * def.cols + i] = TILE_FLOOR;
    };
    for (const r of def.rooms) carve(r.x, r.y, r.w, r.h);
    for (const d of def.doors) carve(d.x, d.y, d.w, d.h);
    this.tiles = t;

    const props: PlacedProp[] = [];
    for (const room of def.rooms) {
      for (const [type, x, y, rot, stacked] of def.layout[room.name] ?? []) {
        if (!PROP_TYPES[type]) throw new Error(`Map ${def.id}: unknown object "${type}" in ${room.name}`);
        props.push({ id: props.length, type, x, y, rot: rot ?? 0, ...(stacked ? { stacked: true } : {}) });
      }
    }
    this.props = props;
    this.bigProps = props
      .filter((p) => !PROP_TYPES[p.type]!.disguisable)
      .map((p) => {
        const { w, h } = footprint(p.type, p.rot);
        return { x: p.x - w / 2, y: p.y - h / 2, w, h };
      });
  }

  isWallTile(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true;
    return this.tiles[row * this.cols + col] === TILE_WALL;
  }

  /** Index of the room at this tile, or -1 (wall / doorway). */
  roomIndexAt(col: number, row: number): number {
    return this.rooms.findIndex((r) => col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h);
  }

  /** Centre of a room in pixels. */
  roomCenter(room: Room): { x: number; y: number } {
    return { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE };
  }

  /** Does a square of half-size `r`, centred at (x, y) pixels, touch a wall or a prop? */
  isBlocked(x: number, y: number, r: number): boolean {
    const c0 = Math.floor((x - r) / TILE);
    const c1 = Math.floor((x + r) / TILE);
    const r0 = Math.floor((y - r) / TILE);
    const r1 = Math.floor((y + r) / TILE);
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) if (this.isWallTile(i, j)) return true;

    for (const p of this.props) {
      if (p.stacked) continue; // sits on something that already blocks
      const { w, h } = footprint(p.type, p.rot);
      if (Math.abs(x - p.x) < w / 2 + r && Math.abs(y - p.y) < h / 2 + r) return true;
    }
    return false;
  }

  /**
   * Move from (x, y) by (dx, dy) pixels, sliding along walls and props.
   * Used by the server and by the client's own-movement prediction.
   */
  moveWithCollision(
    x: number,
    y: number,
    dx: number,
    dy: number,
    radius: number,
    /** Extra things that block, e.g. players disguised as objects. Whoever already stands inside one may still walk out. */
    extra?: (x: number, y: number, r: number) => boolean,
  ): { x: number; y: number } {
    const stuck = extra ? extra(x, y, radius) : false;
    const blocked = (px: number, py: number) => this.isBlocked(px, py, radius) || (!!extra && !stuck && extra(px, py, radius));
    let nx = x;
    let ny = y;
    if (!blocked(x + dx, y)) nx = x + dx;
    if (!blocked(nx, y + dy)) ny = y + dy;
    return { x: nx, y: ny };
  }

  /** The closest prop a player standing at (x, y) is allowed to turn into, if any. */
  nearestDisguisableProp(x: number, y: number): PlacedProp | undefined {
    let best: PlacedProp | undefined;
    let bestDist = Infinity;
    for (const p of this.props) {
      const pt = PROP_TYPES[p.type]!;
      if (!pt.disguisable) continue;
      const { w, h } = footprint(p.type, p.rot);
      const dx = Math.max(Math.abs(x - p.x) - w / 2, 0);
      const dy = Math.max(Math.abs(y - p.y) - h / 2, 0);
      const d = Math.hypot(dx, dy);
      if (d <= DISGUISE_RANGE && d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------- registry

/** Every map in the game. Add new maps here. */
export const MAP_DEFS: readonly MapDef[] = [HOUSE, OFFICE, DINER];
export const MAP_IDS: readonly string[] = MAP_DEFS.map((m) => m.id);
export const DEFAULT_MAP_ID = MAP_DEFS[0]!.id;

const cache = new Map<string, GameMap>();

/** The map with this id (built once, then shared). Unknown ids give the default map. */
export function getMap(id: string): GameMap {
  const def = MAP_DEFS.find((m) => m.id === id) ?? MAP_DEFS[0]!;
  let map = cache.get(def.id);
  if (!map) {
    map = new GameMap(def);
    cache.set(def.id, map);
  }
  return map;
}
