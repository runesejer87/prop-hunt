import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import { Fog } from "./Fog.ts";
import { Hud } from "./Hud.ts";
import { Sound } from "./Sound.ts";
import { drawWorld, makePropTextures, placeProps, makeCharacterTextures, charKey } from "./art.ts";
import {
  MSG_INPUT,
  MSG_DISGUISE,
  MSG_UNDISGUISE,
  MSG_ROTATE,
  MSG_ATTACK,
  MSG_SWING,
  MSG_PING,
  type SwingEvent,
  ATTACK_RANGE,
  VISION_RADIUS,
  Sight,
  PROP_TYPES,
  nearestDisguisableProp,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  moveWithCollision,
  PLAYER_RADIUS,
  moveSpeed,
  type GameState,
  type PlayerState,
  type BodyState,
} from "@prop-hunt/shared";

export class GameScene extends Phaser.Scene {
  private room?: Room<any, GameState>;
  private sprites = new Map<string, Phaser.GameObjects.Arc>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private lastInput = { dx: 0, dy: 0 };
  private hud!: Hud;
  private fog!: Fog;
  private connected = false;
  private styleOf = new Map<string, string>();
  private reticle!: Phaser.GameObjects.Graphics;
  private hunterView!: Phaser.GameObjects.Graphics;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private skins = new Map<string, Phaser.GameObjects.Image>();
  private selfRing?: Phaser.GameObjects.Arc;
  private ringSettled?: boolean;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private sfx = new Sound();
  private chars = new Map<string, Phaser.GameObjects.Image>();
  private skinShadows = new Map<string, Phaser.GameObjects.Image>();
  private skinReady = new Set<string>();
  private lastPos = new Map<string, { x: number; y: number }>();
  private stepAcc = new Map<string, number>();
  private prevPhase = "";
  private prevTime = -1;
  private prevSettled = false;

  private initialRoom!: Room<any, GameState>;

  constructor() {
    super("GameScene");
  }

  /** The room is joined before the scene starts (see main.ts and gate.ts). */
  init(data: { room: Room<any, GameState> }) {
    this.initialRoom = data.room;
  }

  create() {
    makePropTextures(this);
    makeCharacterTextures(this);
    drawWorld(this);
    placeProps(this);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;
    this.keyE = this.input.keyboard!.addKey("E");
    this.keyQ = this.input.keyboard!.addKey("Q");
    this.keyM = this.input.keyboard!.addKey("M");
    this.keyR = this.input.keyboard!.addKey("R");
    this.keySpace = this.input.keyboard!.addKey("SPACE");

    // Browsers only allow sound after a click or key press.
    const unlock = () => this.sfx.unlock();
    this.input.keyboard!.on("keydown", unlock);
    this.input.on("pointerdown", unlock);

    this.hud = new Hud(this);
    this.fog = new Fog(this, WORLD_WIDTH, WORLD_HEIGHT);
    this.reticle = this.add.graphics().setDepth(60);
    // Props can see exactly what the hunter can see (a faint red glow on the floor).
    this.hunterView = this.add.graphics().setDepth(3);
    this.input.on("pointerdown", () => this.swing());
    this.attach(this.initialRoom);
  }

  /** How loud and how far left/right a sound at (x, y) is for me. */
  private audioFrom(x: number, y: number): { vol: number; pan: number } {
    const my = this.room ? this.sprites.get(this.room.sessionId) : undefined;
    if (!my) return { vol: 1, pan: 0 };
    const dx = x - my.x;
    const dy = y - my.y;
    return { vol: Math.max(0, 1 - Math.hypot(dx, dy) / 420), pan: Math.max(-1, Math.min(1, dx / 260)) };
  }

