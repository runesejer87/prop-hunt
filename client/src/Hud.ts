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

  /** The ability button in the bottom right: its name, and when it is ready. */
  setAbility(label: string | null, cooldown: number) {
    const { width, height } = this.scene.scale;
    if (!label) {
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
    this.toastText.setText(message).setPosition(12, 12).setAlpha(1).setVisible(true);
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
    /** Share of the phase time left (0 to 1), or below 0 for no bar. */
    fraction?: number;
  }) {
    const { width, height } = this.scene.scale;
    this.title.setPosition(width / 2, 12);
    this.sub.setPosition(width / 2, 48);
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
        title = info.playerCount < MIN_PLAYERS ? "Waiting for another player…" : `Round starts in ${info.timeLeft}`;
        sub = "Open this page in a second tab or send the link to a friend (2–4 players)";
        hint = "WASD / arrows: move   E: become a nearby object   Q: change back   R: turn   (hold still to blend in)   Tab: scores   M: sound";
        break;
      case "hide":
        title = isHunter ? `You are the HUNTER — the props are hiding… ${info.timeLeft}` : `HIDE! ${info.timeLeft}`;
        sub = info.role === "spectator" ? "Spectating until the next round" : isHunter ? "You can't see or move yet" : "Walk to a small object and press E to become it";
        hint = isHunter ? "Click or Space: swing at the mouse   M: sound" : "WASD / arrows: move   E: become a nearby object   Q: change back   R: turn   (hold still to blend in)   M: sound";
        break;
      case "hunt":
        title = info.role === "spectator" || !info.alive ? "Spectating" : isHunter ? "FIND THE PROPS" : "STAY HIDDEN";
        sub = `Round ${info.round ?? 0}   ·   ${mmss}   ·   Props left: ${info.propsLeft}`;
        hint = isHunter
          ? "Click or Space: swing   F: radar   Yellow rings: something is moving   Tab: scores   M: sound"
          : "Don't run! Hide: E / Q / R, then hold still.   F: send the hunter a fake noise   Tab: scores   M: sound";
        break;
      case "end":
        title = "Round over";
        sub = "Next round starting soon…";
        break;
    }
    this.title.setText(title).setVisible(title !== "");
    this.sub.setText(sub).setVisible(sub !== "");
    this.hint.setText(hint);

    // Time bar under the title: green, then yellow, then red as time runs out.
    const f = info.fraction ?? -1;
    const showBar = f >= 0 && (info.phase === "hide" || info.phase === "hunt");
    this.timerBack.setVisible(showBar).setPosition(width / 2, 80);
    this.timerFill
      .setVisible(showBar)
      .setPosition(width / 2 - 160, 80)
      .setSize(Math.max(1, 320 * Math.min(1, f)), 6)
      .setFillStyle(f > 0.4 ? 0x4ade80 : f > 0.15 ? 0xfacc15 : 0xef4444);

    // Hunter health
    const showHp = isHunter && (info.phase === "hide" || info.phase === "hunt");
    this.hpBack.setVisible(showHp).setPosition(width - 12, 12);
    this.hpFill.setVisible(showHp).setPosition(width - 12, 12).setSize(Math.max(1, (200 * info.hp) / HUNTER_MAX_HP), 14);
    this.hpLabel.setVisible(showHp).setPosition(width - 12, 30).setText(`Health ${info.hp}`);

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
