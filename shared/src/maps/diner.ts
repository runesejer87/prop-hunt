import type { Door, Item, MapDef, Room, Rug } from "../mapdef.ts";

/**
 * The diner: a big dining hall with booths and cafe tables, a bar, a pool lounge,
 * a busy kitchen, cold storage, restrooms and a back office.
 * Coordinates are map pixels (centre of each object). A prop's front faces south at rotation 0.
 * Cafe tables and chairs are everywhere, so hiders have lookalikes; pool tables, jukeboxes
 * and stoves belong to one place each.
 */
const rooms: Room[] = [
  { name: "Dining Hall", x: 1, y: 1, w: 22, h: 16, color: 0x6a5a48, floor: "tile" },
  { name: "Bar", x: 24, y: 1, w: 19, h: 8, color: 0x4a3226, floor: "wood" },
  { name: "Lounge", x: 24, y: 10, w: 19, h: 7, color: 0x4a2f40, floor: "carpet" },
  { name: "Kitchen", x: 1, y: 18, w: 14, h: 11, color: 0x58605c, floor: "smalltile" },
  { name: "Cold Storage", x: 16, y: 18, w: 7, h: 11, color: 0x3a4c58, floor: "concrete" },
  { name: "Restrooms", x: 24, y: 18, w: 6, h: 11, color: 0x365662, floor: "smalltile" },
  { name: "Back Office", x: 31, y: 18, w: 12, h: 11, color: 0x4c4a40, floor: "wood" },
];

const doors: Door[] = [
  // Dining hall to the bar and the lounge
  { x: 23, y: 4, w: 1, h: 2 },
  { x: 23, y: 12, w: 1, h: 2 },
  // Bar to the lounge
  { x: 32, y: 9, w: 3, h: 1 },
  // Dining hall to the kitchen and cold storage
  { x: 4, y: 17, w: 2, h: 1 },
  { x: 11, y: 17, w: 2, h: 1 },
  { x: 18, y: 17, w: 2, h: 1 },
  // Lounge to the restrooms and the back office
  { x: 26, y: 17, w: 2, h: 1 },
  { x: 35, y: 17, w: 2, h: 1 },
  // Along the bottom row
  { x: 15, y: 22, w: 1, h: 2 },
  { x: 23, y: 22, w: 1, h: 2 },
  { x: 30, y: 22, w: 1, h: 2 },
];

// Cafe tables with a chair on each side: [x, y] of the table.
function tableSet(x: number, y: number): Item[] {
  return [
    ["cafe_table", x, y],
    ["chair", x - 34, y, 3],
    ["chair", x + 34, y, 1],
    ["chair", x, y - 34, 0],
    ["chair", x, y + 34, 2],
  ];
}

const dining: Item[] = [];
// Booths along the north wall, each with a table in front.
for (const x of [100, 200, 300, 400, 500, 600]) {
  dining.push(["booth", x, 56]);
  dining.push(["coffee_table", x, 104]);
}
// Two rows of cafe tables.
for (const y of [230, 370]) for (const x of [170, 340, 510, 630]) dining.push(...tableSet(x, y));
dining.push(
  // A buffet along the south wall
  ["counter", 270, 528],
  ["counter", 500, 528],
  ["plant", 52, 200],
  ["plant", 52, 330],
  ["plant", 52, 470],
  ["plant", 712, 300],
  ["lamp", 52, 400],
  ["trashcan", 700, 480],
  ["jukebox", 700, 90],
);