  /** Show a player as a prop (or as themselves when `typeId` is empty). */
  private setSkin(id: string, typeId: string) {
    const dot = this.sprites.get(id);
    if (!dot) return;
    const isMe = id === this.room?.sessionId;
    const had = this.skins.has(id);
    this.skins.get(id)?.destroy();
    this.skins.delete(id);
    this.skinShadows.get(id)?.destroy();
    this.skinShadows.delete(id);
    const pt = typeId ? PROP_TYPES[typeId] : undefined;
    if (isMe) {
      this.selfRing?.destroy();
      this.selfRing = undefined;
      this.ringSettled = undefined;
    }

    // Sounds, but not for a body that has just come into view already disguised.
    if (this.skinReady.has(id) && (pt || had)) {
      const { vol, pan } = this.audioFrom(dot.x, dot.y);
      if (vol > 0.03) (pt ? this.sfx.poof : this.sfx.unpoof).call(this.sfx, isMe ? 0.8 : vol, isMe ? 0 : pan);
    }
    this.skinReady.add(id);

    if (!pt) return;
    const turn = ((this.room?.state.bodies.get(id)?.rot ?? 0) * Math.PI) / 2;
    this.skinShadows.set(id, this.add.image(dot.x + 3, dot.y + 4, `shadow_${pt.id}`).setAlpha(0.3).setDepth(4.5).setRotation(turn));
    this.skins.set(id, this.add.image(dot.x, dot.y, `prop_${pt.id}`).setDepth(5).setRotation(turn));
    if (isMe) {
      // A thin green ring so you can still find yourself among the lookalikes.
      this.selfRing = this.add.circle(dot.x, dot.y, Math.max(pt.w, pt.h) / 2 + 5).setStrokeStyle(2, 0x4ade80).setDepth(4);
    }
  }

  /** Listen to the room we joined. */
  private attach(room: Room<any, GameState>) {
    this.room = room;
    this.connected = true;

    const callbacks = Callbacks.get(room);
    // Bodies are sent only when the server says we may see them (the hunter
    // gets just the ones in line of sight), so they appear and disappear here.
    callbacks.onAdd("bodies", (b: BodyState, id: string) => {
      this.addBody(b, id);
      callbacks.listen(b, "disguise", (typeId: string) => this.setSkin(id, typeId));
    });
    callbacks.onRemove("bodies", (_b: BodyState, id: string) => {
      this.sprites.get(id)?.destroy();
      this.sprites.delete(id);
      this.skins.get(id)?.destroy();
      this.skins.delete(id);
      this.skinShadows.get(id)?.destroy();
      this.skinShadows.delete(id);
      this.chars.get(id)?.destroy();
      this.chars.delete(id);
      this.styleOf.delete(id);
      this.skinReady.delete(id);
      this.lastPos.delete(id);
      this.stepAcc.delete(id);
      if (id === room.sessionId) this.selfRing?.destroy();
    });
    room.onMessage(MSG_SWING, (e: SwingEvent) => this.showSwing(e));
    room.onMessage(MSG_PING, (p: { x: number; y: number }) => this.showPing(p));
    room.onLeave(() => {
      this.connected = false;
    });
  }

  /** The hunter hears and sees roughly where a moving prop is. */
  private showPing(p: { x: number; y: number }) {
    const ring = this.add.circle(p.x, p.y, 6).setStrokeStyle(3, 0xfbbf24, 0.95).setDepth(55);
    const dot = this.add.circle(p.x, p.y, 4, 0xfbbf24, 0.9).setDepth(55);
    this.tweens.add({ targets: ring, radius: 54, alpha: 0, duration: 1700, onComplete: () => ring.destroy() });
    this.tweens.add({ targets: dot, alpha: 0, duration: 1700, onComplete: () => dot.destroy() });
    this.sfx.ping(this.audioFrom(p.x, p.y).pan);
  }

  private addBody(b: BodyState, id: string) {
    const isMe = id === this.room?.sessionId;
    // The "dot" is an invisible anchor: it holds the position that everything else follows.
    const dot = this.add.circle(b.x, b.y, PLAYER_RADIUS).setVisible(false);
    this.sprites.set(id, dot);
    this.chars.set(id, this.add.image(b.x, b.y, "char_0").setDepth(5));
    this.lastPos.set(id, { x: b.x, y: b.y });
    if (isMe) this.cameras.main.startFollow(dot, true, 0.15, 0.15);
  }

  // ------------------------------------------------------------- hunter

  private get me(): PlayerState | undefined {
    return this.room?.state.players.get(this.room.sessionId);
  }

  /** My own body: the server always sends me this one. */
  private get myBody(): BodyState | undefined {
    return this.room?.state.bodies.get(this.room.sessionId);
  }

  private canSwing(): boolean {
    const me = this.me;
    return !!this.room && !!me && me.role === "hunter" && this.room.state.phase === "hunt";
  }

  private swing() {
    if (!this.canSwing()) return;
    const ptr = this.input.activePointer;
    this.room!.send(MSG_ATTACK, { x: ptr.worldX, y: ptr.worldY });
  }

