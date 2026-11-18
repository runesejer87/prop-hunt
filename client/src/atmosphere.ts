import Phaser from "phaser";
import { TILE, type GameMap } from "@prop-hunt/shared";

/** Small seeded random numbers, so a map always gets the same wall details. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Kind = "window" | "picture" | "vent" | "sconce" | "clock" | "poster";

const BLEND_ADD = Phaser.BlendModes.ADD;

/**
 * Quiet touches that make the place feel lived in: things on the walls (windows, pictures, vents, lamps, clocks),
 * sunbeams with drifting dust, slow cloud shadows and a little steam over ovens. None of it changes the game,
 * and nothing here looks like a hiding object, so it never gives a hider away.
 * Everything uses the shared "glow" texture or small Graphics, so it is cheap.
 */
export function placeAtmosphere(scene: Phaser.Scene, map: GameMap) {
  const rnd = seeded(map.id.length * 7919 + map.cols * 31 + map.rows);
  const glow = (x: number, y: number, size: number, tint: number, alpha: number, depth: number, add = true) => {
    const img = scene.add.image(x, y, "glow").setTint(tint).setAlpha(alpha).setDepth(depth).setDisplaySize(size, size);
    if (add) img.setBlendMode(BLEND_ADD);
    return img;
  };

  // ---------------------------------------------------------------- wall details
  let sinceLast = 99;
  let lastRow = -1;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (row !== lastRow) {
        sinceLast = 99;
        lastRow = row;
      }
      sinceLast++;
      // Only the south face of a wall that looks onto a room (the part you can see in front of it).
      if (!map.isWallTile(col, row) || map.isWallTile(col, row + 1) || map.roomIndexAt(col, row + 1) < 0) continue;
      if (sinceLast < 3 || rnd() > 0.42) continue;
      sinceLast = 0;
      const r = rnd();
      const kind: Kind = r < 0.3 ? "window" : r < 0.56 ? "picture" : r < 0.66 ? "vent" : r < 0.78 ? "sconce" : r < 0.86 ? "clock" : "poster";
      const x = col * TILE;
      const y = row * TILE + TILE - 11; // the front strip of the wall is the bottom 12 px
      drawDetail(scene, kind, x, y, rnd, glow, map);
    }
  }

  // ------------------------------------------------------------ cloud shadows
  const clouds = Math.max(2, Math.round(map.width / 600));
  for (let i = 0; i < clouds; i++) {
    const c = glow(-400, rnd() * map.height, 480 + rnd() * 260, 0x000000, 0.07, 2.8, false);
    c.setScale(c.scaleX, c.scaleY * 0.6);
    scene.tweens.add({ targets: c, x: map.width + 400, duration: 70000 + rnd() * 60000, repeat: -1, delay: -rnd() * 60000 });
  }

  // ------------------------------------------------------------------- steam
  for (const p of map.props) {
    if (p.type !== "oven") continue;
    for (let k = 0; k < 2; k++) {
      const s = glow(p.x + (k - 0.5) * 14, p.y, 10, 0xffffff, 0, 2.7, false);
      scene.tweens.add({
        targets: s,
        y: p.y - 34,
        x: s.x + (rnd() - 0.5) * 16,
        alpha: { from: 0.22, to: 0 },
        scale: { from: s.scaleX, to: s.scaleX * 2.6 },
        duration: 2600 + rnd() * 1200,
        repeat: -1,
        delay: rnd() * 2600,
      });
    }
  }
}

