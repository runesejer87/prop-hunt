import Phaser from "phaser";
import { VISION_RADIUS } from "@prop-hunt/shared";

const FADE = 60; // soft edge, pixels
const HALF = VISION_RADIUS + FADE;

/**
 * The hunter's limited vision: everything outside a circle around the hunter is black.
 * One soft-edged circle image, plus four black rectangles to cover the rest of the world.
 */
export class Fog {
  private circle: Phaser.GameObjects.Image;
  private rects: Phaser.GameObjects.Rectangle[];
  private blackout: Phaser.GameObjects.Rectangle;

  constructor(private scene: Phaser.Scene, private worldW: number, private worldH: number) {
    const size = HALF * 2;
    const tex = scene.textures.createCanvas("fog_circle", size, size)!;
    const ctx = tex.getContext();
    // Opaque black everywhere, then a soft-edged hole in the middle.
    const grad = ctx.createRadialGradient(HALF, HALF, VISION_RADIUS - FADE, HALF, HALF, VISION_RADIUS + FADE);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();

    this.circle = scene.add.image(0, 0, "fog_circle").setDepth(50).setVisible(false);
    this.rects = [0, 1, 2, 3].map(() => scene.add.rectangle(0, 0, 1, 1, 0x000000, 1).setOrigin(0).setDepth(50).setVisible(false));
    // Total darkness (hunter waiting while props hide). Sits on screen, not in the world.
    this.blackout = scene.add.rectangle(0, 0, 1, 1, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(50).setVisible(false);
  }

  /** Total darkness. */
  blind() {
    this.circle.setVisible(false);
    this.rects.forEach((r) => r.setVisible(false));
    this.blackout.setSize(this.scene.scale.width, this.scene.scale.height).setVisible(true);
  }

  /** Circle of sight centred on (x, y). */
  see(x: number, y: number) {
    this.blackout.setVisible(false);
    this.circle.setPosition(x, y).setVisible(true);
    const l = x - HALF;
    const r = x + HALF;
    const t = y - HALF;
    const b = y + HALF;
    const W = this.worldW;
    const H = this.worldH;
    const pad = 4000; // beyond the world, in case the camera shows outside it
    const set = (i: number, rx: number, ry: number, rw: number, rh: number) =>
      this.rects[i]!.setPosition(rx, ry).setSize(Math.max(rw, 1), Math.max(rh, 1)).setVisible(true);
    set(0, -pad, -pad, W + 2 * pad, t + pad); // above
    set(1, -pad, b, W + 2 * pad, H + pad - b); // below
    set(2, -pad, t, l + pad, b - t); // left
    set(3, r, t, W + pad - r, b - t); // right
  }

  hide() {
    this.circle.setVisible(false);
    this.rects.forEach((rect) => rect.setVisible(false));
    this.blackout.setVisible(false);
  }
}
