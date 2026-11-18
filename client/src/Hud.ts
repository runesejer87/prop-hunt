import Phaser from "phaser";
import { HUNTER_MAX_HP } from "@prop-hunt/shared";
import { COLOR, CSS, FONT_BODY, FONT_DISPLAY } from "./theme.ts";
import { getInsets } from "./insets.ts";
import { addIconTextures, type IconName } from "./icons.ts";

export interface BoardRow {
  name: string;
  score: number;
  gain: number;
  role: string;
  me: boolean;
}

/** Draws a soft dark rounded panel with a thin light edge. */
function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 14, alpha = 0.78) {
  g.fillStyle(0x000000, 0.28).fillRoundedRect(x, y + 3, w, h, r); // shadow
  g.fillStyle(COLOR.panel, alpha).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(1.5, COLOR.panelEdge, 0.14).strokeRoundedRect(x, y, w, h, r);
}

/** Text and bars that sit on top of the game. */
export class Hud {
  private d = 100;
  private top: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private timer: Phaser.GameObjects.Graphics;
  private hintBg: Phaser.GameObjects.Graphics;
  private hint: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private hpGfx: Phaser.GameObjects.Graphics;
  private hpLabel: Phaser.GameObjects.Text;
  private pills: Phaser.GameObjects.Graphics;
  private prompt: Phaser.GameObjects.Text;
  private note: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text;
  private toastBg: Phaser.GameObjects.Graphics;
  private abilityText: Phaser.GameObjects.Text;
  private warning: Phaser.GameObjects.Text;
  private touchMode = false;
  private panelBottom = 0;
  /** Messages near the bottom stay above this screen y (the touch buttons). */
  private bottomLimit = Infinity;
  private abilityName: IconName = "radar";
  private abilityReady = true;
  private titleIcon: Phaser.GameObjects.Image;
  private hpIcon: Phaser.GameObjects.Image;
  private promptIcon: Phaser.GameObjects.Image;
  private abilityIcon: Phaser.GameObjects.Image;
  private boardIcon: Phaser.GameObjects.Image;
  private rowIcons: Phaser.GameObjects.Image[];
  private boardGfx: Phaser.GameObjects.Graphics;
  private boardTitle: Phaser.GameObjects.Text;
  private boardRows: { rank: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text; score: Phaser.GameObjects.Text }[];

  constructor(private scene: Phaser.Scene) {
    const d = this.d;
    addIconTextures(scene);
    const img = (depth: number) => scene.add.image(0, 0, "ic_check").setScrollFactor(0).setDepth(depth).setVisible(false);
    const gfx = (depth: number) => scene.add.graphics().setScrollFactor(0).setDepth(depth);
    const text = (size: number, color: string = CSS.text, display = false, depth = d + 1) =>
      scene.add
        .text(0, 0, "", {
          fontFamily: display ? FONT_DISPLAY : FONT_BODY,
          fontSize: `${size}px`,
          fontStyle: display ? "600" : "700",
          color,
          align: "center",
        })
        .setScrollFactor(0)
        .setDepth(depth);

    this.top = gfx(d);
    this.timer = gfx(d + 1);
    this.title = text(26, CSS.text, true).setOrigin(0.5, 0).setShadow(0, 2, "#000000aa", 4, false, true);
    this.sub = text(15, CSS.dim).setOrigin(0.5, 0);
    this.hintBg = gfx(d);
    this.hint = text(13, CSS.dim).setOrigin(0, 1).setFontStyle("600");
    this.banner = text(68, CSS.green, true, d + 5).setOrigin(0.5).setVisible(false).setStroke("#0b0d12", 10).setShadow(0, 6, "#000000aa", 8, true, true).setLineSpacing(-6);
    this.hpGfx = gfx(d + 1);
    this.hpLabel = text(14, CSS.text, true).setOrigin(1, 0.5).setVisible(false);
    this.pills = gfx(d);
    this.boardGfx = gfx(d + 2);
    this.boardTitle = text(24, CSS.text, true, d + 3).setOrigin(0.5, 0).setVisible(false);
    this.boardRows = [0, 1, 2, 3].map(() => ({
      rank: text(20, CSS.dim, true, d + 3).setOrigin(0, 0.5).setVisible(false),
      name: text(19, CSS.text, false, d + 3).setOrigin(0, 0.5).setVisible(false),
      score: text(20, CSS.text, true, d + 3).setOrigin(1, 0.5).setVisible(false),
    }));
    this.abilityText = text(18, CSS.text, true).setOrigin(1, 1).setVisible(false);
    this.warning = text(26, CSS.red, true).setOrigin(0.5, 0).setVisible(false).setStroke("#0b0d12", 6);
    this.toastBg = gfx(d + 6);
    this.toastText = text(16, CSS.text, false, d + 7).setOrigin(0, 0).setVisible(false);
    this.note = text(15, CSS.text).setOrigin(0.5, 1).setVisible(false).setStroke("#0b0d12", 4);
    this.prompt = text(18, CSS.text, true).setOrigin(0.5, 1).setVisible(false).setPadding({ left: 28 });
    this.abilityText.setPadding({ left: 28 });
    this.titleIcon = img(d + 2);
    this.hpIcon = img(d + 2);
    this.promptIcon = img(d + 2);
    this.abilityIcon = img(d + 2);
    this.boardIcon = img(d + 4);
    this.rowIcons = [0, 1, 2, 3].map(() => img(d + 4));
  }

