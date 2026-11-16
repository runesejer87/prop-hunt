/**
 * The game map. Defined once here so the server (collision, spawns) and the
 * client (drawing) always agree. Coordinates in "tiles" unless noted.
 */

export const TILE = 32;
export const MAP_COLS = 48;
export const MAP_ROWS = 32;
export const WORLD_WIDTH = MAP_COLS * TILE;
export const WORLD_HEIGHT = MAP_ROWS * TILE;

export interface Room {
  name: string;
  /** Top-left tile and size, in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Floor colour (0xRRGGBB). */
  color: number;
}

/** A gap in a wall that connects two rooms. */
interface Door {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ROOMS: readonly Room[] = [
  { name: "Kitchen", x: 1, y: 1, w: 14, h: 9, color: 0x3d4a3a },
  { name: "Living Room", x: 16, y: 1, w: 16, h: 9, color: 0x4a3f36 },
  { name: "Bedroom", x: 33, y: 1, w: 14, h: 9, color: 0x3a3f52 },
  { name: "Bathroom", x: 1, y: 11, w: 9, h: 9, color: 0x34505a },
  { name: "Hallway", x: 11, y: 11, w: 26, h: 9, color: 0x45454d },
  { name: "Study", x: 38, y: 11, w: 9, h: 9, color: 0x52403a },
  { name: "Garage", x: 1, y: 21, w: 14, h: 10, color: 0x3c3c3c },
  { name: "Library", x: 16, y: 21, w: 16, h: 10, color: 0x4d3a45 },
  { name: "Storage", x: 33, y: 21, w: 14, h: 10, color: 0x4a4a36 },
];

const DOORS: readonly Door[] = [
  // Between rooms on the top row
  { x: 15, y: 4, w: 1, h: 2 },
  { x: 32, y: 4, w: 1, h: 2 },
  // Between rooms on the middle row
  { x: 10, y: 14, w: 1, h: 2 },
  { x: 37, y: 14, w: 1, h: 2 },
  // Between rooms on the bottom row
  { x: 15, y: 25, w: 1, h: 2 },
  { x: 32, y: 25, w: 1, h: 2 },
  // Top row <-> middle row
  { x: 4, y: 10, w: 2, h: 1 },
  { x: 12, y: 10, w: 2, h: 1 },
  { x: 22, y: 10, w: 3, h: 1 },
  { x: 34, y: 10, w: 2, h: 1 },
  // Middle row <-> bottom row
  { x: 12, y: 20, w: 2, h: 1 },
  { x: 22, y: 20, w: 3, h: 1 },
  { x: 34, y: 20, w: 2, h: 1 },
  { x: 41, y: 20, w: 2, h: 1 },
];

export const TILE_FLOOR = 0;
export const TILE_WALL = 1;

/** MAP_ROWS * MAP_COLS tiles, row by row. */
export const TILES: Uint8Array = (() => {
  const t = new Uint8Array(MAP_COLS * MAP_ROWS).fill(TILE_WALL);
  const carve = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) t[j * MAP_COLS + i] = TILE_FLOOR;
  };
  for (const r of ROOMS) carve(r.x, r.y, r.w, r.h);
  for (const d of DOORS) carve(d.x, d.y, d.w, d.h);
  return t;
})();

export function isWallTile(col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) return true;
  return TILES[row * MAP_COLS + col] === TILE_WALL;
}

/** Index of the room at this tile, or -1 (wall / doorway). */
export function roomIndexAt(col: number, row: number): number {
  return ROOMS.findIndex((r) => col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h);
}

/** Centre of a room in pixels, used for spawning. */
export function roomCenter(room: Room): { x: number; y: number } {
  return { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE };
}
