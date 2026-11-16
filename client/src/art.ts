/**
 * All the game's pictures, drawn in code (no image files).
 * Each function paints once at start-up into a texture that the GPU then reuses,
 * so it costs almost nothing while playing. To use real artwork later, load images
 * with the same texture keys instead.
 */
import Phaser from "phaser";
import {
  ROOMS,
  TILE,
  MAP_COLS,
  MAP_ROWS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  isWallTile,
  roomIndexAt,
  PROP_TYPES,
  PLACED_PROPS,
  type PropType,
} from "@prop-hunt/shared";

// ------------------------------------------------------------------ colour helpers

const mix = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
};
const light = (c: number, t: number) => mix(c, 0xffffff, t);
const dark = (c: number, t: number) => mix(c, 0x000000, t);
const css = (c: number, alpha = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;

/** Small seeded random generator so textures look the same every time. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------- floors

type FloorKind = "wood" | "tile" | "smalltile" | "carpet" | "concrete";

const FLOOR_KIND: Record<string, FloorKind> = {
  Kitchen: "tile",
  "Living Room": "wood",
  Bedroom: "carpet",
  Bathroom: "smalltile",
  Hallway: "wood",
  Study: "wood",
  Garage: "concrete",
  Library: "carpet",
  Storage: "concrete",
};

function paintFloor(ctx: CanvasRenderingContext2D, kind: FloorKind, base: number, seed: number) {
  const r = rng(seed);
  const S = 64;
  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, S, S);

  if (kind === "wood") {
    // Four planks, each a slightly different shade, with staggered end joints.
    for (let i = 0; i < 4; i++) {
      const y = i * 16;
      ctx.fillStyle = css(mix(base, r() > 0.5 ? 0xffffff : 0x000000, 0.02 + r() * 0.04));
      ctx.fillRect(0, y, S, 16);
      ctx.fillStyle = css(dark(base, 0.35), 0.55);
      ctx.fillRect(0, y + 15, S, 1);
      const joint = Math.floor(r() * 40) + 12;
      ctx.fillRect(joint, y, 1, 16);
      ctx.strokeStyle = css(dark(base, 0.25), 0.25);
      ctx.lineWidth = 1;
      for (let g = 0; g < 3; g++) {
        const gy = y + 3 + r() * 10;
        ctx.beginPath();
        ctx.moveTo(r() * 20, gy);
        ctx.lineTo(24 + r() * 40, gy + (r() - 0.5) * 2);
        ctx.stroke();
      }
    }
  } else if (kind === "tile" || kind === "smalltile") {
    const n = kind === "tile" ? 32 : 16;
    for (let y = 0; y < S; y += n) {
      for (let x = 0; x < S; x += n) {
        const odd = ((x + y) / n) % 2 === 1;
        ctx.fillStyle = css(odd ? light(base, 0.1) : dark(base, 0.04));
        ctx.fillRect(x, y, n, n);
      }
    }
    ctx.fillStyle = css(dark(base, 0.4), 0.45);
    for (let p = 0; p < S; p += n) {
      ctx.fillRect(p, 0, 1, S);
      ctx.fillRect(0, p, S, 1);
    }
    ctx.fillStyle = css(0xffffff, 0.07);
    for (let y = 0; y < S; y += n) for (let x = 0; x < S; x += n) ctx.fillRect(x + 1, y + 1, n - 2, 2);
  } else if (kind === "carpet") {
    for (let i = 0; i < 520; i++) {
      ctx.fillStyle = css(r() > 0.5 ? light(base, 0.12) : dark(base, 0.18), 0.35);
      ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
    }
    ctx.strokeStyle = css(dark(base, 0.15), 0.18);
    for (let y = 4; y < S; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(S, y);
      ctx.stroke();
    }
  } else {
    // concrete
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = css(r() > 0.5 ? light(base, 0.1) : dark(base, 0.25), 0.3);
      ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1 + Math.floor(r() * 2), 1);
    }
    ctx.strokeStyle = css(dark(base, 0.4), 0.45);
    ctx.beginPath();
    ctx.moveTo(S - 1, 0);
    ctx.lineTo(S - 1, S);
    ctx.moveTo(0, S - 1);
    ctx.lineTo(S, S - 1);
    ctx.stroke();
    ctx.strokeStyle = css(dark(base, 0.4), 0.3);
    ctx.beginPath();
    let cx = 10 + r() * 40;
    ctx.moveTo(cx, 0);
    for (let y = 8; y <= S; y += 8) {
      cx += (r() - 0.5) * 8;
      ctx.lineTo(cx, y);
    }
    ctx.stroke();
  }
}

// --------------------------------------------------------------------------- world

/** Floors, rugs, wall shadows, walls and room names. Drawn once. */
export function drawWorld(scene: Phaser.Scene) {
  // Floors: one tiling picture per room, tinted by the room's colour.
  ROOMS.forEach((room, i) => {
    const key = `floor_${i}`;
    const tex = scene.textures.createCanvas(key, 64, 64);
    if (tex) {
      paintFloor(tex.getContext(), FLOOR_KIND[room.name] ?? "wood", room.color, 100 + i);
      tex.refresh();
      scene.add.tileSprite(room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE, key).setOrigin(0).setDepth(0);
    }
  });

  // Dark backdrop behind everything (the area outside the walls).
  scene.add.graphics().setDepth(-1).fillStyle(0x15171c).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const g = scene.add.graphics().setDepth(0.5);

  // Doorways: a worn wooden threshold.
  g.fillStyle(0x6b5a45);
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (isWallTile(col, row) || roomIndexAt(col, row) !== -1) continue;
      g.fillRect(col * TILE, row * TILE, TILE, TILE);
    }
  }
  g.lineStyle(1, 0x000000, 0.25);
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (isWallTile(col, row) || roomIndexAt(col, row) !== -1) continue;
      g.lineBetween(col * TILE, row * TILE + TILE / 2, col * TILE + TILE, row * TILE + TILE / 2);
    }
  }

  // Rugs and mats, each under a furniture group.
  const RUGS: { x: number; y: number; w: number; h: number; color: number }[] = [
    { x: 768, y: 164, w: 300, h: 176, color: 0x8a4a3a }, // living room, under the sofa and coffee table
    { x: 1280, y: 206, w: 236, h: 150, color: 0x5a6e92 }, // bedroom, beside the bed
    { x: 768, y: 852, w: 270, h: 140, color: 0x7a3a4a }, // library reading corner
    { x: 1360, y: 424, w: 140, h: 84, color: 0x6a5a8a }, // study, under the desk chair
    { x: 768, y: 496, w: 660, h: 64, color: 0x8a3a3a }, // hallway runner
    { x: 290, y: 190, w: 160, h: 104, color: 0xb0a070 }, // kitchen mat under the table
    { x: 110, y: 572, w: 84, h: 30, color: 0x6a9ab8 }, // bath mat
  ];
  for (const rug of RUGS) {
    const x = rug.x - rug.w / 2;
    const y = rug.y - rug.h / 2;
    const c = rug.color;
    g.fillStyle(0x000000, 0.18).fillRoundedRect(x + 3, y + 4, rug.w, rug.h, 8);
    g.fillStyle(dark(c, 0.18)).fillRoundedRect(x, y, rug.w, rug.h, 8);
    g.fillStyle(c).fillRoundedRect(x + 5, y + 5, rug.w - 10, rug.h - 10, 6);
    if (rug.w > 100 && rug.h > 60) {
      g.lineStyle(2, light(c, 0.35), 0.8).strokeRoundedRect(x + 11, y + 11, rug.w - 22, rug.h - 22, 4);
      g.fillStyle(light(c, 0.18), 0.45).fillRoundedRect(x + 20, y + 20, rug.w - 40, rug.h - 40, 3);
    }
  }

  // Soft shadows on the floor next to walls (light comes from the top left).
  const shadow = scene.add.graphics().setDepth(0.8);
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (isWallTile(col, row)) continue;
      const x = col * TILE;
      const y = row * TILE;
      if (isWallTile(col, row - 1)) {
        shadow.fillStyle(0x000000, 0.3).fillRect(x, y, TILE, 5);
        shadow.fillStyle(0x000000, 0.14).fillRect(x, y + 5, TILE, 8);
      }
      if (isWallTile(col - 1, row)) {
        shadow.fillStyle(0x000000, 0.22).fillRect(x, y, 5, TILE);
        shadow.fillStyle(0x000000, 0.1).fillRect(x + 5, y, 6, TILE);
      }
    }
  }

  // Walls, drawn as raised blocks: a lit top edge and a darker front face.
  const walls = scene.add.graphics().setDepth(1);
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (!isWallTile(col, row)) continue;
      const touchesFloor = [-1, 0, 1].some((dj) => [-1, 0, 1].some((di) => !isWallTile(col + di, row + dj)));
      if (!touchesFloor) continue;
      const x = col * TILE;
      const y = row * TILE;
      walls.fillStyle(0x2b2e3a).fillRect(x, y, TILE, TILE);
      walls.lineStyle(1, 0x000000, 0.18);
      for (let by = 8; by < TILE; by += 8) walls.lineBetween(x, y + by, x + TILE, y + by);
      if (!isWallTile(col, row + 1)) {
        walls.fillStyle(0x474c61).fillRect(x, y + TILE - 12, TILE, 12);
        walls.fillStyle(0x1b1d26).fillRect(x, y + TILE - 2, TILE, 2);
        walls.fillStyle(0xffffff, 0.08).fillRect(x, y + TILE - 12, TILE, 2);
      }
      if (!isWallTile(col, row - 1)) walls.fillStyle(0x7b8298).fillRect(x, y, TILE, 3);
      if (!isWallTile(col - 1, row)) walls.fillStyle(0x6a7188).fillRect(x, y, 2, TILE);
    }
  }

  // Room names, written on the floor where nothing stands.
  const LABELS: Record<string, [number, number]> = {
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
  for (const room of ROOMS) {
    const [lx, ly] = LABELS[room.name] ?? [(room.x + room.w / 2) * TILE, (room.y + 1) * TILE];
    scene.add
      .text(lx, ly, room.name.toUpperCase(), { fontFamily: "sans-serif", fontSize: "14px", fontStyle: "bold", color: "#ffffff" })
      .setOrigin(0.5)
      .setAlpha(0.3)
      .setDepth(0.9);
  }
}

