
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
    t("printer", "Printer", 36, 30, "rect", 0xd9dde3, 0x9aa0aa),
    t("cooler", "Water Cooler", 20, 20, "circle", 0x6fb6e8, 0x3f86b8),
    t("vending", "Vending Machine", 38, 34, "rect", 0xc43a3a, 0x7a2222),
    t("cafe_table", "Cafe Table", 36, 36, "circle", 0xe8e2d4, 0xb04a4a),
    t("jukebox", "Jukebox", 36, 28, "rect", 0xc9453a, 0x7a2a22),
    // Large: scenery and cover only
    t("booth", "Booth", 80, 40, "rect", 0xb03a3a, 0x7a2424),
    t("pool_table", "Pool Table", 112, 64, "rect", 0x2f7a4a, 0x5a3a22),
    t("partition", "Partition", 80, 10, "rect", 0x8a93a6, 0x59627a),
    t("divider", "Cubicle Divider", 40, 10, "rect", 0x8a93a6, 0x59627a),
    t("server_rack", "Server Rack", 34, 44, "rect", 0x2c3038, 0x15181e),
    t("reception_desk", "Reception Desk", 120, 40, "rect", 0x8a6a4a, 0x5e4630),
    t("conference_table", "Conference Table", 150, 64, "rect", 0x6e4a2c, 0x46301c),
    t("whiteboard", "Whiteboard", 96, 10, "rect", 0xf2f4f8, 0x8a93a6),
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

/** Width and height on the map once turned (sideways objects swap them). */
export function footprint(typeId: string, rot: number): { w: number; h: number } {
  const pt = PROP_TYPES[typeId]!;
  return rot % 2 === 1 ? { w: pt.h, h: pt.w } : { w: pt.w, h: pt.h };
}

/** How close (pixels, edge of the prop) a player must be to copy it. */
export const DISGUISE_RANGE = 40;
