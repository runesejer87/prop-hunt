import { ROOMS } from "./map.ts";

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
    t("nightstand", "Nightstand", 28, 28, "rect", 0x8a6a48, 0x5e4630, "lines"),
    t("basket", "Laundry Basket", 26, 26, "circle", 0xc9a566, 0x8a6e3a),
    t("toolbox", "Toolbox", 30, 20, "rect", 0xc43a3a, 0x7a2222),
    t("tire", "Tire", 28, 28, "circle", 0x2a2a2e, 0x15151a),
    t("bucket", "Bucket", 20, 20, "circle", 0x4a7fa8, 0x2f5675),
    t("cabinet", "Filing Cabinet", 28, 28, "rect", 0x8a929c, 0x5a626c, "lines"),
    t("umbrella", "Umbrella Stand", 18, 18, "circle", 0x3a3f4a, 0x22262e),
    // Large: scenery and cover only
    t("wardrobe", "Wardrobe", 64, 28, "rect", 0x6e4a2c, 0x46301c),
    t("shower", "Shower", 44, 44, "rect", 0xcfe3ee, 0x8fb0c4),
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

/** A quarter-turn count: 0 faces south (down), 1 faces west, 2 faces north, 3 faces east. */
export type Rot = 0 | 1 | 2 | 3;

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

/** Width and height on the map once turned (sideways objects swap them). */
export function footprint(typeId: string, rot: number): { w: number; h: number } {
  const pt = PROP_TYPES[typeId]!;
  return rot % 2 === 1 ? { w: pt.h, h: pt.w } : { w: pt.w, h: pt.h };
}

type Item = readonly [type: string, x: number, y: number, rot?: Rot, stacked?: boolean];

/**
 * Every room, furnished by hand. Coordinates are map pixels (the centre of each object).
 * Each room has a job: the kitchen cooks, the bedroom sleeps. Furniture sits against walls
 * or around a focus (sofa faces the TV, chairs face the table). Common small things
 * (chairs, plants, lamps, crates...) turn up in several rooms so hiders have lookalikes;
 * themed things (toilet, tire, globe...) belong to one room, so they look odd elsewhere.
 * A prop's front faces south at rotation 0.
 */
