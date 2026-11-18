import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "./ui.css";
import Phaser from "phaser";
import { loadFonts } from "./theme.ts";
import { loadIconImages } from "./icons.ts";
import { joinGame } from "./gate.ts";
import { GameScene } from "./GameScene.ts";

// iPhone/iPad home-screen app: Safari can report a page height that stops short of the bottom of the
// screen (the home-bar area stays empty). When installed, use the real screen size instead.
const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
function fitScreen() {
  const root = document.documentElement.style;
  if (!standalone) {
    root.removeProperty("--app-w");
    root.removeProperty("--app-h");
    return;
  }
  const long = Math.max(screen.width, screen.height);
  const short = Math.min(screen.width, screen.height);
  const landscape = window.innerWidth > window.innerHeight;
  root.setProperty("--app-w", `${landscape ? long : short}px`);
  root.setProperty("--app-h", `${landscape ? short : long}px`);
}
fitScreen();
window.addEventListener("resize", fitScreen);
window.addEventListener("orientationchange", () => setTimeout(fitScreen, 100));

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

// iPhone and iPad: stop pinch-zoom and double-tap-zoom (Safari ignores the viewport setting), and
// re-measure the screen after turning the device (Safari reports the old size for a moment).
for (const name of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(name, (e) => e.preventDefault());
let lastTap = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = Date.now();
    if (now - lastTap < 300 && (e.target as HTMLElement | null)?.tagName === "CANVAS") e.preventDefault();
    lastTap = now;
  },
  { passive: false },
);
const refit = () => {
  game.scale.refresh();
  setTimeout(() => game.scale.refresh(), 250);
  setTimeout(() => game.scale.refresh(), 700);
};
window.addEventListener("orientationchange", refit);
window.visualViewport?.addEventListener("resize", () => game.scale.refresh());
