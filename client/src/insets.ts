/** The screen edges covered by the notch / Dynamic Island, rounded corners and the home bar (CSS safe areas). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLDivElement | undefined;
let cached: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
let stamp = 0;

/** Read the current safe-area insets (cached for a moment, so it is cheap to call every frame). */
export function getInsets(): Insets {
  const now = performance.now();
  if (probe && now - stamp < 250) return cached;
  stamp = now;
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  cached = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  return cached;
}
