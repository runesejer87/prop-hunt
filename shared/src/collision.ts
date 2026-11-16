import { TILE, isWallTile } from "./map.ts";
import { PLACED_PROPS, footprint } from "./props.ts";

/** Does a square of half-size `r`, centred at (x, y) pixels, touch a wall or a prop? */
export function isBlocked(x: number, y: number, r: number): boolean {
  const c0 = Math.floor((x - r) / TILE);
  const c1 = Math.floor((x + r) / TILE);
  const r0 = Math.floor((y - r) / TILE);
  const r1 = Math.floor((y + r) / TILE);
  for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) if (isWallTile(i, j)) return true;

  for (const p of PLACED_PROPS) {
    if (p.stacked) continue; // sits on something that already blocks
    const { w, h } = footprint(p.type, p.rot);
    if (Math.abs(x - p.x) < w / 2 + r && Math.abs(y - p.y) < h / 2 + r) return true;
  }
  return false;
}

/**
 * Move from (x, y) by (dx, dy) pixels, sliding along walls and props.
 * Used by the server and by the client's own-movement prediction.
 */
export function moveWithCollision(x: number, y: number, dx: number, dy: number, radius: number): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (!isBlocked(x + dx, y, radius)) nx = x + dx;
  if (!isBlocked(nx, y + dy, radius)) ny = y + dy;
  return { x: nx, y: ny };
}