  /** A pill-shaped label behind a text, with an icon at its left (used for the prompt and ability). */
  private pill(t: Phaser.GameObjects.Text, ic: Phaser.GameObjects.Image, name: IconName, tint: number, accent = false) {
    ic.setVisible(t.visible);
    if (!t.visible) return;
    const b = t.getBounds();
    const padX = 14;
    const padY = 7;
    const h = b.height + padY * 2;
    panel(this.pills, b.x - padX, b.y - padY, b.width + padX * 2, h, h / 2, 0.82);
    if (accent) this.pills.lineStyle(2, COLOR.green, 0.55).strokeRoundedRect(b.x - padX, b.y - padY, b.width + padX * 2, h, h / 2);
    ic.setTexture(`ic_${name}`).setPosition(b.x + 12, b.y + b.height / 2).setDisplaySize(20, 20).setTint(tint);
  }

  setBottomLimit(y: number) {
    this.bottomLimit = y;
  }

  /** Screen y of the bottom of the message area: above the home bar, and above the touch buttons. */
  private messageBottom(): number {
    const { height } = this.scene.scale;
    return Math.min(height - getInsets().bottom - (this.touchMode ? 14 : 46), this.bottomLimit - 14);
  }

  setPrompt(text: string | null) {
    const { width, height } = this.scene.scale;
    if (text) this.prompt.setText(text).setPosition(width / 2, this.messageBottom()).setVisible(true);
    else this.prompt.setVisible(false);
  }

  /** The scoreboard. Shown while Tab is held and on the results screen. */
  setBoard(visible: boolean, rows: BoardRow[], round: number, belowBanner: boolean) {
    const { width, height } = this.scene.scale;
    const shown = visible && rows.length > 0;
    this.boardGfx.clear();
    this.boardTitle.setVisible(shown);
    this.boardIcon.setVisible(shown);
    this.rowIcons.forEach((i) => i.setVisible(false));
    this.boardRows.forEach((r) => {
      r.rank.setVisible(false);
      r.name.setVisible(false);
      r.score.setVisible(false);
    });
    if (!shown) return;
    const w = Math.min(width - 24, 400);
    const rowH = 38;
    const h = 62 + rows.length * rowH;
    const x = width / 2 - w / 2;
    const y = Math.max(8, belowBanner ? height / 2 + 6 : height / 2 - h / 2);
    panel(this.boardGfx, x, y, w, h, 18, 0.9);
    this.boardTitle.setText(round > 0 ? `Scores · round ${round}` : "Scores").setPosition(width / 2 + 16, y + 12);
    this.boardIcon.setTexture("ic_trophy").setTint(COLOR.yellow).setDisplaySize(26, 26).setPosition(width / 2 - this.boardTitle.width / 2 + 0, y + 26);
    const medal = [0xfacc15, 0xcbd5e1, 0xd08a4e, 0x64748b];
    rows.slice(0, 4).forEach((row, i) => {
      const cy = y + 62 + i * rowH + rowH / 2 - 2;
      if (row.me) this.boardGfx.fillStyle(COLOR.yellow, 0.14).fillRoundedRect(x + 8, cy - rowH / 2 + 2, w - 16, rowH - 4, 10);
      this.boardGfx.fillStyle(medal[i] ?? 0x64748b, 1).fillCircle(x + 30, cy, 4);
      const r = this.boardRows[i]!;
      if (row.role === "hunter") this.rowIcons[i]!.setTexture("ic_search").setTint(COLOR.blue).setDisplaySize(18, 18).setVisible(true);
      r.rank.setText(`${i + 1}`).setPosition(x + 42, cy).setVisible(true);
      r.name.setText(row.name).setColor(row.me ? CSS.yellow : CSS.text).setPosition(x + 70, cy).setVisible(true);
      r.name.setCrop(0, 0, w - 160, 40);
      if (row.role === "hunter") this.rowIcons[i]!.setPosition(x + 70 + Math.min(r.name.width, w - 160) + 14, cy);
      r.score.setText(`${row.score}${row.gain > 0 ? `  +${row.gain}` : ""}`).setColor(row.gain > 0 ? CSS.green : row.me ? CSS.yellow : CSS.text).setPosition(x + w - 20, cy).setVisible(true);
    });
  }