const LAYOUT: Readonly<Record<string, readonly Item[]>> = {
  // Cooking and eating
  Kitchen: [
    ["counter", 100, 48],
    ["fridge", 192, 54],
    ["trashcan", 192, 94],
    ["counter", 278, 48],
    ["plant", 456, 56],
    ["counter", 48, 160, 1],
    ["stool", 90, 140],
    ["stool", 90, 182],
    ["table", 290, 190],
    ["chair", 262, 146, 0],
    ["chair", 318, 146, 0],
    ["chair", 262, 234, 2],
    ["chair", 318, 234, 2],
    ["vase", 290, 190, 0, true],
    ["crate", 54, 288],
    ["box", 94, 298],
  ],
  // Lounging in front of the TV
  "Living Room": [
    ["tv_stand", 768, 46],
    ["coffee_table", 768, 130],
    ["sofa", 768, 198, 2],
    ["armchair", 668, 130, 3],
    ["armchair", 868, 130, 1],
    ["lamp", 696, 200],
    ["lamp", 840, 200],
    ["bookshelf", 600, 44],
    ["bookshelf", 936, 44],
    ["armchair", 988, 98, 1],
    ["lamp", 1000, 62],
    ["plant", 545, 296],
    ["plant", 1000, 298],
    ["dresser", 620, 304, 2],
    ["vase", 620, 304, 0, true],
  ],
  // Sleeping
  Bedroom: [
    ["bed", 1280, 90],
    ["nightstand", 1222, 50],
    ["nightstand", 1338, 50],
    ["lamp", 1222, 50, 0, true],
    ["lamp", 1338, 50, 0, true],
    ["bench", 1280, 166],
    ["desk", 1330, 298, 2],
    ["chair", 1330, 254, 0],
    ["wardrobe", 1130, 46],
    ["wardrobe", 1430, 46],
    ["dresser", 1488, 200, 3],
    ["armchair", 1436, 258, 1],
    ["lamp", 1222, 302],
    ["plant", 1470, 120],
    ["basket", 1190, 296],
    ["trashcan", 1262, 300],
  ],
  // Washing
  Bathroom: [
    ["sink", 60, 366],
    ["sink", 96, 366],
    ["toilet", 47, 540, 3],
    ["bathtub", 110, 614],
    ["shower", 204, 612],
    ["basket", 292, 606],
    ["trashcan", 292, 548],
    ["plant", 296, 384],
  ],
  // The entrance hall: places to sit and wait, coats and umbrellas
  Hallway: [
    ["bench", 498, 364],
    ["plant", 590, 372],
    ["umbrella", 630, 368],
    ["lamp", 668, 368],
    ["dresser", 860, 368, 0],
    ["vase", 860, 368, 0, true],
    ["plant", 940, 372],
    ["bench", 1010, 364],
    ["lamp", 1062, 368],
    ["bench", 498, 628, 2],
    ["plant", 590, 620],
    ["umbrella", 630, 624],
    ["lamp", 668, 624],
    ["dresser", 860, 624, 2],
    ["vase", 860, 624, 0, true],
    ["plant", 940, 620],
    ["bench", 1010, 628, 2],
    ["lamp", 1062, 624],
    ["table", 768, 496],
    ["vase", 744, 496, 0, true],
    ["vase", 792, 496, 0, true],
    ["plant", 372, 560],
    ["plant", 1166, 560],
    ["trashcan", 400, 420],
    ["crate", 1130, 420],
  ],
  // Working
  Study: [
    ["bookshelf", 1268, 364],
    ["desk", 1360, 376],
    ["chair", 1360, 416, 2],
    ["bookshelf", 1452, 364],
    ["bookshelf", 1492, 470, 1],
    ["trashcan", 1308, 408],
    ["globe", 1470, 540],
    ["armchair", 1448, 582, 1],
    ["lamp", 1250, 420],
    ["cabinet", 1240, 560],
    ["cabinet", 1240, 592],
    ["plant", 1240, 622],
  ],
  // Cars and tools
  Garage: [
    ["workbench", 110, 692],
    ["stool", 110, 728],
    ["toolbox", 180, 722],
    ["shelf", 216, 686],
    ["shelf", 316, 686],
    ["car", 170, 850],
    ["tire", 52, 790],
    ["tire", 52, 822],
    ["tire", 52, 854],
    ["barrel", 452, 764],
    ["workbench", 462, 925, 3],
    ["toolbox", 418, 925],
    ["stool", 418, 890],
    ["crate", 56, 964],
    ["crate", 92, 964],
    ["crate", 56, 928],
    ["box", 94, 932],
    ["shelf", 250, 978, 2],
    ["bucket", 330, 972],
    ["bucket", 358, 972],
    ["trashcan", 300, 735],
  ],
  // Books and quiet reading
  Library: [
    ["bookshelf", 562, 686],
    ["bookshelf", 864, 686],
    ["bookshelf", 960, 686],
    ["bookshelf", 524, 746, 1],
    ["bookshelf", 524, 930, 1],
    ["bookshelf", 1012, 746, 3],
    ["bookshelf", 1012, 930, 3],
    ["bookshelf", 700, 978, 2],
    ["bookshelf", 820, 978, 2],
    ["coffee_table", 768, 826],
    ["armchair", 700, 826, 3],
    ["armchair", 836, 826, 1],
    ["sofa", 768, 884, 2],
    ["lamp", 696, 892],
    ["lamp", 840, 892],
    ["desk", 628, 800],
    ["chair", 628, 842, 2],
    ["desk", 908, 800],
    ["chair", 908, 842, 2],
    ["globe", 700, 772],
    ["plant", 550, 968],
    ["plant", 972, 968],
  ],
  // Boxes and shelving
  Storage: [
    ["shelf", 1222, 686],
    ["crate", 1286, 694],
    ["shelf", 1180, 790, 1],
    ["shelf", 1180, 930, 1],
    ["shelf", 1260, 790, 1],
    ["shelf", 1260, 930, 1],
    ["shelf", 1340, 790, 1],
    ["shelf", 1340, 930, 1],
    ["crate", 1488, 716],
    ["crate", 1488, 750],
    ["crate", 1488, 784],
    ["barrel", 1486, 824],
    ["box", 1488, 862],
    ["box", 1488, 894],
    ["crate", 1488, 932],
    ["barrel", 1486, 970],
    ["shelf", 1108, 978, 2],
    ["bucket", 1400, 980],
    ["bucket", 1422, 972],
    ["trashcan", 1100, 742],
  ],
};

export const PLACED_PROPS: readonly PlacedProp[] = (() => {
  const out: PlacedProp[] = [];
  for (const room of ROOMS) {
    for (const [type, x, y, rot, stacked] of LAYOUT[room.name] ?? []) {
      out.push({ id: out.length, type, x, y, rot: rot ?? 0, ...(stacked ? { stacked: true } : {}) });
    }
  }
  return out;
})();

/** How close (pixels, edge of the prop) a player must be to copy it. */
export const DISGUISE_RANGE = 40;

/** The closest prop a player standing at (x, y) is allowed to turn into, if any. */
export function nearestDisguisableProp(x: number, y: number): PlacedProp | undefined {
  let best: PlacedProp | undefined;
  let bestDist = Infinity;
  for (const p of PLACED_PROPS) {
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
