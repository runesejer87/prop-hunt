import { ROOMS, TILE, MAP_COLS, MAP_ROWS, isWallTile, roomIndexAt } from "./map.ts";

/** Little picture details drawn on top of a prop's basic shape. */
export type PropDetail = "none" | "cross" | "back" | "leaves" | "shade" | "pillow" | "lines" | "globe" | "bowl";

export interface PropType {
  id: string;
  name: string;
  /** Size in pixels. */
  w: number;
  h: number;
  shape: "rect" | "circle";
  color: number;
  accent: number;
  detail: PropDetail;
  /** Can a player turn into this? Only small and medium things. */
  disguisable: boolean;
}

const t = (
  id: string,
  name: string,
  w: number,
  h: number,
  shape: "rect" | "circle",
  color: number,
  accent: number,
  detail: PropDetail = "none",
): PropType => ({ id, name, w, h, shape, color, accent, detail, disguisable: Math.max(w, h) <= 40 });

export const PROP_TYPES: Readonly<Record<string, PropType>> = Object.fromEntries(
  [
    // Small and medium: players can become these
    t("crate", "Crate", 32, 32, "rect", 0x9a6b3c, 0x6e4a26, "cross"),
    t("box", "Cardboard Box", 28, 24, "rect", 0xb8956a, 0x8a6d49, "lines"),
    t("barrel", "Barrel", 28, 28, "circle", 0x7a5230, 0x4f3420, "bowl"),
    t("plant", "Plant", 28, 28, "circle", 0x3f8f4a, 0x2a6633, "leaves"),
    t("lamp", "Lamp", 22, 22, "circle", 0xe8d28a, 0x9a8a50, "shade"),
    t("chair", "Chair", 28, 28, "rect", 0x8a5a3a, 0x5e3b24, "back"),
    t("armchair", "Armchair", 40, 40, "rect", 0x7a3f4a, 0x562a33, "back"),
    t("stool", "Stool", 22, 22, "circle", 0xa87a4a, 0x6e4e2e),
    t("trashcan", "Trash Can", 24, 24, "circle", 0x5d6670, 0x3a4048, "bowl"),
    t("vase", "Vase", 20, 20, "circle", 0x4a7fa8, 0x2f5675, "bowl"),
    t("globe", "Globe", 26, 26, "circle", 0x3f7aa8, 0x2a4f6e, "globe"),
    t("toilet", "Toilet", 24, 30, "rect", 0xe8e8ee, 0xb0b0ba, "bowl"),
    t("sink", "Sink", 28, 22, "rect", 0xdadae2, 0xa0a0aa, "bowl"),
    // Large: scenery and cover only
    t("table", "Table", 96, 56, "rect", 0x8a5a3a, 0x5e3b24),
    t("coffee_table", "Coffee Table", 56, 40, "rect", 0x7a4f30, 0x523320),
    t("sofa", "Sofa", 112, 44, "rect", 0x6a4a7a, 0x483254, "back"),
    t("tv_stand", "TV Stand", 80, 28, "rect", 0x3a3a42, 0x24242a),
    t("fridge", "Fridge", 44, 44, "rect", 0xd8dde2, 0xa0a8b0),
    t("counter", "Counter", 128, 32, "rect", 0xa89a88, 0x74695c),
    t("bed", "Bed", 80, 112, "rect", 0x5a7aa8, 0x3a5278, "pillow"),
    t("dresser", "Dresser", 64, 32, "rect", 0x8a6a48, 0x5e4630, "lines"),
    t("bathtub", "Bathtub", 96, 44, "rect", 0xe4eaee, 0xa8b4bc, "bowl"),
    t("desk", "Desk", 80, 44, "rect", 0x7a5a3a, 0x523b24),
    t("bookshelf", "Bookshelf", 96, 24, "rect", 0x6e4a2c, 0x46301c, "lines"),
    t("shelf", "Shelf", 96, 24, "rect", 0x6a6a72, 0x44444a, "lines"),
    t("workbench", "Workbench", 96, 36, "rect", 0x7a6a4a, 0x544a32),
    t("car", "Car", 100, 56, "rect", 0x8a2f35, 0x5c1d22, "back"),
    t("bench", "Bench", 80, 24, "rect", 0x8a6a3a, 0x5e4826),
  ].map((p) => [p.id, p]),
);