  /** A slash, a ring and a message where a swing landed, plus its sounds. */
  private showSwing(e: SwingEvent) {
    const { vol, pan } = this.audioFrom(e.x, e.y);
    this.sfx.swing(Math.max(vol, 0.25), pan);
    if (e.result === "player") this.sfx.found(Math.max(vol, 0.4), pan);
    else if (e.result === "prop") this.sfx.wrongHit(Math.max(vol, 0.4), pan);

    // Find the hunter to draw the slash from.
    let from: Phaser.GameObjects.Arc | undefined;
    this.room?.state.players.forEach((p: PlayerState, id: string) => {
      if (p.role === "hunter") from = this.sprites.get(id);
    });
    if (from) {
      const ang = Math.atan2(e.y - from.y, e.x - from.x);
      const slash = this.add.graphics().setDepth(70);
      slash.lineStyle(5, 0xffffff, 0.85).beginPath().arc(from.x, from.y, 34, ang - 0.9, ang + 0.9).strokePath();
      slash.lineStyle(2, 0xffffff, 0.5).beginPath().arc(from.x, from.y, 42, ang - 0.7, ang + 0.7).strokePath();
      this.tweens.add({ targets: slash, alpha: 0, duration: 200, onComplete: () => slash.destroy() });
    }

    const color = e.result === "player" ? 0x4ade80 : e.result === "prop" ? 0xef4444 : 0xaaaaaa;
    const ring = this.add.circle(e.x, e.y, 8).setStrokeStyle(3, color).setDepth(70);
    this.tweens.add({ targets: ring, radius: 30, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    if (e.result === "nothing") return;
    if (e.result === "prop" && this.me?.role === "hunter") this.cameras.main.shake(130, 0.005);
    const label = this.add
      .text(e.x, e.y - 20, e.result === "player" ? "FOUND!" : "Just an object", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: e.result === "player" ? "#9dffa8" : "#ff8a8a",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(70);
    this.tweens.add({ targets: label, y: label.y - 26, alpha: 0, duration: 900, onComplete: () => label.destroy() });
  }

  // ------------------------------------------------------------- frame

  /** Picture, visibility and transparency of each player's character / disguise. */
  private styleAndVisibility(id: string, p: PlayerState, myRole: string) {
    const ghost = !p.alive || p.role === "spectator";
    const char = this.chars.get(id);
    if (!char) return;
    const key = charKey(p.role, id);
    if (char.texture.key !== key) char.setTexture(key);
    // The hunter never sees ghosts; everyone else sees them faintly.
    const hidden = ghost && myRole === "hunter";
    const skin = this.skins.get(id);
    char.setVisible(!skin && !hidden).setAlpha(ghost ? 0.35 : 1);
    skin?.setVisible(!hidden).setAlpha(ghost ? 0.35 : 1);
    this.skinShadows.get(id)?.setVisible(!hidden && !ghost);
  }

  /** Characters follow their anchors, turn toward where they go, and make footsteps. */
  private updateCharacters(state: GameState, me: PlayerState, myId: string) {
    this.chars.forEach((img, id) => {
      const dot = this.sprites.get(id);
      const info = state.players.get(id);
      if (!dot || !info) return;
      img.setPosition(dot.x, dot.y);

      const last = this.lastPos.get(id) ?? { x: dot.x, y: dot.y };
      const moved = Math.hypot(dot.x - last.x, dot.y - last.y);
      this.lastPos.set(id, { x: dot.x, y: dot.y });

      // The hunter faces the mouse; everyone else faces the way they walk.
      if (id === myId && me.role === "hunter" && state.phase === "hunt") {
        const ptr = this.input.activePointer;
        img.rotation = Phaser.Math.Angle.RotateTo(img.rotation, Math.atan2(ptr.worldY - dot.y, ptr.worldX - dot.x), 0.3);
      } else if (moved > 0.4) {
        img.rotation = Phaser.Math.Angle.RotateTo(img.rotation, Math.atan2(dot.y - last.y, dot.x - last.x), 0.25);
      }

      // Footsteps every so often while moving. Ghosts are silent.
      if (moved < 0.2 || moved > 60 || !info.alive || info.role === "spectator") return;
      const acc = (this.stepAcc.get(id) ?? 0) + moved;
      if (acc < 46) {
        this.stepAcc.set(id, acc);
        return;
      }
      this.stepAcc.set(id, acc - 46);
      const { vol, pan } = id === myId ? { vol: 0.7, pan: 0 } : this.audioFrom(dot.x, dot.y);
      if (vol < 0.05) return;
      const body = state.bodies.get(id);
      // A prop dragging itself around makes a scraping noise: another tell.
      if (body?.disguise) this.sfx.scrape(vol, pan);
      else this.sfx.step(vol, pan);
    });
  }

  /** Round start, countdown ticks, results, settling and background hum. */
  private updateSounds(state: GameState, me: PlayerState, myBody: BodyState, myId: string) {
    void myId;
    const phase = state.phase;
    if (phase !== this.prevPhase) {
      if (phase === "hide") this.sfx.roundStart();
      if (phase === "hunt") {
        this.sfx.huntStart();
        this.sfx.startAmbience();
      }
      if (phase === "end") {
        this.sfx.stopAmbience();
        const propsWon = state.winner === "props";
        if (me.role === "hunter") (propsWon ? this.sfx.lose : this.sfx.win).call(this.sfx);
        else if (me.role === "prop") (propsWon ? this.sfx.win : this.sfx.lose).call(this.sfx);
      }
      if (phase === "lobby") this.sfx.stopAmbience();
      this.prevPhase = phase;
    }

    // Countdown beeps: lobby start and the last seconds of hiding.
    if (state.timeLeft !== this.prevTime) {
      const t = state.timeLeft;
      if ((phase === "lobby" && t > 0 && t <= 3) || (phase === "hide" && t > 0 && t <= 3)) this.sfx.tick(t === 1);
      this.prevTime = t;
    }

    // A soft chime when you become a perfect copy.
    if (myBody.settled && !this.prevSettled) this.sfx.settle();
    this.prevSettled = myBody.settled;
  }

  update(time: number, delta: number) {
    const room = this.room;
    const state = room?.state;
    const me = this.me;
    const myBody = this.myBody;
    if (!room || !state || !me || !myBody) {
      this.hud.update({ connected: this.connected || !room, phase: "", timeLeft: 0, winner: "", role: "", alive: true, hp: 0, playerCount: 0, propsLeft: 0 });
      return;
    }
    const phase = state.phase;
    const myDot = this.sprites.get(room.sessionId);
    const iAmHunter = me.role === "hunter";
    const frozen = iAmHunter && phase === "hide";

    // Send input only when it changes.
    const dx = frozen ? 0 : (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0);
    const dy = frozen ? 0 : (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0);
    if (dx !== this.lastInput.dx || dy !== this.lastInput.dy) {
      this.lastInput = { dx, dy };
      room.send(MSG_INPUT, { dx, dy });
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyE)) room.send(MSG_DISGUISE);
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) room.send(MSG_UNDISGUISE);
    if (Phaser.Input.Keyboard.JustDown(this.keyR) && myBody.disguise) room.send(MSG_ROTATE);
    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) this.swing();
    if (Phaser.Input.Keyboard.JustDown(this.keyM)) this.hud.toast(this.sfx.toggleMute() ? "Sound off" : "Sound on");

    state.bodies.forEach((p: BodyState, id: string) => {
      const dot = this.sprites.get(id);
      const info = state.players.get(id);
      if (!dot || !info) return;
      this.styleAndVisibility(id, info, me.role);

      if (id !== room.sessionId) {
        // Other players: glide toward the latest server position.
        dot.x = Phaser.Math.Linear(dot.x, p.x, 0.3);
        dot.y = Phaser.Math.Linear(dot.y, p.y, 0.3);
        return;
      }

      // Me: move instantly with the same rules as the server (prediction),
      // so the game feels responsive even when the connection is slow.
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        const step = (moveSpeed(me.role, !!myBody.disguise) * delta) / 1000;
        const next = moveWithCollision(dot.x, dot.y, (dx / len) * step, (dy / len) * step, PLAYER_RADIUS);
        dot.setPosition(next.x, next.y);
      }

      // Correct drift toward the server's version of events.
      const err = Math.hypot(p.x - dot.x, p.y - dot.y);
      if (err > 120) {
        dot.setPosition(p.x, p.y); // far off: snap
      } else if (dx === 0 && dy === 0) {
        dot.x = Phaser.Math.Linear(dot.x, p.x, 0.2); // standing still: settle
        dot.y = Phaser.Math.Linear(dot.y, p.y, 0.2);
      }
    });

