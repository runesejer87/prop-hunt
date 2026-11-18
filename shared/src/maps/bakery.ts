import type { Door, Item, MapDef, Room, Rug } from "../mapdef.ts";

/**
 * The bakery: a warm little shop with cake counters, a busy bakery kitchen, a pantry
 * and a cosy cafe nook. Cakes and bread baskets are on every counter, so hiders can
 * sit among the treats.
 */
const rooms: Room[] = [
  { name: "Shop Floor", x: 1, y: 1, w: 18, h: 10, color: 0xa88a64, floor: "tile" },
  { name: "Display Room", x: 20, y: 1, w: 9, h: 10, color: 0x9a6a7a, floor: "carpet" },
  { name: "Bakery Kitchen", x: 1, y: 12, w: 12, h: 7, color: 0x8a8a7a, floor: "smalltile" },
  { name: "Pantry", x: 14, y: 12, w: 7, h: 7, color: 0x6a5a46, floor: "concrete" },
  { name: "Cafe Nook", x: 22, y: 12, w: 7, h: 7, color: 0x7a5a3a, floor: "wood" },
];

const doors: Door[] = [
  { x: 19, y: 4, w: 1, h: 2 },
  { x: 4, y: 11, w: 2, h: 1 },
  { x: 16, y: 11, w: 2, h: 1 },
  { x: 24, y: 11, w: 2, h: 1 },
  { x: 13, y: 15, w: 1, h: 2 },
  { x: 21, y: 15, w: 1, h: 2 },
];

const cafeSet = (x: number, y: number, skip: number[] = []): Item[] =>
  (
    [
      ["cafe_table", x, y],
      ["chair", x - 34, y, 3],
      ["chair", x + 34, y, 1],
      ["chair", x, y - 34, 0],
      ["chair", x, y + 34, 2],
    ] as Item[]
  ).filter((_, i) => !skip.includes(i));

const layout: Record<string, Item[]> = {
  "Shop Floor": [
    ["shelf", 100, 46],
    ["shelf", 196, 46],
    ["shelf", 292, 46],
    ["shelf", 388, 46],
    ["shelf", 484, 46],
    ["jukebox", 60, 100],
    ["counter", 110, 170],
    ["counter", 240, 170],
    ["cake", 80, 170, 0, true],
    ["bread_basket", 140, 170, 0, true],
    ["cake", 240, 170, 0, true],
    ...cafeSet(390, 170),
    ...cafeSet(520, 170, [2]),
    ["cake", 390, 170, 0, true],
    ["cake", 520, 170, 0, true],
    ...cafeSet(300, 270),
    ...cafeSet(430, 280),
    ["plant", 52, 330],
    ["plant", 588, 270],
    ["lamp", 590, 60],
  ],
  "Display Room": [
    ["shelf", 700, 46],
    ["shelf", 796, 46],
    ["counter", 790, 140],
    ["counter", 790, 200],
    ["cake", 750, 140, 0, true],
    ["cake", 790, 140, 0, true],
    ["bread_basket", 830, 140, 0, true],
    ["cake", 760, 200, 0, true],
    ["bread_basket", 820, 200, 0, true],
    ...cafeSet(700, 300, [1]),
    ...cafeSet(890, 300, [2]),
    ["plant", 660, 100],
    ["plant", 910, 60],
    ["lamp", 910, 100],
  ],
  "Bakery Kitchen": [
    ["oven", 70, 580],
    ["oven", 125, 580],
    ["oven", 180, 580],
    ["counter", 270, 580],
    ["table", 200, 500],
    ["cake", 180, 500, 0, true],
    ["bread_basket", 220, 500, 0, true],
    ["stool", 130, 500],
    ["stool", 270, 500],
    ["fridge", 60, 420],
    ["shelf", 46, 500, 1],
    ["barrel", 330, 430],
    ["crate", 370, 420],
    ["trashcan", 390, 580],
    ["plant", 300, 420],
  ],
  Pantry: [
    ["shelf", 500, 590],
    ["shelf", 596, 590],
    ["crate", 515, 470],
    ["crate", 550, 470],
    ["box", 515, 505],
    ["box", 550, 505],
    ["barrel", 600, 470],
    ["barrel", 600, 510],
    ["crate", 610, 555],
    ["box", 580, 550],
    ["cabinet", 540, 545],
  ],
  "Cafe Nook": [
    ["sofa", 860, 580, 2],
    ["coffee_table", 860, 520],
    ["armchair", 740, 580],
    ["armchair", 905, 430],
    ...cafeSet(800, 470, [3]),
    ["cake", 800, 470, 0, true],
    ["plant", 720, 420],
  ],
};

const rugs: Rug[] = [
  { x: 390, y: 170, w: 240, h: 130, color: 0xb86a5a },
  { x: 790, y: 195, w: 200, h: 130, color: 0x7a4a5a },
  { x: 860, y: 540, w: 150, h: 120, color: 0x5a6a5a },
];

const labels: Record<string, [number, number]> = {
  "Shop Floor": [150, 330],
  "Display Room": [790, 330],
  "Bakery Kitchen": [210, 440],
  Pantry: [560, 420],
  "Cafe Nook": [810, 410],
};

export const BAKERY: MapDef = {
  id: "bakery",
  name: "The Bakery",
  cols: 30,
  rows: 20,
  rooms,
  doors,
  layout,
  rugs,
  labels,
  hunterStart: "Shop Floor",
};
