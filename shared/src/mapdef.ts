/** Plain data describing a map. Everything about a map lives here; GameMap turns it into something playable. */

/** A quarter-turn count: 0 faces south (down), 1 faces west, 2 faces north, 3 faces east. */
export type Rot = 0 | 1 | 2 | 3;

export type FloorKind = "wood" | "tile" | "smalltile" | "carpet" | "concrete";

export interface Room {
  name: string;
  /** Top-left tile and size, in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Floor colour (0xRRGGBB). */
  color: number;
  floor: FloorKind;
}

/** A gap in a wall that connects two rooms (tiles). */
export interface Door {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** [object type, x, y, turns, stacked] with x and y in map pixels (the centre of the object). */
export type Item = readonly [type: string, x: number, y: number, rot?: Rot, stacked?: boolean];

/** A rug or mat on the floor, in map pixels. Decoration only. */
export interface Rug {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

export interface MapDef {
  id: string;
  name: string;
  /** Size in tiles. */
  cols: number;
  rows: number;
  rooms: Room[];
  doors: Door[];
  /** Furniture per room, keyed by room name. */
  layout: Record<string, Item[]>;
  rugs: Rug[];
  /** Where to write each room's name on the floor (map pixels). */
  labels: Record<string, [number, number]>;
  /** The hunter starts in this room. */
  hunterStart: string;
}
