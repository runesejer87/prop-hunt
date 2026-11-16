import type { Door, Item, MapDef, Room, Rug } from "../mapdef.ts";

/**
 * The office: a long corridor with reception, three offices and the boardroom along the top,
 * and the open-plan floor, break room, server room and restrooms along the bottom.
 * Coordinates are map pixels (centre of each object). A prop's front faces south at rotation 0.
 * Chairs, plants, cabinets and water coolers are everywhere, so hiders have lookalikes;
 * server racks, printers and the vending machine belong to one place each.
 */
const rooms: Room[] = [
  { name: "Reception", x: 1, y: 1, w: 11, h: 8, color: 0x5a4c3e, floor: "wood" },
  { name: "Office A", x: 13, y: 1, w: 8, h: 8, color: 0x465066, floor: "carpet" },
  { name: "Office B", x: 22, y: 1, w: 8, h: 8, color: 0x4a5a56, floor: "carpet" },
  { name: "Office C", x: 31, y: 1, w: 8, h: 8, color: 0x5a4a5e, floor: "carpet" },
  { name: "Boardroom", x: 40, y: 1, w: 15, h: 8, color: 0x4a3a52, floor: "carpet" },
  { name: "Corridor", x: 1, y: 10, w: 54, h: 4, color: 0x585a66, floor: "tile" },
  { name: "Open Plan", x: 1, y: 15, w: 26, h: 12, color: 0x4e586a, floor: "carpet" },
  { name: "Break Room", x: 28, y: 15, w: 12, h: 12, color: 0x4c5c48, floor: "tile" },
  { name: "Server Room", x: 41, y: 15, w: 7, h: 12, color: 0x2e3a4c, floor: "concrete" },
  { name: "Restrooms", x: 49, y: 15, w: 6, h: 12, color: 0x365662, floor: "smalltile" },
];

const doors: Door[] = [
  // Top rooms to the corridor
  { x: 5, y: 9, w: 2, h: 1 },
  { x: 16, y: 9, w: 2, h: 1 },
  { x: 25, y: 9, w: 2, h: 1 },
  { x: 34, y: 9, w: 2, h: 1 },
  { x: 46, y: 9, w: 2, h: 1 },
  // Between neighbouring top rooms
  { x: 12, y: 4, w: 1, h: 2 },
  { x: 21, y: 4, w: 1, h: 2 },
  { x: 30, y: 4, w: 1, h: 2 },
  { x: 39, y: 4, w: 1, h: 2 },
  // Corridor to the bottom rooms
  { x: 6, y: 14, w: 2, h: 1 },
  { x: 20, y: 14, w: 2, h: 1 },
  { x: 33, y: 14, w: 2, h: 1 },
  { x: 43, y: 14, w: 2, h: 1 },
  { x: 51, y: 14, w: 2, h: 1 },
  // Between neighbouring bottom rooms
  { x: 27, y: 20, w: 1, h: 2 },
  { x: 40, y: 20, w: 1, h: 2 },
  { x: 48, y: 20, w: 1, h: 2 },
];

// The open-plan floor: rows of desks with chairs, cubicle partitions between them.
const openPlan: Item[] = [];
for (const y of [560, 690]) {
  for (const block of [[100, 200, 300], [560, 660, 760]]) {
    block.forEach((x, i) => {
      openPlan.push(["desk", x, y]);
      openPlan.push(["chair", x, y + 44, 2]);
      if (i < block.length - 1) openPlan.push(["divider", x + 50, y, 1]);
    });
  }
}
openPlan.push(
  // Along the walls
  ["cabinet", 46, 560],
  ["cabinet", 46, 690],
  ["cabinet", 850, 560],
  ["plant", 52, 500],
  ["plant", 842, 500],
  ["plant", 846, 730],
  // The aisle between the two blocks
  ["printer", 430, 508],
  ["trashcan", 400, 700],
  ["trashcan", 500, 700],
  ["cooler", 400, 600],
  // Supplies along the south wall
  ["cabinet", 60, 848],
  ["cabinet", 92, 848],
  ["cabinet", 124, 848],
  ["whiteboard", 240, 858],
  ["printer", 330, 846],
  ["plant", 380, 846],
  ["trashcan", 430, 848],
  ["cabinet", 560, 848],
  ["cabinet", 592, 848],
  ["plant", 640, 846],
  ["printer", 700, 846],
  ["whiteboard", 790, 858],
);

