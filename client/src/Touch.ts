import Phaser from "phaser";
import { FONT_BODY, FONT_DISPLAY } from "./theme.ts";

/** What the on-screen buttons can do. The scene supplies these. */
export interface TouchActions {
  disguise(): void;
  undisguise(): void;
  rotate(): void;
  taunt(): void;
  ability(): void;
  swing(): void;
  /** Hold to inspect: true when the finger goes down, false when it lifts. */
  inspect(on: boolean): void;
  mute(): void;
}

export type TouchMode = "none" | "prop" | "hunter";

/** Is this a phone or tablet (a screen you touch)? */
export function isTouchDevice(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

type Key = "main" | "a" | "b" | "ability" | "taunt" | "scores" | "mute";

interface Btn {
  color: number;
  circle: Phaser.GameObjects.Arc;
  text: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  radius: number;
  /** Which finger is holding it, if any. */
  holder: number | null;
}

const DEAD_ZONE = 0.14;
const STICK_RADIUS = 58;

/**
 * On-screen controls for phones and tablets: a floating joystick anywhere on the left half of the
 * screen, and buttons on the right that change with your role. Several fingers work at once.
 */
export class TouchControls {
  /** Movement from the joystick: each part from -1 to 1 (0, 0 when not touching). */
  vector = { x: 0, y: 0 };
  /** Is the scoreboard button held down? */
  scoresHeld = false;

  private base: Phaser.GameObjects.Arc;
  private thumb: Phaser.GameObjects.Arc;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private buttons = new Map<Key, Btn>();
  private mode: TouchMode = "none";
  /** Set by the scene: true where a button of the page is, so a touch there does not start the joystick. */
  blocked?: (x: number, y: number) => boolean;

  constructor(
    private scene: Phaser.Scene,
    private actions: TouchActions,
  ) {
    const d = 110;
    this.base = scene.add.circle(0, 0, STICK_RADIUS, 0xffffff, 0.1).setStrokeStyle(3, 0xffffff, 0.3).setScrollFactor(0).setDepth(d).setVisible(false);
    this.thumb = scene.add.circle(0, 0, 26, 0xffffff, 0.35).setStrokeStyle(2, 0xffffff, 0.6).setScrollFactor(0).setDepth(d + 1).setVisible(false);

    const colors: Record<Key, number> = { main: 0x4ade80, a: 0x60a5fa, b: 0xf59e0b, ability: 0xa78bfa, taunt: 0xf472b6, scores: 0x94a3b8, mute: 0x94a3b8 };
    for (const key of Object.keys(colors) as Key[]) {
      const color = colors[key];
      const circle = scene.add.circle(0, 0, 40, color, 0.28).setStrokeStyle(3, color, 0.85).setScrollFactor(0).setDepth(d).setVisible(false);
      const text = scene.add
        .text(0, 0, "", { fontFamily: FONT_DISPLAY, fontSize: "20px", fontStyle: "600", color: "#ffffff", align: "center" })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(d + 1)
        .setVisible(false);
      const sub = scene.add
        .text(0, 0, "", { fontFamily: FONT_BODY, fontSize: "11px", color: "#e5e7eb", align: "center" })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(d + 1)
        .setVisible(false);
      this.buttons.set(key, { color, circle, text, sub, radius: 40, holder: null });
    }

    scene.input.addPointer(3); // joystick + two buttons at once
    scene.input.on("pointerdown", this.onDown, this);
    scene.input.on("pointermove", this.onMove, this);
    scene.input.on("pointerup", this.onUp, this);
    scene.input.on("pointerupoutside", this.onUp, this);
  }

  // ------------------------------------------------------------- what a press does

  private down(key: Key) {
    switch (key) {
      case "main":
        if (this.mode === "hunter") this.actions.swing();
        else if (this.mode === "prop") this.actions.disguise();
        break;
      case "a":
        if (this.mode === "hunter") this.actions.inspect(true);
        else if (this.mode === "prop") this.actions.undisguise();
        break;
      case "b":
        if (this.mode === "prop") this.actions.rotate();
        break;
      case "ability":
        this.actions.ability();
        break;
      case "taunt":
        if (this.mode === "prop") this.actions.taunt();
        break;
      case "scores":
        this.scoresHeld = true;
        break;
      case "mute":
        this.actions.mute();
        break;
    }
  }

  private up(key: Key) {
    if (key === "a" && this.mode === "hunter") this.actions.inspect(false);
    if (key === "scores") this.scoresHeld = false;
  }

  // -------------------------------------------------------------- touches

  private buttonAt(x: number, y: number): Key | null {
    for (const [key, b] of this.buttons) {
      if (!b.circle.visible) continue;
      if (Math.hypot(x - b.circle.x, y - b.circle.y) <= b.radius + 10) return key;
    }
    return null;
  }

  private onDown(pointer: Phaser.Input.Pointer) {
    if (!pointer.wasTouch) return;
    const key = this.buttonAt(pointer.x, pointer.y);
    if (key) {
      const b = this.buttons.get(key)!;
      if (b.holder !== null) return;
      b.holder = pointer.id;
      b.circle.setFillStyle(b.color, 0.65);
      this.down(key);
      return;
    }
    const { width, height } = this.scene.scale;
    if (this.stickId !== null || pointer.x > width * 0.5 || pointer.y < height * 0.18) return;
    if (this.blocked?.(pointer.x, pointer.y)) return;
    this.stickId = pointer.id;
    this.stickOrigin = { x: pointer.x, y: pointer.y };
    this.base.setPosition(pointer.x, pointer.y).setVisible(true);
    this.thumb.setPosition(pointer.x, pointer.y).setVisible(true);
    this.vector = { x: 0, y: 0 };
  }

  private onMove(pointer: Phaser.Input.Pointer) {
    if (pointer.id !== this.stickId) return;
    let dx = pointer.x - this.stickOrigin.x;
    let dy = pointer.y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    this.thumb.setPosition(this.stickOrigin.x + dx, this.stickOrigin.y + dy);
    const m = Math.min(1, len / STICK_RADIUS);
    if (m < DEAD_ZONE) {
      this.vector = { x: 0, y: 0 };
    } else {
      // Stretch past the dead zone so the full range still reaches 1.
      const k = (m - DEAD_ZONE) / (1 - DEAD_ZONE);
      this.vector = { x: (dx / (len || 1)) * k, y: (dy / (len || 1)) * k };
    }
  }

  private onUp(pointer: Phaser.Input.Pointer) {
    if (pointer.id === this.stickId) {
      this.stickId = null;
      this.vector = { x: 0, y: 0 };
      this.base.setVisible(false);
      this.thumb.setVisible(false);
    }
    for (const [key, b] of this.buttons) {
      if (b.holder === pointer.id) {
        b.holder = null;
        b.circle.setFillStyle(b.color, 0.28);
        this.up(key);
      }
    }
  }

  // --------------------------------------------------------------- layout

  private place(key: Key, x: number, y: number, r: number, label: string, sub: string, show: boolean) {
    const b = this.buttons.get(key)!;
    b.radius = r;
    b.circle.setRadius(Math.max(r, 1)).setPosition(x, y).setVisible(show);
    b.text.setText(label).setPosition(x, y - (sub ? r * 0.18 : 0)).setFontSize(`${Math.max(8, Math.round(r * (label.length > 2 ? 0.36 : 0.55)))}px`).setVisible(show);
    b.sub.setText(sub).setPosition(x, y + r * 0.18).setFontSize(`${Math.max(8, Math.round(r * 0.26))}px`).setVisible(show && sub !== "");
  }

  /** Called every frame: shows the right buttons for the player's role and lays them out for this screen. */
  update(mode: TouchMode, ability: { label: string; cooldown: number } | null) {
    // If the role changed while a button was held, let go cleanly.
    if (mode !== this.mode) {
      for (const [key, b] of this.buttons) {
        if (b.holder !== null) {
          b.holder = null;
          b.circle.setFillStyle(b.color, 0.28);
          this.up(key);
        }
      }
      this.mode = mode;
    }

    const { width, height } = this.scene.scale;
    const k = Phaser.Math.Clamp(Math.min(width, height) / 420, 0.85, 1.5);
    const R = 42 * k;
    const cx = width - 28 * k - R;
    const cy = height - 28 * k - R;
    const cd = ability?.cooldown ?? 0;
    const abilityOn = !!ability;
    const abilityLabel = cd > 0 ? `${cd}` : "F";
    const abilitySub = cd > 0 ? "" : (ability?.label ?? "");

    if (mode === "prop") {
      this.place("main", cx, cy, R, "E", "Become", true);
      this.place("a", cx - R * 2.15, cy + R * 0.3, R * 0.68, "Q", "Undo", true);
      this.place("b", cx - R * 0.3, cy - R * 2.15, R * 0.68, "R", "Turn", true);
      this.place("ability", cx - R * 1.7, cy - R * 1.7, R * 0.7, abilityLabel, abilitySub, abilityOn);
      this.place("taunt", cx - R * 3.7, cy + R * 0.3, R * 0.62, "Taunt", "", true);
    } else if (mode === "hunter") {
      this.place("main", cx, cy, R, "Swing", "", true);
      this.place("a", cx - R * 2.15, cy + R * 0.3, R * 0.8, "Inspect", "hold", true);
      this.place("b", 0, 0, 0, "", "", false);
      this.place("taunt", 0, 0, 0, "", "", false);
      this.place("ability", cx - R * 0.3, cy - R * 2.15, R * 0.72, abilityLabel, abilitySub, abilityOn);
    } else {
      for (const key of ["main", "a", "b", "ability", "taunt"] as Key[]) this.place(key, 0, 0, 0, "", "", false);
    }
    this.place("scores", width - 30 * k, 92 * k, 17 * k, "≡", "", true);
    this.place("mute", width - 30 * k, 92 * k + 42 * k, 15 * k, "♪", "", true);
  }

  destroy() {
    this.scene.input.off("pointerdown", this.onDown, this);
    this.scene.input.off("pointermove", this.onMove, this);
    this.scene.input.off("pointerup", this.onUp, this);
    this.scene.input.off("pointerupoutside", this.onUp, this);
  }
}
