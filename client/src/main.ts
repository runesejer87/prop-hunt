import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "./ui.css";
import Phaser from "phaser";
import { loadFonts } from "./theme.ts";
import { loadIconImages } from "./icons.ts";
import { joinGame } from "./gate.ts";
import { GameScene } from "./GameScene.ts";

// Join first (this shows the password screen if the server needs one), then start the game.
await Promise.all([loadFonts(), loadIconImages()]);
const room = await joinGame();

const game = new Phaser.Game({
  type: Phaser.AUTO, // WebGL when available
  parent: "game",
  backgroundColor: "#1b1d23",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  // Several fingers at once (joystick plus buttons), and no right-click menu.
  input: { activePointers: 4 },
  disableContextMenu: true,
  scene: [],
});
game.scene.add("GameScene", GameScene, true, { room });

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

// Make the game installable (PWA). Skipped in dev so it never serves stale files.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