function drawDetail(
  scene: Phaser.Scene,
  kind: Kind,
  x: number,
  y: number,
  rnd: () => number,
  glow: (x: number, y: number, size: number, tint: number, alpha: number, depth: number, add?: boolean) => Phaser.GameObjects.Image,
  map: GameMap,
) {
  const g = scene.add.graphics().setDepth(1.1);
  const cx = x + TILE / 2;
  switch (kind) {
    case "window": {
      g.fillStyle(0x1b1d26).fillRect(x + 2, y, TILE - 4, 10);
      g.fillStyle(0xbfe3ff).fillRect(x + 4, y + 1, TILE - 8, 7);
      g.fillStyle(0xffffff, 0.45).fillRect(x + 5, y + 2, 9, 2);
      g.fillStyle(0x1b1d26).fillRect(cx - 1, y + 1, 2, 7);
      // A sunbeam falling across the floor in front of it, with dust floating in it.
      const beam = scene.add.graphics().setDepth(0.7).setBlendMode(BLEND_ADD);
      const slant = 26 + rnd() * 18;
      for (const [len, a] of [[96, 0.025], [68, 0.03], [40, 0.035]] as const) {
        beam.fillStyle(0xffe2a8, a);
        beam.fillPoints(
          [
            new Phaser.Math.Vector2(x + 4, y + 10),
            new Phaser.Math.Vector2(x + TILE - 4, y + 10),
            new Phaser.Math.Vector2(x + TILE - 4 + slant * (len / 96), y + 10 + len),
            new Phaser.Math.Vector2(x + 4 + slant * (len / 96), y + 10 + len),
          ],
          true,
        );
      }
      scene.tweens.add({ targets: beam, alpha: { from: 0.55, to: 1 }, duration: 3500 + rnd() * 3000, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: rnd() * 3000 });
      for (let k = 0; k < 4; k++) {
        const t = rnd();
        const mx = x + 6 + (TILE - 12) * rnd() + slant * t * 0.8;
        const my = y + 14 + 80 * t;
        const mote = glow(mx, my, 4, 0xfff0c8, 0, 1.2);
        scene.tweens.add({
          targets: mote,
          x: mx + (rnd() - 0.5) * 18,
          y: my + 10 + rnd() * 16,
          alpha: { from: 0, to: 0.55 },
          duration: 3000 + rnd() * 3000,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
          delay: rnd() * 4000,
        });
      }
      break;
    }
    case "picture": {
      const palette = [0xc2573a, 0x4a7fa8, 0x6a9a5a, 0xd9a441, 0x8a5a9a];
      const w = 14 + Math.floor(rnd() * 8);
      const px = cx - w / 2 + (rnd() - 0.5) * 6;
      g.fillStyle(0x4a3322).fillRect(px, y + 1, w, 9);
      g.fillStyle(0xe9dfc8).fillRect(px + 1.5, y + 2.5, w - 3, 6);
      g.fillStyle(palette[Math.floor(rnd() * palette.length)]!, 0.9).fillRect(px + 3, y + 4, w - 6, 3);
      break;
    }
    case "poster": {
      const col = [0xf2c14e, 0xe0663a, 0x60a5fa, 0xf472b6][Math.floor(rnd() * 4)]!;
      g.fillStyle(col).fillRect(cx - 5, y + 1, 10, 9);
      g.fillStyle(0xffffff, 0.55).fillRect(cx - 3, y + 3, 6, 1).fillRect(cx - 3, y + 5, 4, 1);
      g.fillStyle(0x000000, 0.2).fillRect(cx - 5, y + 9, 10, 1);
      break;
    }
    case "vent": {
      g.fillStyle(0x1b1d26).fillRect(cx - 9, y + 2, 18, 7);
      g.fillStyle(0x59607a);
      for (let i = 0; i < 4; i++) g.fillRect(cx - 7, y + 3 + i * 1.6, 14, 0.9);
      break;
    }
    case "sconce": {
      g.fillStyle(0x1b1d26).fillRect(cx - 4, y + 3, 8, 6);
      g.fillStyle(0xffd98a).fillRect(cx - 3, y + 4, 6, 3);
      const halo = glow(cx, y + 18, 84, 0xffc66b, 0.26, 2.6);
      scene.tweens.add({ targets: halo, alpha: 0.2, duration: 1500 + rnd() * 1800, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: rnd() * 1500 });
      break;
    }
    case "clock": {
      g.fillStyle(0x1b1d26).fillCircle(cx, y + 5.5, 5.5);
      g.fillStyle(0xf4efe0).fillCircle(cx, y + 5.5, 4.4);
      // The hands turn very slowly (a full lap of the minute hand takes a minute).
      const hand = scene.add.graphics().setDepth(1.12).setPosition(cx, y + 5.5);
      hand.lineStyle(1, 0x1b1d26, 1).lineBetween(0, 0, 0, -3.6);
      scene.tweens.add({ targets: hand, angle: 360, duration: 60000, repeat: -1 });
      void map;
      break;
    }
  }
}