// ---------------------------------------------------------------------------- props

type G = Phaser.GameObjects.Graphics;

/** Draw a furniture or object picture, top-down, filling (0,0)–(w,h). */
function paintProp(g: G, pt: PropType) {
  const { w, h, color: c, accent: a } = pt;
  const r = rng(pt.id.length * 97 + w * 7 + h);
  const body = (rad = 4) => {
    g.fillStyle(a).fillRoundedRect(0, 0, w, h, rad);
    g.fillStyle(c).fillRoundedRect(2, 2, w - 4, h - 4, Math.max(1, rad - 1));
    g.fillStyle(0xffffff, 0.1).fillRoundedRect(3, 3, w - 6, 3, 1);
  };

  switch (pt.id) {
    case "sofa": {
      body(8);
      g.fillStyle(dark(c, 0.25)).fillRoundedRect(3, 3, w - 6, h * 0.28, 5); // back
      g.fillStyle(dark(c, 0.15)).fillRoundedRect(3, 3, 12, h - 6, 5).fillRoundedRect(w - 15, 3, 12, h - 6, 5); // arms
      const cw = (w - 36) / 3;
      for (let i = 0; i < 3; i++) {
        g.fillStyle(light(c, 0.12)).fillRoundedRect(18 + i * cw + 1, h * 0.3, cw - 2, h * 0.6, 4);
        g.fillStyle(0xffffff, 0.12).fillRoundedRect(18 + i * cw + 3, h * 0.3 + 2, cw - 6, 3, 1);
      }
      break;
    }
    case "bed": {
      body(5);
      g.fillStyle(0xeef1f7).fillRoundedRect(5, 5, w - 10, h - 10, 4); // sheet
      g.fillStyle(c).fillRoundedRect(5, h * 0.38, w - 10, h * 0.57, 4); // blanket
      g.fillStyle(light(c, 0.25)).fillRect(5, h * 0.38, w - 10, 6); // fold
      g.fillStyle(0xffffff).fillRoundedRect(10, 10, (w - 30) / 2, 20, 5).fillRoundedRect(w / 2 + 5, 10, (w - 30) / 2, 20, 5);
      g.lineStyle(1, 0x000000, 0.12).strokeRoundedRect(10, 10, (w - 30) / 2, 20, 5).strokeRoundedRect(w / 2 + 5, 10, (w - 30) / 2, 20, 5);
      break;
    }
    case "table": {
      body(5);
      g.lineStyle(1, a, 0.35);
      for (let y = 8; y < h - 4; y += 7) g.lineBetween(5, y, w - 5, y + (r() - 0.5) * 2);
      for (const [px, py] of [[w * 0.3, h / 2], [w * 0.7, h / 2]] as const) {
        g.fillStyle(0xf4f0e8).fillCircle(px, py, 9);
        g.fillStyle(0xdad4c6).fillCircle(px, py, 5);
      }
      break;
    }
    case "coffee_table": {
      body(5);
      g.lineStyle(2, a, 0.6).strokeRoundedRect(6, 6, w - 12, h - 12, 3);
      g.fillStyle(0x4a6fa5).fillRect(w * 0.2, h * 0.3, 16, 11);
      g.fillStyle(0xe8e8ee).fillCircle(w * 0.72, h * 0.5, 5);
      break;
    }
    case "fridge": {
      body(4);
      g.fillStyle(light(c, 0.2)).fillRoundedRect(4, 4, w - 8, h * 0.42, 3);
      g.fillStyle(a).fillRect(4, h * 0.46, w - 8, 2);
      g.fillStyle(0x6b7380).fillRoundedRect(w - 11, 8, 4, 12, 1).fillRoundedRect(w - 11, h * 0.52, 4, 12, 1);
      break;
    }
    case "counter": {
      body(3);
      g.fillStyle(light(c, 0.15)).fillRect(3, 3, w - 6, h - 6);
      g.fillStyle(0x2c2f36).fillCircle(w * 0.18, h / 2, 6).fillCircle(w * 0.18 + 15, h / 2, 6);
      g.lineStyle(2, 0x6b7380).strokeCircle(w * 0.18, h / 2, 6).strokeCircle(w * 0.18 + 15, h / 2, 6);
      g.fillStyle(0x9aa6b4).fillRoundedRect(w * 0.62, 5, 34, h - 10, 4);
      g.fillStyle(0x7a8794).fillRoundedRect(w * 0.62 + 3, 8, 28, h - 16, 3);
      g.fillStyle(0x4a525c).fillCircle(w * 0.62 + 17, h / 2, 2.5);
      break;
    }
    case "tv_stand": {
      body(3);
      g.fillStyle(0x0d1018).fillRoundedRect(8, 4, w - 16, h - 8, 2);
      g.fillStyle(0x1a2438).fillRect(10, 6, w - 20, h - 12);
      g.fillStyle(0xffffff, 0.12).fillTriangle(12, 6, 36, 6, 12, h - 8);
      break;
    }
    case "bathtub": {
      body(10);
      g.fillStyle(0xb9d4e4).fillRoundedRect(7, 6, w - 14, h - 12, 9);
      g.fillStyle(0x9cc2d8).fillRoundedRect(10, 9, w - 20, h - 18, 7);
      g.fillStyle(0xc9ced6).fillCircle(14, h / 2, 4);
      g.fillStyle(0x6b7380).fillCircle(w - 16, h / 2, 2.5);
      break;
    }
    case "desk": {
      body(4);
      g.fillStyle(0x15171d).fillRect(w * 0.32, 5, 26, 4); // monitor stand edge
      g.fillStyle(0x1b2030).fillRoundedRect(w * 0.3, 7, 30, 16, 2);
      g.fillStyle(0x5aa0d8).fillRect(w * 0.3 + 2, 9, 26, 12);
      g.fillStyle(0xd6d8de).fillRoundedRect(w * 0.3, h - 14, 30, 8, 2);
      g.fillStyle(0xf2f2f2).fillCircle(w - 14, h - 14, 4);
      g.fillStyle(0xd96b4a).fillCircle(w - 14, h - 14, 2.5);
      break;
    }
    case "bookshelf":
    case "shelf": {
      body(2);
      g.fillStyle(dark(c, 0.35)).fillRect(3, 3, w - 6, h - 6);
      const palette = pt.id === "bookshelf" ? [0xb5483a, 0x3a6ea5, 0x4f8a4f, 0xd4a93a, 0x7a4a9a, 0xd9d3c3] : [0xc9a566, 0xb59463, 0x8c8c94, 0xa6a6ae];
      let x = 5;
      while (x < w - 7) {
        const bw = pt.id === "bookshelf" ? 3 + Math.floor(r() * 4) : 8 + Math.floor(r() * 8);
        const col = palette[Math.floor(r() * palette.length)]!;
        g.fillStyle(col).fillRect(x, 5, Math.min(bw, w - 6 - x), h - 10);
        g.fillStyle(0x000000, 0.2).fillRect(x, 5, 1, h - 10);
        x += bw + 1;
      }
      break;
    }
    case "workbench": {
      body(3);
      g.fillStyle(dark(c, 0.1)).fillRect(4, 4, w - 8, 6);
      g.lineStyle(2, 0x9aa0aa).lineBetween(14, h * 0.55, 40, h * 0.55).strokeCircle(44, h * 0.55, 4);
      g.fillStyle(0xc44a3a).fillRoundedRect(w * 0.55, h * 0.4, 20, 8, 2);
      g.fillStyle(0x4a525c).fillRect(w - 18, 10, 12, h - 20);
      break;
    }
    case "car": {
      g.fillStyle(0x15171d).fillRoundedRect(8, -1, 18, 6, 2).fillRoundedRect(w - 26, -1, 18, 6, 2);
      g.fillRoundedRect(8, h - 5, 18, 6, 2).fillRoundedRect(w - 26, h - 5, 18, 6, 2);
      g.fillStyle(a).fillRoundedRect(0, 2, w, h - 4, 14);
      g.fillStyle(c).fillRoundedRect(2, 4, w - 4, h - 8, 12);
      g.fillStyle(light(c, 0.18)).fillRoundedRect(w * 0.3, 8, w * 0.36, h - 16, 6); // roof
      g.fillStyle(0x9fd0ea).fillRoundedRect(w * 0.66, 9, 12, h - 18, 3).fillRoundedRect(w * 0.18, 9, 10, h - 18, 3); // windows
      g.fillStyle(0xfff2b0).fillRect(w - 6, 8, 4, 8).fillRect(w - 6, h - 16, 4, 8);
      g.fillStyle(0xd94a4a).fillRect(2, 8, 3, 8).fillRect(2, h - 16, 3, 8);
      break;
    }
    case "bench": {
      body(3);
      g.lineStyle(1, a, 0.8);
      for (let x = 10; x < w - 4; x += 10) g.lineBetween(x, 3, x, h - 3);
      break;
    }
    case "dresser": {
      body(3);
      g.lineStyle(1, a, 0.9).lineBetween(w / 3, 4, w / 3, h - 4).lineBetween((2 * w) / 3, 4, (2 * w) / 3, h - 4);
      g.fillStyle(0xd9c27a).fillCircle(w / 6, h / 2, 2).fillCircle(w / 2, h / 2, 2).fillCircle((5 * w) / 6, h / 2, 2);
      break;
    }
    case "crate": {
      body(2);
      g.lineStyle(2, a, 0.85).strokeRect(5, 5, w - 10, h - 10).lineBetween(5, 5, w - 5, h - 5).lineBetween(w - 5, 5, 5, h - 5);
      g.fillStyle(0x3a2a18).fillCircle(5, 5, 1.3).fillCircle(w - 5, 5, 1.3).fillCircle(5, h - 5, 1.3).fillCircle(w - 5, h - 5, 1.3);
      break;
    }
    case "box": {
      body(2);
      g.fillStyle(0xd8c49a).fillRect(w / 2 - 2, 2, 4, h - 4);
      g.fillStyle(0xffffff, 0.8).fillRect(w * 0.12, h * 0.55, 9, 6);
      break;
    }
    case "barrel": {
      g.fillStyle(a).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(c).fillCircle(w / 2, h / 2, w / 2 - 2);
      g.lineStyle(2, a, 0.9).strokeCircle(w / 2, h / 2, w * 0.32).strokeCircle(w / 2, h / 2, w * 0.18);
      g.lineStyle(1, a, 0.5);
      for (let i = 0; i < 4; i++) g.lineBetween(w / 2, h / 2, w / 2 + Math.cos(i * 0.785) * w * 0.45, h / 2 + Math.sin(i * 0.785) * h * 0.45);
      break;
    }
    case "plant": {
      g.fillStyle(0x6b4a30).fillCircle(w / 2, h / 2, w * 0.36);
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        const lx = w / 2 + Math.cos(ang) * w * 0.26;
        const ly = h / 2 + Math.sin(ang) * h * 0.26;
        g.fillStyle(i % 2 ? a : c).fillEllipse(lx, ly, w * 0.34, w * 0.2);
      }
      g.fillStyle(light(c, 0.35)).fillCircle(w / 2, h / 2, w * 0.12);
      break;
    }
    case "lamp": {
      g.fillStyle(0xffe9a0, 0.35).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(a).fillCircle(w / 2, h / 2, w * 0.4);
      g.fillStyle(c).fillCircle(w / 2, h / 2, w * 0.34);
      g.fillStyle(0xfff6cf).fillCircle(w / 2, h / 2, w * 0.17);
      break;
    }
    case "vase": {
      g.fillStyle(a).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(c).fillCircle(w / 2, h / 2, w / 2 - 2);
      g.fillStyle(0x2b2e36).fillCircle(w / 2, h / 2, w * 0.28);
      g.fillStyle(0xe8566f).fillCircle(w * 0.42, h * 0.45, 2.5);
      g.fillStyle(0xf5c542).fillCircle(w * 0.58, h * 0.5, 2.5);
      g.fillStyle(0xffffff).fillCircle(w * 0.5, h * 0.62, 2.2);
      break;
    }
    case "globe": {
      g.fillStyle(0x6b4a30).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(c).fillCircle(w / 2, h / 2, w / 2 - 3);
      g.fillStyle(0x6bb36b).fillEllipse(w * 0.4, h * 0.42, 9, 7).fillEllipse(w * 0.62, h * 0.6, 7, 6).fillEllipse(w * 0.55, h * 0.3, 5, 4);
      g.lineStyle(1, 0xffffff, 0.35).strokeCircle(w / 2, h / 2, w * 0.3).lineBetween(w * 0.15, h / 2, w * 0.85, h / 2);
      g.fillStyle(0xffffff, 0.22).fillEllipse(w * 0.38, h * 0.32, 8, 4);
      break;
    }
    case "toilet": {
      g.fillStyle(a).fillRoundedRect(0, 0, w, h, 6);
      g.fillStyle(c).fillRoundedRect(2, 2, w - 4, 9, 3); // tank
      g.fillStyle(0xf4f4f8).fillEllipse(w / 2, h * 0.62, w * 0.78, h * 0.58);
      g.fillStyle(0xcfd3dc).fillEllipse(w / 2, h * 0.64, w * 0.5, h * 0.36);
      break;
    }
    case "sink": {
      body(5);
      g.fillStyle(0xcdd2dc).fillEllipse(w / 2, h * 0.55, w * 0.68, h * 0.55);
      g.fillStyle(0x6b7380).fillCircle(w / 2, h * 0.2, 2.2);
      g.fillStyle(0x4a525c).fillCircle(w / 2, h * 0.58, 1.8);
      break;
    }
    case "trashcan": {
      g.fillStyle(a).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(c).fillCircle(w / 2, h / 2, w / 2 - 2);
      g.lineStyle(2, a).strokeCircle(w / 2, h / 2, w * 0.3);
      g.fillStyle(a).fillRoundedRect(w / 2 - 4, h / 2 - 1.5, 8, 3, 1);
      break;
    }
    case "stool": {
      g.fillStyle(a).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(c).fillCircle(w / 2, h / 2, w / 2 - 2);
      g.fillStyle(light(c, 0.2), 0.7).fillCircle(w * 0.42, h * 0.4, w * 0.18);
      break;
    }
    case "nightstand": {
      body(3);
      g.lineStyle(1, a, 0.9).lineBetween(4, h / 2, w - 4, h / 2);
      g.fillStyle(0xd9c27a).fillCircle(w / 2, h * 0.3, 1.8).fillCircle(w / 2, h * 0.75, 1.8);
      break;
    }
    case "wardrobe": {
      body(3);
      g.lineStyle(1, a, 0.9).lineBetween(w / 2, 4, w / 2, h - 4).strokeRect(5, 5, w / 2 - 7, h - 10).strokeRect(w / 2 + 2, 5, w / 2 - 7, h - 10);
      g.fillStyle(0xd9c27a).fillCircle(w / 2 - 4, h / 2, 1.8).fillCircle(w / 2 + 4, h / 2, 1.8);
      break;
    }
    case "shower": {
      g.fillStyle(a).fillRoundedRect(0, 0, w, h, 3);
      g.fillStyle(c).fillRoundedRect(2, 2, w - 4, h - 4, 2);
      g.lineStyle(1, 0xffffff, 0.6);
      for (let k = 8; k < w; k += 8) g.lineBetween(k, 2, k, h - 2);
      g.fillStyle(0x6b7380).fillCircle(w / 2, h / 2, 3);
      g.fillStyle(0xc9ced6).fillCircle(w * 0.25, h * 0.25, 5);
      g.lineStyle(2, 0x9fb3c0).strokeRect(1, 1, w - 2, h - 2);
      break;
    }
    case "basket": {
      g.fillStyle(a).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(c).fillCircle(w / 2, h / 2, w / 2 - 2);
      g.lineStyle(1, a, 0.7).strokeCircle(w / 2, h / 2, w * 0.36);
      g.fillStyle(0xe8ecf4).fillEllipse(w * 0.45, h * 0.45, 12, 9);
      g.fillStyle(0x6b9bd2).fillEllipse(w * 0.58, h * 0.58, 9, 8);
      break;
    }
    case "toolbox": {
      body(3);
      g.fillStyle(0x9aa0aa).fillRoundedRect(w / 2 - 7, 3, 14, 4, 2);
      g.fillStyle(0xd9d9d9).fillRect(5, h / 2 - 1, 4, 3).fillRect(w - 9, h / 2 - 1, 4, 3);
      g.lineStyle(1, a, 0.9).lineBetween(3, h / 2, w - 3, h / 2);
      break;
    }
    case "tire": {
      g.fillStyle(a).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(c).fillCircle(w / 2, h / 2, w / 2 - 2);
      g.fillStyle(0x6b7078).fillCircle(w / 2, h / 2, w * 0.24);
      g.fillStyle(0x9aa0aa).fillCircle(w / 2, h / 2, w * 0.1);
      break;
    }
    case "bucket": {
      g.fillStyle(a).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(c).fillCircle(w / 2, h / 2, w / 2 - 2);
      g.fillStyle(dark(c, 0.35)).fillCircle(w / 2, h / 2, w * 0.32);
      g.lineStyle(1.5, 0xc9ced6).lineBetween(2, h / 2, w - 2, h / 2);
      break;
    }
    case "cabinet": {
      body(2);
      g.lineStyle(1, a, 0.9).lineBetween(3, h / 2, w - 3, h / 2);
      g.fillStyle(0x4a525c).fillRect(w / 2 - 4, h * 0.25, 8, 2).fillRect(w / 2 - 4, h * 0.75, 8, 2);
      break;
    }
    case "umbrella": {
      g.fillStyle(a).fillCircle(w / 2, h / 2, w / 2);
      g.fillStyle(0x2c3036).fillCircle(w / 2, h / 2, w * 0.36);
      g.fillStyle(0xd94a4a).fillCircle(w * 0.4, h * 0.45, 2.2);
      g.fillStyle(0x4a8ad9).fillCircle(w * 0.6, h * 0.5, 2.2);
      g.fillStyle(0xe0c64a).fillCircle(w * 0.5, h * 0.62, 2);
      break;
    }
    case "chair":
    case "armchair": {
      body(pt.id === "chair" ? 4 : 7);
      g.fillStyle(dark(c, 0.25)).fillRoundedRect(3, 3, w - 6, Math.max(6, h * 0.24), 3);
      if (pt.id === "armchair") g.fillStyle(dark(c, 0.15)).fillRoundedRect(3, 3, 7, h - 6, 3).fillRoundedRect(w - 10, 3, 7, h - 6, 3);
      g.fillStyle(light(c, 0.12)).fillRoundedRect(pt.id === "chair" ? 5 : 11, h * 0.34, w - (pt.id === "chair" ? 10 : 22), h * 0.52, 3);
      break;
    }
    default:
      body(4);
  }
}

