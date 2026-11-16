import { TILE, isWallTile } from "./map.ts";
import { PLACED_PROPS, PROP_TYPES } from "./props.ts";

export interface Point {
  x: number;
  y: number;
}

/** A solid box that blocks sight: a wall tile or a large piece of furniture. */
export interface Occluder {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Spots just outside its open faces; if the viewer sees one, the box itself is lit. */
  samples: Point[];
}

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/** Large furniture blocks sight; small objects (the ones you can copy) do not. */
const BIG_PROPS = PLACED_PROPS.filter((p) => !PROP_TYPES[p.type]!.disguisable).map((p) => {
  const pt = PROP_TYPES[p.type]!;
  return { x: p.x - pt.w / 2, y: p.y - pt.h / 2, w: pt.w, h: pt.h };
});

const OUT = 1.5; // how far outside a face a sample point sits, in pixels

/** Sample points just outside one face of a box. `side` says which face. */
function faceSamples(x: number, y: number, w: number, h: number, side: "top" | "bottom" | "left" | "right"): Point[] {
  const fr = [0.15, 0.5, 0.85];
  switch (side) {
    case "top":
      return fr.map((f) => ({ x: x + w * f, y: y - OUT }));
    case "bottom":
      return fr.map((f) => ({ x: x + w * f, y: y + h + OUT }));
    case "left":
      return fr.map((f) => ({ x: x - OUT, y: y + h * f }));
    case "right":
      return fr.map((f) => ({ x: x + w + OUT, y: y + h * f }));
  }
}

function faceSegment(x: number, y: number, w: number, h: number, side: "top" | "bottom" | "left" | "right"): Segment {
  switch (side) {
    case "top":
      return { ax: x, ay: y, bx: x + w, by: y };
    case "bottom":
      return { ax: x, ay: y + h, bx: x + w, by: y + h };
    case "left":
      return { ax: x, ay: y, bx: x, by: y + h };
    case "right":
      return { ax: x + w, ay: y, bx: x + w, by: y + h };
  }
}

const SIDES = ["top", "bottom", "left", "right"] as const;

/**
 * Everything that could be seen (or hidden behind) from one spot, within `radius` pixels.
 * Build one per viewpoint and reuse it for the polygon and the "is this lit?" checks.
 */
export class Sight {
  readonly occluders: Occluder[] = [];
  private segments: Segment[] = [];

  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly radius: number,
  ) {
    const r = radius;
    const c0 = Math.floor((ox - r) / TILE) - 1;
    const c1 = Math.floor((ox + r) / TILE) + 1;
    const r0 = Math.floor((oy - r) / TILE) - 1;
    const r1 = Math.floor((oy + r) / TILE) + 1;

    // Wall tiles: only the faces that touch open floor matter.
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (!isWallTile(col, row)) continue;
        const x = col * TILE;
        const y = row * TILE;
        const open: (typeof SIDES)[number][] = [];
        if (!isWallTile(col, row - 1)) open.push("top");
        if (!isWallTile(col, row + 1)) open.push("bottom");
        if (!isWallTile(col - 1, row)) open.push("left");
        if (!isWallTile(col + 1, row)) open.push("right");
        if (open.length === 0) continue;
        this.add(x, y, TILE, TILE, open);
      }
    }
    // Big furniture: all four faces.
    for (const b of BIG_PROPS) {
      if (b.x > ox + r || b.x + b.w < ox - r || b.y > oy + r || b.y + b.h < oy - r) continue;
      this.add(b.x, b.y, b.w, b.h, SIDES);
    }
    // A frame around the view, so every ray ends somewhere.
    const f: Segment[] = [
      { ax: ox - r, ay: oy - r, bx: ox + r, by: oy - r },
      { ax: ox - r, ay: oy + r, bx: ox + r, by: oy + r },
      { ax: ox - r, ay: oy - r, bx: ox - r, by: oy + r },
      { ax: ox + r, ay: oy - r, bx: ox + r, by: oy + r },
    ];
    this.segments.push(...f);
  }

  private add(x: number, y: number, w: number, h: number, sides: readonly (typeof SIDES)[number][]) {
    const samples: Point[] = [];
    for (const s of sides) {
      this.segments.push(faceSegment(x, y, w, h, s));
      samples.push(...faceSamples(x, y, w, h, s));
    }
    this.occluders.push({ x, y, w, h, samples });
  }

  /** Distance along a ray (unit direction) to the first thing it hits. */
  private castRay(dx: number, dy: number): number {
    let best = Infinity;
    for (const s of this.segments) {
      const sx = s.bx - s.ax;
      const sy = s.by - s.ay;
      const denom = dx * sy - dy * sx;
      if (Math.abs(denom) < 1e-9) continue;
      const px = s.ax - this.ox;
      const py = s.ay - this.oy;
      const t = (px * sy - py * sx) / denom;
      const u = (px * dy - py * dx) / denom;
      if (t >= 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  }

  /** The area lit from this spot, as polygon corners in angle order. */
  polygon(): Point[] {
    const angles: number[] = [];
    for (const s of this.segments) {
      for (const [x, y] of [
        [s.ax, s.ay],
        [s.bx, s.by],
      ] as const) {
        const a = Math.atan2(y - this.oy, x - this.ox);
        angles.push(a - 1e-4, a, a + 1e-4);
      }
    }
    angles.sort((a, b) => a - b);
    const pts: Point[] = [];
    for (const a of angles) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const t = this.castRay(dx, dy);
      if (t === Infinity) continue;
      pts.push({ x: this.ox + dx * t, y: this.oy + dy * t });
    }
    return pts;
  }

  /** Is the straight line to (tx, ty) clear of walls and big furniture? */
  sees(tx: number, ty: number): boolean {
    const dx = tx - this.ox;
    const dy = ty - this.oy;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    return this.castRay(dx / len, dy / len) >= len - 1e-3;
  }

  /** Walls and furniture with a face the viewer can see (they get drawn lit). */
  litOccluders(): Occluder[] {
    return this.occluders.filter((o) => o.samples.some((p) => this.sees(p.x, p.y)));
  }
}
