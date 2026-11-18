import type { Door, Item, MapDef, Room, Rug } from "../mapdef.ts";

/**
 * The garden: a sunny lawn with a picnic, a glass greenhouse, a veggie patch, a potting shed
 * and a patio. Plants, pumpkins and flower pots are everywhere, so hiders blend in with the crops.
 */
const rooms: Room[] = [
  { name: "Lawn", x: 1, y: 1, w: 20, h: 11, color: 0x4f7f46, floor: "carpet" },
  { name: "Greenhouse", x: 22, y: 1, w: 11, h: 11, color: 0x5a8a6a, floor: "smalltile" },
  { name: "Veggie Patch", x: 1, y: 13, w: 12, h: 8, color: 0x6a4a32, floor: "concrete" },
  { name: "Potting Shed", x: 14, y: 13, w: 9, h: 8, color: 0x6a5236, floor: "wood" },
  { name: "Patio", x: 24, y: 13, w: 9, h: 8, color: 0x8a7a6a, floor: "tile" },
];

const doors: Door[] = [
  { x: 21, y: 5, w: 1, h: 2 },
  { x: 5, y: 12, w: 2, h: 1 },
  { x: 16, y: 12, w: 2, h: 1 },
  { x: 27, y: 12, w: 2, h: 1 },
  { x: 23, y: 16, w: 1, h: 2 },
  { x: 13, y: 16, w: 1, h: 2 },
];

const hedge: Item[] = [];
for (let x = 56; x <= 640; x += 56) if (x !== 336) hedge.push(["plant", x, 46]);

const crops: Item[] = [];
for (let x = 70; x <= 330; x += 48) {
  if (x !== 214) crops.push(["plant", x, 500]);
  if (x !== 262) crops.push(["plant", x, 580]);
}
for (let x = 80; x <= 320; x += 60) crops.push(["pumpkin", x, 648]);

const greenhouseRows: Item[] = [];
for (let x = 790; x <= 990; x += 50) {
  greenhouseRows.push(["plant", x, 190]);
  greenhouseRows.push(["plant", x, 270]);
}

const layout: Record<string, Item[]> = {
  Lawn: [
    ...hedge,
    ["bench", 150, 110],
    ["bench", 530, 110],
    ["table", 330, 210],
    ["stool", 260, 210],
    ["stool", 400, 210],
    ["stool", 300, 160],
    ["stool", 360, 160],
    ["stool", 300, 260],
    ["stool", 360, 260],
    ["picnic_basket", 330, 210, 0, true],
    ["haybale", 100, 300],
    ["haybale", 145, 300],
    ["haybale", 100, 336],
    ["pumpkin", 460, 300],
    ["pumpkin", 500, 260],
    ["pumpkin", 560, 300],
    ["pumpkin", 600, 230],
    ["flowerpot", 60, 200],
    ["flowerpot", 60, 240],
    ["flowerpot", 600, 340],
    ["flowerpot", 460, 150],
    ["flowerpot", 250, 110],
    ["flowerpot", 420, 110],
    ["tire", 200, 230],
    ["barrel", 630, 350],
    ["watering_can", 190, 310],
    ["lamp", 52, 350],
    ["lamp", 330, 90],
  ],
  Greenhouse: [
    ["table", 790, 80],
    ["table", 900, 80],
    ["table", 1000, 80],
    ["flowerpot", 770, 80, 0, true],
    ["flowerpot", 810, 80, 0, true],
    ["flowerpot", 880, 80, 0, true],
    ["flowerpot", 920, 80, 0, true],
    ["watering_can", 1000, 80, 0, true],
    ["shelf", 1042, 200, 1],
    ["shelf", 1042, 310, 1],
    ...greenhouseRows,
    ["bench", 800, 330],
    ["bench", 980, 330],
    ["bucket", 730, 350],
    ["barrel", 1020, 128],
  ],
  "Veggie Patch": [
    ...crops,
    ["haybale", 380, 640],
    ["barrel", 60, 450],
    ["barrel", 100, 450],
    ["watering_can", 300, 450],
    ["bucket", 340, 450],
    ["tire", 390, 460],
  ],
  "Potting Shed": [
    ["workbench", 650, 436],
    ["toolbox", 650, 436, 0, true],
    ["workbench", 496, 650],
    ["shelf", 594, 650],
    ["crate", 665, 650],
    ["crate", 700, 650],
    ["barrel", 470, 470],
    ["bucket", 690, 470],
    ["table", 600, 540],
    ["watering_can", 600, 540, 0, true],
    ["tire", 520, 600],
    ["flowerpot", 540, 490],
    ["flowerpot", 720, 600],
    ["plant", 720, 460],
  ],
  Patio: [
    ["cafe_table", 900, 540],
    ["chair", 866, 540, 3],
    ["chair", 900, 506, 0],
    ["chair", 900, 574, 2],
    ["cafe_table", 980, 480],
    ["chair", 946, 480, 3],
    ["chair", 980, 514, 2],
    ["counter", 880, 650],
    ["fridge", 990, 640],
    ["plant", 790, 640],
    ["pumpkin", 1040, 440],
    ["lamp", 790, 450],
    ["flowerpot", 1040, 560],
    ["barrel", 1040, 520],
  ],
};

const rugs: Rug[] = [
  { x: 330, y: 210, w: 210, h: 150, color: 0xb04a4a }, // picnic blanket
  { x: 900, y: 540, w: 170, h: 140, color: 0x6a8a9a },
  { x: 600, y: 540, w: 130, h: 90, color: 0x7a6a4a },
];

const labels: Record<string, [number, number]> = {
  Lawn: [160, 370],
  Greenhouse: [880, 360],
  "Veggie Patch": [210, 440],
  "Potting Shed": [560, 410],
  Patio: [900, 455],
};

export const GARDEN: MapDef = {
  id: "garden",
  name: "The Garden",
  cols: 34,
  rows: 22,
  rooms,
  doors,
  layout,
  rugs,
  labels,
  hunterStart: "Lawn",
};
