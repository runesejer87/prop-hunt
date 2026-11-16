import Phaser from "phaser";
import { HUNTER_MAX_HP, MIN_PLAYERS } from "@prop-hunt/shared";

const FONT = "sans-serif";

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
        hint = "WASD / arrows: move   E: become a nearby object   Q: change back   (hold still to blend in)   M: sound";
        break;
      case "hide":
        title = isHunter ? `You are the HUNTER — the props are hiding… ${info.timeLeft}` : `HIDE! ${info.timeLeft}`;
        sub = info.role === "spectator" ? "Spectating until the next round" : isHunter ? "You can't see or move yet" : "Walk to a small object and press E to become it";
        hint = isHunter ? "Click or Space: swing at the mouse   M: sound" : "WASD / arrows: move   E: become a nearby object   Q: change back   (hold still to blend in)   M: sound";
        break;
      case "hunt":
        title = info.role === "spectator" || !info.alive ? "Spectating" : isHunter ? "FIND THE PROPS" : "STAY HIDDEN";
        sub = `${mmss}   ·   Props left: ${info.propsLeft}`;
        hint = isHunter ? "Click or Space: swing at the mouse   (hit a non-player and you lose health)   M: sound" : "WASD / arrows: move   E: become a nearby object   Q: change back   (hold still to blend in)   M: sound";
        break;
      case "end":
        title = "Round over";
        sub = "Next round starting soon…";
        break;
    }
    this.title.setText(title).setVisible(title !== "");
    this.sub.setText(sub).setVisible(sub !== "");
    this.hint.setText(hint);

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
