import Phaser from "phaser";
import { VISION_RADIUS, Sight } from "@prop-hunt/shared";

const FADE = 60; // width of the soft edge, pixels; it is fully dark at VISION_RADIUS
const HALF = VISION_RADIUS;
const SIZE = HALF * 2;

/**
 * The hunter's vision. Everything is black except what the hunter can see:
 * within a circle, and not behind walls or big furniture.
 *
 * One small canvas follows the hunter: it is filled black, then the lit area is
 * erased from it. Four black rectangles cover the rest of the world.
 */
export class Fog {
  private image: Phaser.GameObjects.Image;
  private canvasTex: Phaser.Textures.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private rects: Phaser.GameObjects.Rectangle[];
  private blackout: Phaser.GameObjects.Rectangle;

  constructor(private scene: Phaser.Scene, private worldW: number, private worldH: number) {
    this.canvasTex = scene.textures.createCanvas("fog_view", SIZE, SIZE)!;
    this.ctx = this.canvasTex.getContext();
    this.image = scene.add.image(0, 0, "fog_view").setDepth(50).setVisible(false);
    this.rects = [0, 1, 2, 3].map(() => scene.add.rectangle(0, 0, 1, 1, 0x000000, 1).setOrigin(0).setDepth(50).setVisible(false));
    // Total darkness (hunter waiting while props hide). Sits on screen, not in the world.
    this.blackout = scene.add.rectangle(0, 0, 1, 1, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(50).setVisible(false);
  }

  /** Total darkness. */
  blind() {
    this.image.setVisible(false);
    this.rects.forEach((r) => r.setVisible(false));
    this.blackout.setSize(this.scene.scale.width, this.scene.scale.height).setVisible(true);
  }

  /** What the hunter at (x, y) can see; everything else goes black. */
  see(x: number, y: number) {
    this.blackout.setVisible(false);

    // Snap the canvas to whole pixels so the edges stay sharp.
    const ox = Math.round(x);
    const oy = Math.round(y);
    const left = ox - HALF;
    const top = oy - HALF;

    const sight = new Sight(x, y, HALF);
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Erase the lit area. The gradient makes it fade out toward the edge of the circle.
    ctx.globalCompositeOperation = "destination-out";
    const cx = x - left;
    const cy = y - top;
    const grad = ctx.createRadialGradient(cx, cy, VISION_RADIUS - FADE, cx, cy, VISION_RADIUS);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;

    ctx.beginPath();
    const poly = sight.polygon();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x - left, p.y - top) : ctx.lineTo(p.x - left, p.y - top)));
    ctx.closePath();
    ctx.fill();

    // Walls and furniture whose faces the hunter can see are lit too.
    for (const o of sight.litOccluders()) ctx.fillRect(o.x - left, o.y - top, o.w, o.h);
    this.canvasTex.refresh();

    this.image.setPosition(ox, oy).setVisible(true);

    const W = this.worldW;
    const H = this.worldH;
    const pad = 4000; // beyond the world, in case the camera shows outside it
    const l = left;
    const r = left + SIZE;
    const t = top;
    const b = top + SIZE;
    const set = (i: number, rx: number, ry: number, rw: number, rh: number) =>
      this.rects[i]!.setPosition(rx, ry).setSize(Math.max(rw, 1), Math.max(rh, 1)).setVisible(true);
    // Each rectangle overlaps the canvas by 1px so no hairline gap shows between them.
    set(0, -pad, -pad, W + 2 * pad, t + pad + 1); // above
    set(1, -pad, b - 1, W + 2 * pad, H + pad - b + 1); // below
    set(2, -pad, t, l + pad + 1, b - t); // left
    set(3, r - 1, t, W + pad - r + 1, b - t); // right
  }

  hide() {
    this.image.setVisible(false);
    this.rects.forEach((rect) => rect.setVisible(false));
    this.blackout.setVisible(false);
  }
}