const layout: Record<string, Item[]> = {
  "Dining Hall": dining,
  // Drinks at the counter
  Bar: [
    ["shelf", 840, 46],
    ["shelf", 936, 46],
    ["shelf", 1032, 46],
    ["shelf", 1128, 46],
    ["counter", 880, 100],
    ["counter", 1008, 100],
    ["stool", 850, 140],
    ["stool", 900, 140],
    ["stool", 950, 140],
    ["stool", 1000, 140],
    ["stool", 1050, 140],
    ["fridge", 1230, 58],
    ["barrel", 800, 90],
    ["jukebox", 1346, 56],
    ...tableSet(1224, 190),
    ["cafe_table", 1320, 190],
    ["chair", 1286, 190, 3],
    ["chair", 1320, 156, 0],
    ["chair", 1320, 224, 2],
    ["plant", 790, 262],
    ["plant", 1356, 270],
    ["lamp", 818, 230],
  ],
  // Pool and sofas
  Lounge: [
    ["pool_table", 1050, 440],
    ["sofa", 880, 350],
    ["coffee_table", 880, 412],
    ["armchair", 1250, 380, 3],
    ["armchair", 1250, 470, 3],
    ["cafe_table", 1296, 425],
    ["lamp", 800, 520],
    ["plant", 790, 340],
    ["plant", 1350, 340],
    ["jukebox", 1352, 520],
    ["trashcan", 1340, 420],
  ],
  // Where the cooking happens
  Kitchen: [
    ["counter", 48, 660, 1],
    ["counter", 48, 790, 1],
    ["counter", 130, 912, 2],
    ["counter", 258, 912, 2],
    ["counter", 386, 912, 2],
    ["fridge", 452, 604],
    ["sink", 240, 604],
    ["sink", 276, 604],
    ["table", 250, 720],
    ["table", 250, 820],
    ["trashcan", 90, 600],
    ["crate", 440, 880],
    ["crate", 408, 880],
    ["barrel", 456, 840],
    ["shelf", 360, 640],
    ["box", 330, 760],
    ["stool", 340, 820],
  ],
  // Shelves of supplies and a walk-in fridge
  "Cold Storage": [
    ["shelf", 580, 770, 1],
    ["shelf", 580, 880, 1],
    ["shelf", 640, 770, 1],
    ["shelf", 640, 880, 1],
    ["fridge", 700, 900],
    ["crate", 700, 640],
    ["crate", 666, 640],
    ["box", 540, 650],
    ["barrel", 700, 600],
    ["bucket", 540, 900],
  ],
  Restrooms: [
    ["toilet", 800, 900, 2],
    ["toilet", 850, 900, 2],
    ["toilet", 900, 900, 2],
    ["divider", 825, 900, 1],
    ["divider", 875, 900, 1],
    ["sink", 790, 636],
    ["sink", 920, 636],
    ["trashcan", 930, 830],
    ["plant", 790, 800],
    ["bucket", 940, 800],
  ],
  // The manager's office and a store room
  "Back Office": [
    ["desk", 1100, 690],
    ["chair", 1100, 734, 2],
    ["cabinet", 1010, 630],
    ["cabinet", 1010, 662],
    ["bookshelf", 1240, 596],
    ["whiteboard", 1040, 586],
    ["sofa", 1250, 800, 2],
    ["coffee_table", 1250, 740],
    ["crate", 1340, 640],
    ["crate", 1340, 674],
    ["box", 1340, 710],
    ["plant", 1030, 890],
    ["plant", 1350, 890],
    ["lamp", 1160, 890],
    ["trashcan", 1190, 700],
  ],
};

const rugs: Rug[] = [
  { x: 1050, y: 440, w: 250, h: 150, color: 0x3a5a3a }, // lounge, under the pool table
  { x: 880, y: 382, w: 150, h: 120, color: 0x7a3a4a }, // lounge sofas
  { x: 1250, y: 800, w: 140, h: 100, color: 0x5a4a6a }, // back office
  { x: 700, y: 384, w: 60, h: 120, color: 0x6a3a3a }, // by the dining hall door
];

const labels: Record<string, [number, number]> = {
  "Dining Hall": [160, 500],
  Bar: [1100, 230],
  Lounge: [1180, 350],
  Kitchen: [160, 700],
  "Cold Storage": [620, 740],
  Restrooms: [860, 700],
  "Back Office": [1180, 840],
};

export const DINER: MapDef = {
  id: "diner",
  name: "The Diner",
  cols: 44,
  rows: 30,
  rooms,
  doors,
  layout,
  rugs,
  labels,
  hunterStart: "Dining Hall",
};