    this.updateCharacters(state, me, room.sessionId);
    this.updateSounds(state, me, myBody, room.sessionId);

    // Disguise sprites and the self ring follow their player's dot.
    // A prop that is moving (or has not held still long enough) wobbles: that is the tell.
    this.skins.forEach((img, id) => {
      const d = this.sprites.get(id);
      if (d) img.setPosition(d.x, d.y);
      const settled = state.bodies.get(id)?.settled ?? true;
      const sway = settled ? 0 : Math.sin(time / 70) * 0.16;
      const pulse = settled ? 1 : 1 + Math.sin(time / 55) * 0.07;
      const base = ((state.bodies.get(id)?.rot ?? 0) * Math.PI) / 2;
      img.rotation = Phaser.Math.Angle.RotateTo(img.rotation, base + sway, 0.4);
      img.setScale(Phaser.Math.Linear(img.scaleX, pulse, 0.35));
      this.skinShadows.get(id)?.setPosition(img.x + 3, img.y + 4).setRotation(img.rotation).setScale(img.scaleX);
    });
    if (myDot) {
      this.selfRing?.setPosition(myDot.x, myDot.y).setVisible(me.alive);
      if (this.selfRing && this.ringSettled !== myBody.settled) {
        this.ringSettled = myBody.settled;
        // Green = perfect copy. Yellow = still wobbling.
        this.selfRing.setStrokeStyle(2, myBody.settled ? 0x4ade80 : 0xfacc15);
      }
    }

