import Phaser from "phaser";
import { HUNTER_MAX_HP, MIN_PLAYERS } from "@prop-hunt/shared";

const FONT = "sans-serif";

export interface BoardRow {
  name: string;
  score: number;
  gain: number;
  role: string;
  me: boolean;
}

/** Text and bars that sit on top of the game. */
export class Hud {
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private hpBack: Phaser.GameObjects.Rectangle;
  private hpFill: Phaser.GameObjects.Rectangle;
  private hpLabel: Phaser.GameObjects.Text;
  private prompt: Phaser.GameObjects.Text;
  private note: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text;
  private abilityText: Phaser.GameObjects.Text;
  private warning: Phaser.GameObjects.Text;
  private touchMode = false;
  private lobbyBtns: { key: "add" | "addEasy" | "remove"; text: Phaser.GameObjects.Text; rect: Phaser.Geom.Rectangle }[] = [];
  private timerBack: Phaser.GameObjects.Rectangle;
  private timerFill: Phaser.GameObjects.Rectangle;
  private boardBg: Phaser.GameObjects.Rectangle;
  private boardTitle: Phaser.GameObjects.Text;
  private boardRows: Phaser.GameObjects.Text[];

  constructor(private scene: Phaser.Scene) {
    const d = 100;
    const text = (size: number, color = "#ffffff") =>
      scene.add.text(0, 0, "", { fontFamily: FONT, fontSize: `${size}px`, color, align: "center", stroke: "#000000", strokeThickness: 4 }).setScrollFactor(0).setDepth(d);
    this.title = text(22).setOrigin(0.5, 0).setBackgroundColor("#00000070").setPadding(14, 4, 14, 4);
    this.sub = text(16, "#d0d4dc").setOrigin(0.5, 0).setBackgroundColor("#00000060").setPadding(10, 2, 10, 2);
    this.hint = text(14, "#c0c4cc").setOrigin(0, 1);
    this.banner = text(56).setOrigin(0.5).setVisible(false);
    this.hpBack = scene.add.rectangle(0, 0, 200, 14, 0x000000, 0.6).setOrigin(1, 0).setScrollFactor(0).setDepth(d).setVisible(false);
    this.hpFill = scene.add.rectangle(0, 0, 200, 14, 0xef4444).setOrigin(1, 0).setScrollFactor(0).setDepth(d + 1).setVisible(false);
    this.hpLabel = text(13).setOrigin(1, 0).setVisible(false);
    this.timerBack = scene.add.rectangle(0, 0, 320, 6, 0x000000, 0.55).setScrollFactor(0).setDepth(d).setVisible(false);
    this.timerFill = scene.add.rectangle(0, 0, 320, 6, 0x4ade80).setOrigin(0, 0.5).setScrollFactor(0).setDepth(d + 1).setVisible(false);
    this.boardBg = scene.add.rectangle(0, 0, 440, 200, 0x000000, 0.72).setScrollFactor(0).setDepth(d + 2).setVisible(false);
    this.boardTitle = text(22).setOrigin(0.5, 0).setDepth(d + 3).setVisible(false);
    this.boardRows = [0, 1, 2, 3].map(() =>
      scene.add
        .text(0, 0, "", { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(d + 3)
        .setVisible(false),
    );
    this.abilityText = scene.add
      .text(0, 0, "", { fontFamily: FONT, fontSize: "18px", fontStyle: "bold", color: "#ffffff", backgroundColor: "#000000a0", padding: { x: 12, y: 8 } })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(d)
      .setVisible(false);
    const mk = (key: "add" | "addEasy" | "remove", label: string, color: string) => {
      const t = scene.add
        .text(0, 0, label, { fontFamily: FONT, fontSize: "16px", fontStyle: "bold", color: "#ffffff", backgroundColor: color })
        .setPadding(12, 7, 12, 7)
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(d + 4)
        .setVisible(false);
      this.lobbyBtns.push({ key, text: t, rect: new Phaser.Geom.Rectangle(0, 0, 0, 0) });
    };
    mk("add", "+ CPU player", "#2f7d4f");
    mk("addEasy", "+ Easy CPU", "#3a6ea5");
    mk("remove", "− Remove CPU", "#8a3a3a");
    this.warning = text(24, "#ff6b6b").setOrigin(0.5, 0).setVisible(false);
    this.toastText = text(16).setOrigin(0, 0).setVisible(false);
    this.note = text(16).setOrigin(0.5, 1).setVisible(false);
    this.prompt = scene.add
      .text(0, 0, "", { fontFamily: FONT, fontSize: "18px", color: "#fff", backgroundColor: "#000000a0", padding: { x: 10, y: 6 } })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(d)
      .setVisible(false);
  }

  setPrompt(text: string | null) {
    const { width, height } = this.scene.scale;
    if (text) this.prompt.setText(text).setPosition(width / 2, height - 44).setVisible(true);
    else this.prompt.setVisible(false);
  }

  /** The scoreboard. Shown while Tab is held and on the results screen. */
  setBoard(visible: boolean, rows: BoardRow[], round: number, belowBanner: boolean) {
    const { width, height } = this.scene.scale;
    const shown = visible && rows.length > 0;
    this.boardBg.setVisible(shown);
    this.boardTitle.setVisible(shown);
    this.boardRows.forEach((r) => r.setVisible(false));
    if (!shown) return;
    const top = belowBanner ? height / 2 + 50 : height / 2 - 110;
    const h = 56 + rows.length * 28;
    this.boardBg.setPosition(width / 2, top + h / 2 - 8).setSize(440, h);
    this.boardTitle.setText(round > 0 ? `Scores · round ${round}` : "Scores").setPosition(width / 2, top);
    rows.slice(0, 4).forEach((row, i) => {
      const gain = row.gain > 0 ? ` +${row.gain}` : "";
      const tag = row.role === "hunter" ? " (hunter)" : "";
      const label = `${i + 1}. ${row.name}${tag}`;
      this.boardRows[i]!
        .setText(`${label.padEnd(26)}${String(row.score).padStart(3)}${gain}`)
        .setColor(row.me ? "#ffe27a" : "#ffffff")
        .setPosition(width / 2 - 200, top + 36 + i * 28)
        .setVisible(true);
    });
  }

  /** On a touch screen the on-screen buttons replace the key hints and the ability label. */
  setTouchMode(on: boolean) {
    this.touchMode = on;
  }

  /** Lobby buttons for adding and removing computer players. */
  setLobbyButtons(visible: boolean, canAdd: boolean, canRemove: boolean) {
    const { width } = this.scene.scale;
    const y = (this.sub.visible ? this.sub.y + this.sub.height : this.title.y + this.title.height) + 16;
    const shown = this.lobbyBtns.filter((b) => visible && (b.key === "remove" ? canRemove : canAdd));
    this.lobbyBtns.forEach((b) => b.text.setVisible(false));
    const gap = 10;
    const total = shown.reduce((n, b) => n + b.text.width, 0) + gap * Math.max(0, shown.length - 1);
    let x = width / 2 - total / 2;
    for (const b of shown) {
      b.text.setPosition(x + b.text.width / 2, y).setVisible(true);
      b.rect.setTo(x, y, b.text.width, b.text.height);
      x += b.text.width + gap;
    }
  }

  /** Which lobby button, if any, is at this screen position. */
  lobbyButtonAt(x: number, y: number): "add" | "addEasy" | "remove" | null {
    for (const b of this.lobbyBtns) if (b.text.visible && b.rect.contains(x, y)) return b.key;
    return null;
  }

  /** A flashing warning under the title, or null to hide it. */
  setWarning(text: string | null, time: number) {
    const { width } = this.scene.scale;
    if (!text) {
      this.warning.setVisible(false);
      return;
    }
    this.warning.setWordWrapWidth(Math.max(160, width - 24)).setPosition(width / 2, 100).setText(text).setVisible(true).setAlpha(0.55 + 0.45 * Math.abs(Math.sin(time / 180)));
  }

  /** The ability button in the bottom right: its name, and when it is ready. */
  setAbility(label: string | null, cooldown: number) {
    const { width, height } = this.scene.scale;
    if (!label || this.touchMode) {
      this.abilityText.setVisible(false);
      return;
    }
    const ready = cooldown <= 0;
    this.abilityText
      .setText(ready ? `F · ${label}` : `F · ${label}  ${cooldown}s`)
      .setColor(ready ? "#9dffa8" : "#9aa0ac")
      .setPosition(width - 14, height - 14)
      .setVisible(true);
  }

  /** A short message in the top left corner. */
  toast(message: string) {
    const { height } = this.scene.scale;
    this.toastText.setText(message).setWordWrapWidth(Math.max(200, this.scene.scale.width - 24)).setPosition(12, this.touchMode ? height - 70 : 12).setAlpha(1).setVisible(true);
    this.scene.tweens.killTweensOf(this.toastText);
    this.scene.tweens.add({ targets: this.toastText, alpha: 0, delay: 1200, duration: 400, onComplete: () => this.toastText.setVisible(false) });
  }

  /** Small status line above the prompt, e.g. whether you are a perfect copy yet. */
  setNote(text: string | null, color = "#ffffff") {
    const { width, height } = this.scene.scale;
    if (text) this.note.setText(text).setColor(color).setPosition(width / 2, height - 84).setVisible(true);
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
    const wrap = Math.max(160, Math.min(width - 24, 760));
    this.title.setWordWrapWidth(wrap);
    this.sub.setWordWrapWidth(wrap);
    this.title.setPosition(width / 2, 12);
    this.sub.setPosition(width / 2, 12 + this.title.height + 4);
    this.hint.setPosition(12, height - 12);
    this.banner.setPosition(width / 2, height / 2);

    if (!info.connected) {
      this.title.setText("Connecting…");
      this.sub.setText("");
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
        title = isHunter ? `You are the HUNTER — the props are hiding… ${info.timeLeft}` : `HIDE! ${info.timeLeft}`;
        sub = info.role === "spectator" ? "Spectating until the next round" : isHunter ? "You can't see or move yet" : this.touchMode ? "Walk to a small object and tap Become" : "Walk to a small object and press E to become it";
        hint = isHunter ? "Click or Space: swing at the mouse   M: sound" : "WASD / arrows: move   E: become a nearby object   Q: change back   R: turn   (hold still to blend in)   M: sound";
        break;
      case "hunt":
        title = info.role === "spectator" || !info.alive ? "Spectating" : isHunter ? "FIND THE PROPS" : "STAY HIDDEN";
        sub = `Round ${info.round ?? 0} · ${info.mapName ?? ""}   ·   ${mmss}   ·   Props left: ${info.propsLeft}${info.alert ? `   ·   Alert ${info.alert}` : ""}`;
        hint = isHunter
          ? "WASD: steer   Space: swing at what's in front   Hold E: inspect (safe)   F: radar   Tab: scores"
          : "Don't run! Hide: E / Q / R, then hold still.   F: fake noise   Space: taunt (silly, but it gives you away)   Tab: scores";
        break;
      case "end":
        title = "Round over";
        sub = "Next round starting soon…";
        break;
    }
    this.title.setText(title).setVisible(title !== "");
    this.sub.setText(sub).setVisible(sub !== "");
    this.hint.setText(this.touchMode ? "" : hint);

    // Time bar under the title: green, then yellow, then red as time runs out.
    const f = info.fraction ?? -1;
    const showBar = f >= 0 && (info.phase === "hide" || info.phase === "hunt");
    const barY = this.sub.y + (this.sub.visible ? this.sub.height : 0) + 10;
    this.timerBack.setVisible(showBar).setPosition(width / 2, barY);
    this.timerFill
      .setVisible(showBar)
      .setPosition(width / 2 - 160, barY)
      .setSize(Math.max(1, 320 * Math.min(1, f)), 6)
      .setFillStyle(f > 0.4 ? 0x4ade80 : f > 0.15 ? 0xfacc15 : 0xef4444);

    // Hunter health
    const showHp = isHunter && (info.phase === "hide" || info.phase === "hunt");
    const narrow = width < 700;
    const hx = narrow ? width / 2 + 100 : width - 12;
    const hy = narrow ? barY + 12 : 12;
    this.hpBack.setVisible(showHp).setPosition(hx, hy);
    this.hpFill.setVisible(showHp).setPosition(hx, hy).setSize(Math.max(1, (200 * info.hp) / HUNTER_MAX_HP), 14);
    this.hpLabel.setVisible(showHp).setPosition(hx, hy + 18).setText(`Health ${info.hp}`);

    // Result banner
    if (info.phase === "end" && info.winner) {
      const propsWon = info.winner === "props";
      let youWon: boolean | null = null;
      if (info.role === "hunter") youWon = !propsWon;
      else if (info.role === "prop") youWon = propsWon;
      const who = propsWon ? "PROPS WIN" : "HUNTER WINS";
      this.banner.setText(youWon === null ? who : youWon ? `${who}\nYou win!` : `${who}\nYou lose`).setColor(youWon === false ? "#ff8a8a" : "#9dffa8").setVisible(true);
    } else {
      this.banner.setVisible(false);
    }
  }
}
