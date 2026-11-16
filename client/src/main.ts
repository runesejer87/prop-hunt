import Phaser from "phaser";
import { GameScene } from "./GameScene.ts";

const game = new Phaser.Game({
  type: Phaser.AUTO, // WebGL when available
  parent: "game",
  backgroundColor: "#1b1d23",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [GameScene],
});

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