    // Hunter: limited vision, plus an aiming marker.
    this.reticle.clear();
    if (iAmHunter && myDot && (phase === "hide" || phase === "hunt")) {
      if (phase === "hide") this.fog.blind();
      else this.fog.see(myDot.x, myDot.y);
      if (phase === "hunt") {
        const ptr = this.input.activePointer;
        const d = Math.hypot(ptr.worldX - myDot.x, ptr.worldY - myDot.y) || 1;
        const k = Math.min(1, ATTACK_RANGE / d);
        const ax = myDot.x + (ptr.worldX - myDot.x) * k;
        const ay = myDot.y + (ptr.worldY - myDot.y) * k;
        this.reticle.lineStyle(1, 0xffffff, 0.25).strokeCircle(myDot.x, myDot.y, ATTACK_RANGE);
        this.reticle.lineStyle(2, 0xffffff, 0.9).strokeCircle(ax, ay, 9).lineBetween(ax - 13, ay, ax + 13, ay).lineBetween(ax, ay - 13, ax, ay + 13);
      }
    } else {
      this.fog.hide();
    }

    // Everyone else can see exactly where the hunter can see.
    let hunterDot: Phaser.GameObjects.Arc | undefined;
    let propsLeft = 0;
    let playerCount = 0;
    state.players.forEach((p: PlayerState, id: string) => {
      playerCount++;
      if (p.role === "hunter") hunterDot = this.sprites.get(id);
      if (p.role === "prop" && p.alive) propsLeft++;
    });
    this.hunterView.clear();
    if (!iAmHunter && hunterDot && (phase === "hide" || phase === "hunt")) {
      const hx = hunterDot.x;
      const hy = hunterDot.y;
      // Pull far corners in to the vision circle.
      const pts = new Sight(hx, hy, VISION_RADIUS).polygon().map((q) => {
        const d = Math.hypot(q.x - hx, q.y - hy);
        const k = d > VISION_RADIUS ? VISION_RADIUS / d : 1;
        return new Phaser.Math.Vector2(hx + (q.x - hx) * k, hy + (q.y - hy) * k);
      });
      this.hunterView.fillStyle(0xef4444, 0.16).fillPoints(pts, true);
      this.hunterView.lineStyle(2, 0xef4444, 0.45).strokePoints(pts, true);
    }

    // Prompt to copy a nearby object (props only).
    let prompt: string | null = null;
    if (myDot && me.role === "prop" && me.alive && phase !== "end") {
      const near = nearestDisguisableProp(myDot.x, myDot.y);
      if (near && near.type !== myBody.disguise) prompt = `E: become ${PROP_TYPES[near.type]!.name}`;
    }
    this.hud.setPrompt(prompt);

    // Tell a disguised prop whether it is a perfect copy yet.
    let note: string | null = null;
    let noteColor = "#ffffff";
    if (me.role === "prop" && me.alive && myBody.disguise && phase !== "end") {
      if (myBody.settled) {
        note = "Perfect copy — you are invisible among the real ones";
        noteColor = "#9dffa8";
      } else {
        note = "Wobbling! Hold still to blend in";
        noteColor = "#ffe27a";
      }
    }
    this.hud.setNote(note, noteColor);

    this.hud.update({
      connected: true,
      phase,
      timeLeft: state.timeLeft,
      winner: state.winner,
      role: me.role,
      alive: me.alive,
      hp: me.hp,
      playerCount,
      propsLeft,
    });
  }
}
