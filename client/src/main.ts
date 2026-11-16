import Phaser from "phaser";
import { joinGame } from "./gate.ts";
import { GameScene } from "./GameScene.ts";

// Join first (this shows the password screen if the server needs one), then start the game.
const room = await joinGame();

const game = new Phaser.Game({
  type: Phaser.AUTO, // WebGL when available
  parent: "game",
  backgroundColor: "#1b1d23",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [],
});
game.scene.add("GameScene", GameScene, true, { room });

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