const layout: Record<string, Item[]> = {
  // Visitors wait here
  Reception: [
    ["reception_desk", 220, 100],
    ["chair", 220, 58, 0],
    ["cabinet", 110, 50],
    ["cabinet", 330, 50],
    ["sofa", 60, 225, 3],
    ["coffee_table", 112, 225],
    ["armchair", 132, 182, 0],
    ["plant", 366, 56],
    ["cooler", 372, 100],
    ["lamp", 60, 60],
    ["plant", 358, 262],
    ["trashcan", 322, 262],
  ],
  // A manager's office
  "Office A": [
    ["bookshelf", 470, 44],
    ["desk", 590, 56],
    ["chair", 590, 100, 2],
    ["cabinet", 650, 52],
    ["chair", 560, 160, 2],
    ["chair", 612, 160, 2],
    ["plant", 430, 262],
    ["lamp", 650, 262],
    ["trashcan", 460, 262],
  ],
  // A creative's office, with a sofa
  "Office B": [
    ["desk", 770, 56],
    ["chair", 770, 100, 2],
    ["sofa", 870, 60],
    ["coffee_table", 860, 122],
    ["cabinet", 728, 268],
    ["cabinet", 760, 268],
    ["plant", 944, 262],
    ["lamp", 900, 262],
  ],
  // A small meeting room
  "Office C": [
    ["whiteboard", 1120, 42],
    ["table", 1120, 150],
    ["chair", 1096, 106, 0],
    ["chair", 1144, 106, 0],
    ["chair", 1096, 194, 2],
    ["chair", 1144, 194, 2],
    ["plant", 1230, 262],
    ["plant", 1230, 54],
    ["lamp", 1010, 262],
    ["trashcan", 1010, 60],
  ],
  // The big meeting room
  Boardroom: [
    ["whiteboard", 1520, 42],
    ["conference_table", 1520, 160],
    ["chair", 1470, 112, 0],
    ["chair", 1520, 112, 0],
    ["chair", 1570, 112, 0],
    ["chair", 1470, 208, 2],
    ["chair", 1520, 208, 2],
    ["chair", 1570, 208, 2],
    ["chair", 1428, 160, 3],
    ["chair", 1612, 160, 1],
    ["dresser", 1340, 52],
    ["dresser", 1690, 52],
    ["plant", 1300, 262],
    ["plant", 1740, 262],
    ["plant", 1744, 60],
    ["lamp", 1296, 60],
    ["counter", 1650, 270],
  ],
  // Benches, plants and water coolers along both walls
  Corridor: [
    ["bench", 90, 334],
    ["plant", 260, 338],
    ["cooler", 300, 340],
    ["trashcan", 340, 338],
    ["bench", 420, 334],
    ["cabinet", 620, 336],
    ["cabinet", 652, 336],
    ["plant", 760, 338],
    ["bench", 940, 334],
    ["plant", 1020, 338],
    ["plant", 1200, 338],
    ["bench", 1300, 334],
    ["plant", 1420, 338],
    ["bench", 1640, 334],
    ["plant", 1740, 338],
    ["bench", 90, 434, 2],
    ["plant", 290, 432],
    ["cabinet", 330, 434],
    ["bench", 420, 434, 2],
    ["plant", 600, 432],
    ["bench", 800, 434, 2],
    ["cooler", 880, 436],
    ["plant", 1020, 432],
    ["bench", 1200, 434, 2],
    ["plant", 1340, 432],
    ["bench", 1520, 434, 2],
    ["plant", 1600, 432],
    ["plant", 1740, 432],
  ],
  "Open Plan": openPlan,
  // Lunch
  "Break Room": [
    ["counter", 964, 496],
    ["fridge", 1162, 502],
    ["vending", 1230, 498],
    ["cooler", 1262, 552],
    ["table", 990, 640],
    ["chair", 966, 598, 0],
    ["chair", 1014, 598, 0],
    ["chair", 966, 682, 2],
    ["chair", 1014, 682, 2],
    ["table", 1170, 640],
    ["chair", 1146, 598, 0],
    ["chair", 1194, 598, 0],
    ["chair", 1146, 682, 2],
    ["chair", 1194, 682, 2],
    ["sofa", 1090, 830, 2],
    ["coffee_table", 1090, 772],
    ["counter", 912, 800, 1],
    ["plant", 960, 845],
    ["plant", 1260, 845],
    ["trashcan", 1250, 780],
  ],
  // Racks of servers
  "Server Room": [
    ["server_rack", 1340, 570],
    ["server_rack", 1380, 570],
    ["server_rack", 1460, 570],
    ["server_rack", 1500, 570],
    ["server_rack", 1420, 650],
    ["server_rack", 1460, 650],
    ["server_rack", 1340, 790],
    ["server_rack", 1380, 790],
    ["server_rack", 1460, 790],
    ["server_rack", 1500, 790],
    ["toolbox", 1340, 745],
    ["box", 1500, 730],
    ["trashcan", 1330, 840],
  ],
  Restrooms: [
    ["toilet", 1744, 540, 1],
    ["toilet", 1744, 590, 1],
    ["toilet", 1744, 640, 1],
    ["sink", 1580, 530, 3],
    ["sink", 1580, 566, 3],
    ["sink", 1580, 602, 3],
    ["trashcan", 1600, 820],
    ["bucket", 1720, 800],
    ["plant", 1600, 750],
  ],
};

const rugs: Rug[] = [
  { x: 112, y: 225, w: 120, h: 76, color: 0x6a4a3a }, // reception waiting area
  { x: 1520, y: 160, w: 280, h: 140, color: 0x5a3a62 }, // boardroom
  { x: 880, y: 384, w: 1500, h: 36, color: 0x3a4a6a }, // corridor runner
  { x: 860, y: 122, w: 150, h: 90, color: 0x5a6a5a }, // office B lounge
];

const labels: Record<string, [number, number]> = {
  Reception: [300, 200],
  "Office A": [520, 215],
  "Office B": [840, 215],
  "Office C": [1170, 250],
  Boardroom: [1520, 250],
  Corridor: [880, 384],
  "Open Plan": [450, 550],
  "Break Room": [1090, 590],
  "Server Room": [1424, 745],
  Restrooms: [1660, 700],
};

export const OFFICE: MapDef = {
  id: "office",
  name: "The Office",
  cols: 56,
  rows: 28,
  rooms,
  doors,
  layout,
  rugs,
  labels,
  hunterStart: "Corridor",
};