/** A flat dark copy of a prop's outline, used as its drop shadow. */
function paintShadow(g: G, pt: PropType) {
  g.fillStyle(0x000000);
  if (pt.shape === "circle") g.fillCircle(pt.w / 2, pt.h / 2, pt.w / 2);
  else g.fillRoundedRect(0, 0, pt.w, pt.h, 6);
}

export function makePropTextures(scene: Phaser.Scene) {
  for (const pt of Object.values(PROP_TYPES)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    paintProp(g, pt);
    g.generateTexture(`prop_${pt.id}`, pt.w, pt.h);
    g.clear();
    paintShadow(g, pt);
    g.generateTexture(`shadow_${pt.id}`, pt.w, pt.h);
    g.destroy();
  }
}

/** Furniture and objects placed around the rooms, each with a soft shadow. */
export function placeProps(scene: Phaser.Scene) {
  for (const p of PLACED_PROPS) {
    const turn = (p.rot * Math.PI) / 2;
    if (!p.stacked) scene.add.image(p.x + 3, p.y + 4, `shadow_${p.type}`).setAlpha(0.3).setDepth(1.5).setRotation(turn);
    scene.add.image(p.x, p.y, `prop_${p.type}`).setDepth(p.stacked ? 2.2 : 2).setRotation(turn);
  }
}

