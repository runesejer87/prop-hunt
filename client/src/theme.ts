/** Fonts and colors shared by every screen, so the game looks like one thing. */
export const FONT_DISPLAY = '"Fredoka Variable", "Fredoka", "Trebuchet MS", sans-serif';
export const FONT_BODY = '"Nunito Variable", "Nunito", "Segoe UI", sans-serif';

export const COLOR = {
  panel: 0x1e1524,
  panelEdge: 0xffffff,
  green: 0x4ade80,
  yellow: 0xfacc15,
  red: 0xef4444,
  blue: 0x60a5fa,
  pink: 0xf472b6,
} as const;

/** The same colors as CSS strings, for text. */
export const CSS = {
  text: "#f4f6fb",
  dim: "#aab2c0",
  green: "#6ee7a0",
  yellow: "#ffd95a",
  red: "#ff7b7b",
  blue: "#8cc4ff",
} as const;

/** Makes sure the web fonts are ready before anything is drawn with them (canvas text will not wait). */
export async function loadFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('600 24px "Fredoka Variable"'),
      document.fonts.load('700 24px "Fredoka Variable"'),
      document.fonts.load('400 16px "Nunito Variable"'),
      document.fonts.load('700 16px "Nunito Variable"'),
    ]);
  } catch {
    /* fall back to the system fonts */
  }
}