/** What goes in each room (repeats on purpose: more lookalikes to hide among). */
const ROOM_PROPS: Readonly<Record<string, readonly string[]>> = {
  Kitchen: ["fridge", "counter", "table", "chair", "chair", "stool", "trashcan", "plant", "crate", "barrel"],
  "Living Room": ["sofa", "tv_stand", "coffee_table", "armchair", "plant", "lamp", "vase", "chair", "trashcan", "crate"],
  Bedroom: ["bed", "dresser", "lamp", "chair", "plant", "trashcan", "box", "vase", "barrel"],
  Bathroom: ["bathtub", "toilet", "sink", "trashcan", "stool", "plant"],
  Hallway: ["bench", "bench", "plant", "plant", "vase", "lamp", "trashcan", "crate", "barrel", "chair", "box"],
  Study: ["desk", "bookshelf", "chair", "lamp", "plant", "trashcan", "box"],
  Garage: ["car", "workbench", "barrel", "barrel", "crate", "crate", "box", "trashcan", "stool"],
  Library: ["bookshelf", "bookshelf", "bookshelf", "armchair", "armchair", "globe", "lamp", "plant", "stool", "vase", "coffee_table"],
  Storage: ["shelf", "shelf", "crate", "crate", "crate", "barrel", "barrel", "box", "box", "trashcan", "stool"],
};

export interface PlacedProp {
  id: number;
  type: string;
  /** Centre, in pixels. */
  x: number;
  y: number;
}

/** Small seeded random generator, so server and client build the same layout. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAYOUT_SEED = 1337;
/** Keep this much free space between props so players can squeeze through. */
const AISLE = 36;

function generateProps(): PlacedProp[] {
  const rand = mulberry32(LAYOUT_SEED);
  const placed: PlacedProp[] = [];

  // Floor tiles that are not inside a room are doorways: keep them clear.
  const doorCentres: { x: number; y: number }[] = [];
  for (let row = 0; row < MAP_ROWS; row++)
    for (let col = 0; col < MAP_COLS; col++)
      if (!isWallTile(col, row) && roomIndexAt(col, row) === -1)
        doorCentres.push({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });

  for (const room of ROOMS) {
    const types = ROOM_PROPS[room.name] ?? [];
    const inRoom: PlacedProp[] = [];
    // Place the big things first: they are hardest to fit.
    const ordered = [...types].sort((a, b) => {
      const A = PROP_TYPES[a]!;
      const B = PROP_TYPES[b]!;
      return B.w * B.h - A.w * A.h;
    });
    for (const typeId of ordered) {
      const pt = PROP_TYPES[typeId]!;
      const hw = pt.w / 2;
      const hh = pt.h / 2;
      const minX = (room.x + 1) * TILE + hw;
      const maxX = (room.x + room.w - 1) * TILE - hw;
      const minY = (room.y + 1) * TILE + hh;
      const maxY = (room.y + room.h - 1) * TILE - hh;
      if (maxX < minX || maxY < minY) continue;

      for (let attempt = 0; attempt < 80; attempt++) {
        const x = Math.round(minX + rand() * (maxX - minX));
        const y = Math.round(minY + rand() * (maxY - minY));
        const nearDoor = doorCentres.some((d) => Math.abs(x - d.x) < hw + TILE * 1.5 && Math.abs(y - d.y) < hh + TILE * 1.5);
        if (nearDoor) continue;
        const overlaps = inRoom.some((o) => {
          const ot = PROP_TYPES[o.type]!;
          return Math.abs(x - o.x) < hw + ot.w / 2 + AISLE && Math.abs(y - o.y) < hh + ot.h / 2 + AISLE;
        });
        if (overlaps) continue;
        const prop = { id: placed.length, type: typeId, x, y };
        placed.push(prop);
        inRoom.push(prop);
        break;
      }
    }
  }
  return placed;
}

export const PLACED_PROPS: readonly PlacedProp[] = generateProps();

/** How close (pixels, edge of the prop) a player must be to copy it. */
export const DISGUISE_RANGE = 40;

/** The closest prop a player standing at (x, y) is allowed to turn into, if any. */
export function nearestDisguisableProp(x: number, y: number): PlacedProp | undefined {
  let best: PlacedProp | undefined;
  let bestDist = Infinity;
  for (const p of PLACED_PROPS) {
    const pt = PROP_TYPES[p.type]!;
    if (!pt.disguisable) continue;
    const dx = Math.max(Math.abs(x - p.x) - pt.w / 2, 0);
    const dy = Math.max(Math.abs(y - p.y) - pt.h / 2, 0);
    const d = Math.hypot(dx, dy);
    if (d <= DISGUISE_RANGE && d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}