// ----------------------------------------------------------------------- characters

/** Jacket colours for players 1–4; the hunter is always red. */
const JACKETS = [0x3fbf6e, 0xe8963a, 0x9b7be0, 0x3fb4e0];
export const CHAR_SIZE = 36;

/** Which character picture a player uses. */
export function charKey(role: string, id: string): string {
  if (role === "hunter") return "char_hunter";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `char_${h % JACKETS.length}`;
}

/** The colour used for a player's jacket (also handy for HUD bits). */
export function jacketColor(key: string): number {
  if (key === "char_hunter") return 0xd83a3a;
  return JACKETS[Number(key.slice(5))] ?? 0xffffff;
}

/** Little people seen from above, facing right (they are rotated in game). */
export function makeCharacterTextures(scene: Phaser.Scene) {
  const draw = (key: string, jacket: number, hunter: boolean) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const cx = CHAR_SIZE / 2;
    const cy = CHAR_SIZE / 2;
    g.fillStyle(0x000000, 0.28).fillEllipse(cx + 1, cy + 3, 24, 28); // shadow
    g.fillStyle(dark(jacket, 0.25)).fillEllipse(cx - 1, cy, 15, 28); // shoulders (outline)
    g.fillStyle(jacket).fillEllipse(cx - 1, cy, 13, 26);
    g.fillStyle(0xf1c9a5).fillCircle(cx + 4, cy - 11, 3.2).fillCircle(cx + 4, cy + 11, 3.2); // hands
    if (hunter) {
      g.fillStyle(0x3a3f4a).fillRoundedRect(cx + 5, cy + 9, 12, 4, 1); // flashlight
      g.fillStyle(0xfff2b0).fillRect(cx + 16, cy + 9, 2.5, 4);
    }
    g.fillStyle(hunter ? 0x7a1f1f : 0x5a3a24).fillCircle(cx, cy, 8.2); // hair / cap
    g.fillStyle(0xf1c9a5).fillCircle(cx + 2.2, cy, 6.4); // face
    if (hunter) g.fillStyle(0x4a1313).fillRoundedRect(cx + 5, cy - 5, 6, 10, 2); // cap brim
    g.generateTexture(key, CHAR_SIZE, CHAR_SIZE);
    g.destroy();
  };
  JACKETS.forEach((c, i) => draw(`char_${i}`, c, false));
  draw("char_hunter", 0xd83a3a, true);
}
