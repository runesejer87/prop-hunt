import type { Door, Item, MapDef, Room, Rug } from "../mapdef.ts";

/**
 * The house: nine rooms around a central hallway. Furnished by hand.
 * Coordinates are map pixels (the centre of each object). Each room has a job:
 * the kitchen cooks, the bedroom sleeps. Furniture sits against walls or around a focus
 * (sofa faces the TV, chairs face the table). Common small things (chairs, plants, lamps, crates...)
 * turn up in several rooms so hiders have lookalikes; themed things (toilet, tire, globe...)
 * belong to one room, so they look odd elsewhere. A prop's front faces south at rotation 0.
 */
const rooms: Room[] = [
  { name: "Kitchen", x: 1, y: 1, w: 14, h: 9, color: 0x3d4a3a, floor: "tile" },
  { name: "Living Room", x: 16, y: 1, w: 16, h: 9, color: 0x4a3f36, floor: "wood" },
  { name: "Bedroom", x: 33, y: 1, w: 14, h: 9, color: 0x3a3f52, floor: "carpet" },
  { name: "Bathroom", x: 1, y: 11, w: 9, h: 9, color: 0x34505a, floor: "smalltile" },
  { name: "Hallway", x: 11, y: 11, w: 26, h: 9, color: 0x45454d, floor: "wood" },
  { name: "Study", x: 38, y: 11, w: 9, h: 9, color: 0x52403a, floor: "wood" },
  { name: "Garage", x: 1, y: 21, w: 14, h: 10, color: 0x3c3c3c, floor: "concrete" },
  { name: "Library", x: 16, y: 21, w: 16, h: 10, color: 0x4d3a45, floor: "carpet" },
  { name: "Storage", x: 33, y: 21, w: 14, h: 10, color: 0x4a4a36, floor: "concrete" },
];


const doors: Door[] = [
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


const layout: Record<string, Item[]> = {
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


  const rugs: Rug[] = [
  { x: 768, y: 164, w: 300, h: 176, color: 0x8a4a3a }, // living room, under the sofa and coffee table
  { x: 1280, y: 206, w: 236, h: 150, color: 0x5a6e92 }, // bedroom, beside the bed
  { x: 768, y: 852, w: 270, h: 140, color: 0x7a3a4a }, // library reading corner
  { x: 1360, y: 424, w: 140, h: 84, color: 0x6a5a8a }, // study, under the desk chair
  { x: 768, y: 496, w: 660, h: 64, color: 0x8a3a3a }, // hallway runner
  { x: 290, y: 190, w: 160, h: 104, color: 0xb0a070 }, // kitchen mat under the table
  { x: 110, y: 572, w: 84, h: 30, color: 0x6a9ab8 }, // bath mat
];

  const labels: Record<string, [number, number]> = {
  Kitchen: [250, 300],
  "Living Room": [800, 298],
  Bedroom: [1190, 262],
  Bathroom: [180, 470],
  Hallway: [768, 440],
  Study: [1370, 520],
  Garage: [320, 880],
  Library: [768, 936],
  Storage: [1410, 860],
};

export const HOUSE: MapDef = {
  id: "house",
  name: "The House",
  cols: 48,
  rows: 32,
  rooms,
  doors,
  layout,
  rugs,
  labels,
  hunterStart: "Hallway",
};