  /** On a touch screen the on-screen buttons replace the key hints and the ability label. */
  setTouchMode(on: boolean) {
    this.touchMode = on;
  }

  /** (The lobby now lives in Lobby.ts.) */
  setLobbyButtons(_visible: boolean, _canAdd: boolean, _canRemove: boolean) {}
  lobbyButtonAt(_x: number, _y: number): null {
    return null;
  }

  /** A flashing warning under the title, or null to hide it. */
  setWarning(text: string | null, time: number) {
    const { width } = this.scene.scale;
    if (!text) {
      this.warning.setVisible(false);
      return;
    }
    this.warning.setWordWrapWidth(Math.max(160, width - 24)).setPosition(width / 2, getInsets().top + this.panelBottom + 8).setText(text).setVisible(true).setAlpha(0.6 + 0.4 * Math.abs(Math.sin(time / 180)));
  }

  /** The ability button in the bottom right: its name, and when it is ready. */
  setAbility(label: string | null, cooldown: number) {
    const { width, height } = this.scene.scale;
    if (!label || this.touchMode) {
      this.abilityText.setVisible(false);
      return;
    }
    const ready = cooldown <= 0;
    this.abilityName = label === "Radar" ? "radar" : "megaphone";
    this.abilityReady = ready;
    this.abilityText
      .setText(ready ? `F · ${label}` : `F · ${label}  ${cooldown}s`)
      .setColor(ready ? CSS.green : CSS.dim)
      .setPosition(width - Math.max(26, getInsets().right + 14), height - getInsets().bottom - 20)
      .setVisible(true);
  }

  /** A short message in the top left corner. */
  toast(message: string) {
    const { height } = this.scene.scale;
    this.toastText.setText(message).setWordWrapWidth(Math.max(200, Math.min(this.scene.scale.width - 48, 300))).setPosition(Math.max(26, getInsets().left + 14), this.touchMode ? height - getInsets().bottom - 78 : getInsets().top + 24).setAlpha(1).setVisible(true);
    this.toastBg.clear().setAlpha(1);
    const b = this.toastText.getBounds();
    panel(this.toastBg, b.x - 14, b.y - 8, b.width + 28, b.height + 16, 14, 0.85);
    this.scene.tweens.killTweensOf(this.toastText);
    this.scene.tweens.killTweensOf(this.toastBg);
    const fade = { delay: 1500, duration: 400 };
    this.scene.tweens.add({ targets: this.toastText, alpha: 0, ...fade, onComplete: () => this.toastText.setVisible(false) });
    this.scene.tweens.add({ targets: this.toastBg, alpha: 0, ...fade, onComplete: () => this.toastBg.clear() });
  }

  /** Small status line above the prompt, e.g. whether you are a perfect copy yet. */
  setNote(text: string | null, color = "#ffffff") {
    const { width, height } = this.scene.scale;
    if (text) this.note.setText(text).setColor(color).setPosition(width / 2, this.messageBottom() - 42).setVisible(true);
    else this.note.setVisible(false);
  }

  update(info: {
    connected: boolean;
    phase: string;
    timeLeft: number;
    winner: string;
    role: string;
    alive: boolean;
    hp: number;
    playerCount: number;
    propsLeft: number;
    round?: number;
    mapName?: string;
    alert?: number;
    /** Share of the phase time left (0 to 1), or below 0 for no bar. */
    fraction?: number;
  }) {
    const { width, height } = this.scene.scale;
    const side = this.touchMode ? 130 : 48; // on touch screens the scores / sound buttons sit at the right edge
    const wrap = Math.max(160, Math.min(width - side, 700));
    this.title.setWordWrapWidth(wrap);
    this.sub.setWordWrapWidth(wrap);
    this.banner.setPosition(width / 2, Math.max(110, height * 0.34));
    this.top.y = 0;

    if (!info.connected) {
      this.title.setText("Connecting…").setVisible(true).setPosition(width / 2, getInsets().top + 22);
      this.titleIcon.setVisible(false);
      this.sub.setText("").setVisible(false);
      this.drawTop(width, 22, 0, -1);
      return;
    }

    const mmss = `${Math.floor(info.timeLeft / 60)}:${String(info.timeLeft % 60).padStart(2, "0")}`;
    const isHunter = info.role === "hunter";
    let title = "";
    let sub = "";
    let hint = "";

    switch (info.phase) {
      case "lobby":
        // The lobby card (Lobby.ts) shows everything now.
        break;
      case "hide":
        title = isHunter ? `You are the HUNTER · ${info.timeLeft}` : `HIDE! ${info.timeLeft}`;
        sub =
          info.role === "spectator"
            ? "Spectating until the next round"
            : isHunter
              ? "The props are hiding. You can't see or move yet."
              : this.touchMode
                ? "Walk to a small object and tap Become"
                : "Walk to a small object and press E to become it";
        hint = isHunter ? "Space: swing   M: sound" : "WASD: move   E: become   Q: change back   R: turn   Hold still to blend in   M: sound";
        break;
      case "hunt":
        title = info.role === "spectator" || !info.alive ? "You're a ghost" : isHunter ? "FIND THE PROPS" : "STAY HIDDEN";
        sub = `${mmss}  ·  ${info.propsLeft} prop${info.propsLeft === 1 ? "" : "s"} left  ·  ${info.mapName ?? ""}${info.alert ? `  ·  Alert ${info.alert}` : ""}`;
        hint = info.role === "spectator" || !info.alive
          ? "WASD: float through walls   F: rattle an object or scare the hunter   1-5: emotes   Tab: scores"
          : isHunter
          ? "WASD: steer   Space: swing   Hold E: inspect (safe)   F: radar   1-5: emotes   Tab: scores"
          : "Don't run! E / Q / R, then hold still   F: fake noise   Space: taunt (gives you away!)   Tab: scores";
        break;
      case "end":
        title = "Round over";
        sub = "Here is where everyone hid…";
        hint = "1-5: emotes   Tab: scores";
        break;
    }
    this.title.setText(title).setVisible(title !== "");
    this.sub.setText(sub).setVisible(sub !== "");
    const titleIcon: IconName | null =
      info.phase === "end" ? "trophy" : info.role === "spectator" || (!info.alive && info.phase === "hunt") ? "binoculars" : isHunter ? "search" : info.phase === "hide" ? "hide" : info.phase === "hunt" ? "ghost" : null;
    this.titleIcon.setVisible(!!titleIcon && title !== "");
    if (titleIcon) this.titleIcon.setTexture(`ic_${titleIcon}`).setTint(info.phase === "end" ? COLOR.yellow : isHunter ? COLOR.blue : COLOR.green).setDisplaySize(26, 26);
    const ins = getInsets();
    this.title.setPosition(width / 2 + 17, ins.top + 14);
    this.titleIcon.setPosition(width / 2 - this.title.width / 2 - 1, ins.top + 14 + this.title.height / 2 + 1);
    this.sub.setPosition(width / 2, ins.top + 14 + this.title.height);
    this.hint.setText(this.touchMode ? "" : hint).setPosition(Math.max(26, ins.left + 14), height - ins.bottom - 16);

    // Top panel and the time bar inside it.
    const f = info.fraction ?? -1;
    const showBar = f >= 0 && (info.phase === "hide" || info.phase === "hunt");
    this.drawTop(width, title ? 14 + this.title.height + (sub ? this.sub.height : 0) + 12 : 0, showBar ? f : -1, info.phase === "hide" ? 0 : 1);

    // Hint strip
    this.hintBg.clear();
    if (this.hint.text) {
      const b = this.hint.getBounds();
      panel(this.hintBg, b.x - 12, b.y - 7, b.width + 24, b.height + 14, 12, 0.6);
    }

    // Hunter health: a heart and a rounded bar, top right.
    const showHp = isHunter && (info.phase === "hide" || info.phase === "hunt");
    this.hpGfx.clear();
    this.hpLabel.setVisible(false);
    this.hpIcon.setVisible(showHp);
    if (showHp) {
      const w = 150;
      // On a narrow screen the health bar goes under the title panel instead of beside it.
      const narrowScreen = width < 700;
      const bx = narrowScreen ? width / 2 + w / 2 - 6 - w : width - Math.max(26, ins.right + 14) - w;
      const by = narrowScreen ? ins.top + this.panelBottom + 28 : ins.top + 22;
      panel(this.hpGfx, bx - 44, by - 14, w + 62, 42, 21, 0.82);
      this.hpGfx.fillStyle(0x000000, 0.5).fillRoundedRect(bx, by, w, 14, 7);
      const k = Math.max(0, Math.min(1, info.hp / HUNTER_MAX_HP));
      if (k > 0) this.hpGfx.fillStyle(k > 0.5 ? COLOR.green : k > 0.25 ? COLOR.yellow : COLOR.red, 1).fillRoundedRect(bx, by, Math.max(14, w * k), 14, 7);
      this.hpIcon.setTexture("ic_heart").setTint(COLOR.red).setDisplaySize(24, 24).setPosition(bx - 22, by + 7);
    }

    // Floating pills behind the prompt / ability
    this.pills.clear();
    this.pill(this.prompt, this.promptIcon, "hand", COLOR.green, true);
    this.pill(this.abilityText, this.abilityIcon, this.abilityName, this.abilityReady ? COLOR.green : 0x9aa3b2);

    // Result banner
    if (info.phase === "end" && info.winner) {
      const propsWon = info.winner === "props";
      let youWon: boolean | null = null;
      if (info.role === "hunter") youWon = !propsWon;
      else if (info.role === "prop") youWon = propsWon;
      const who = propsWon ? "PROPS WIN" : "HUNTER WINS";
      this.banner
        .setText(youWon === null ? who : `${who}\n${youWon ? "You win!" : "You lose"}`)
        .setFontSize(width < 600 ? "44px" : "68px")
        .setColor(youWon === false ? CSS.red : CSS.green)
        .setVisible(true);
    } else {
      this.banner.setVisible(false);
    }
  }

  /** The panel at the top centre with the title, the sub line and the time bar. */
  private drawTop(width: number, contentH: number, fraction: number, _phase: number) {
    this.top.clear();
    this.timer.clear();
    if (contentH <= 0) return;
    const w = Math.min(width - (this.touchMode ? 130 : 24), Math.max(this.title.width + 36, this.sub.width) + 56);
    const barH = fraction >= 0 ? 10 : 0;
    const h = contentH + barH;
    const x = width / 2 - w / 2;
    const topY = 6 + getInsets().top;
    this.panelBottom = h + 6;
    panel(this.top, x, topY, w, h, 18, 0.8);
    if (fraction >= 0) {
      const bw = w - 36;
      const by = topY + h - 16;
      this.timer.fillStyle(0x000000, 0.5).fillRoundedRect(x + 18, by, bw, 6, 3);
      const col = fraction > 0.4 ? COLOR.green : fraction > 0.15 ? COLOR.yellow : COLOR.red;
      this.timer.fillStyle(col, 1).fillRoundedRect(x + 18, by, Math.max(6, bw * Math.min(1, fraction)), 6, 3);
    }
  }
}
