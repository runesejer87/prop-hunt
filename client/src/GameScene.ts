import Phaser from "phaser";
import { FONT_BODY, FONT_DISPLAY } from "./theme.ts";
import { Callbacks, type Room } from "@colyseus/sdk";
import { Fog } from "./Fog.ts";
import { addIconTextures } from "./icons.ts";
import { Lobby, type LobbyPlayer } from "./Lobby.ts";
import { logOut } from "./gate.ts";
import { Hud, type BoardRow } from "./Hud.ts";
import { Sound } from "./Sound.ts";
import { TouchControls, isTouchDevice } from "./Touch.ts";
import { drawWorld, makePropTextures, placeProps, makeCharacterTextures, makeLightTextures, placeLights, placeFireflies, charKey } from "./art.ts";
import {
  footprint,
  SWING_REACH,
  SWING_CONE,
  MSG_INPUT,
  MSG_DISGUISE,
  MSG_UNDISGUISE,
  MSG_ROTATE,
  MSG_ATTACK,
  MSG_SWING,
  MSG_PING,
  MSG_ABILITY,
  MSG_INSPECT,
  MSG_TAUNT,
  MSG_ADD_BOT,
  MSG_REMOVE_BOT,
  MSG_READY,
  MAX_PLAYERS,
  MSG_TAUNTED,
  type TauntEvent,
  MSG_INSPECT_RESULT,
  MSG_ALERT,
  type InspectResult,
  type AlertMessage,
  SWEEP_EVERY,
  type PingEvent,
  RADAR_RADIUS,
  type SwingEvent,
  ATTACK_RANGE,
  VISION_RADIUS,
  HIDE_TIME,
  HUNT_TIME,
  Sight,
  PROP_TYPES,
  getMap,
  DEFAULT_MAP_ID,
  type GameMap,
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
  private lobby!: Lobby;
  private styleOf = new Map<string, string>();
  private reticle!: Phaser.GameObjects.Graphics;
  private reticleIcon!: Phaser.GameObjects.Image;
  private curInput = { dx: 0, dy: 0 };
  private frameDelta = 16.7;
  private hunterView!: Phaser.GameObjects.Graphics;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private skins = new Map<string, Phaser.GameObjects.Image>();
  private selfRing?: Phaser.GameObjects.Arc;
  private ringSettled?: boolean;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private touch?: TouchControls;
  private touchUsed = false;
  private baseZoom = 1;
  private lastSentAt = 0;
  private inspectHeld = false;
  private inspectAim = { x: 0, y: 0 };
  private checks = new Map<number, Phaser.GameObjects.Text>();
  private beingInspected = false;
  private lastAlarmAt = 0;
  private prevAlert = 0;
  private prevRound = 0;
  private names = new Map<string, Phaser.GameObjects.Text>();
  private sfx = new Sound();
  private chars = new Map<string, Phaser.GameObjects.Image>();
  private skinShadows = new Map<string, Phaser.GameObjects.Image>();
  private skinReady = new Set<string>();
  private lastPos = new Map<string, { x: number; y: number }>();
  private stepAcc = new Map<string, number>();
  private walkPhase = new Map<string, number>();
  private idleFrames = new Map<string, number>();
  private vignette!: Phaser.GameObjects.Image;
  private prevPhase = "";
  private prevTime = -1;
  private prevSettled = false;

  private initialRoom!: Room<any, GameState>;
  private map!: GameMap;
  private mapId = "";
  /** Everything drawn for the current map, so it can be swapped out when the map changes. */
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private lightImages: Phaser.GameObjects.Image[] = [];

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
    makeLightTextures(this);
    this.fog = new Fog(this);
    this.buildWorld(this.initialRoom.state.map || DEFAULT_MAP_ID);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;
    this.keyE = this.input.keyboard!.addKey("E");
    this.keyQ = this.input.keyboard!.addKey("Q");
    this.keyM = this.input.keyboard!.addKey("M");
    this.keyR = this.input.keyboard!.addKey("R");
    this.keyTab = this.input.keyboard!.addKey("TAB");
    this.keyF = this.input.keyboard!.addKey("F");
    this.keyC = this.input.keyboard!.addKey("C");
    this.keyX = this.input.keyboard!.addKey("X");
    this.input.keyboard!.addCapture("TAB");
    this.keySpace = this.input.keyboard!.addKey("SPACE");

    // Browsers only allow sound after a click or key press.
    const unlock = () => this.sfx.unlock();
    this.input.keyboard!.on("keydown", unlock);
    this.input.on("pointerdown", unlock);
    // iPhones and iPads only allow sound from the moment a finger lifts.
    this.input.on("pointerup", unlock);
    window.addEventListener("touchend", unlock, { passive: true });

    // If the page loses focus (app switch, notification, a held key never "lifting"), stop walking.
    const letGo = () => {
      this.lastInput = { dx: 0, dy: 0 };
      this.room?.send(MSG_INPUT, { dx: 0, dy: 0 });
      this.touch?.releaseAll();
      this.input.keyboard?.resetKeys();
    };
    window.addEventListener("blur", letGo);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) letGo();
    });

    // Dark edges around the screen, and a gentle zoom-in when the game starts.
    this.vignette = this.add.image(0, 0, "vignette").setOrigin(0).setScrollFactor(0).setDepth(90);
    const fitVignette = () => this.vignette.setDisplaySize(this.scale.width, this.scale.height);
    fitVignette();
    this.scale.on("resize", fitVignette);
    // (No camera zoom: it would also shrink and shift the on-screen buttons and text.)
    this.hud = new Hud(this);
    this.lobby = new Lobby({
      ready: (on) => this.room?.send(MSG_READY, { ready: on }),
      addBot: (level) => this.botButton(level === "easy" ? "addEasy" : "add"),
      removeBot: () => this.botButton("remove"),
      logOut,
    });
    this.reticle = this.add.graphics().setDepth(60);
    addIconTextures(this);
    this.reticleIcon = this.add.image(0, 0, "ic_search").setDepth(61).setVisible(false);
    // Props can see exactly what the hunter can see (a faint red glow on the floor).
    this.hunterView = this.add.graphics().setDepth(3);
    // The mouse swings where it points. Fingers use the on-screen buttons instead.
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.touchUsed = p.wasTouch;
      const btn = this.hud.lobbyButtonAt(p.x, p.y);
      if (btn) {
        this.botButton(btn);
        return;
      }
      if (!p.wasTouch) this.swing();
    });
    if (isTouchDevice()) {
      this.touch = new TouchControls(this, {
        disguise: () => this.doDisguise(),
        undisguise: () => this.room?.send(MSG_UNDISGUISE),
        rotate: () => this.doRotate(),
        taunt: () => this.doTaunt(),
        ability: () => this.doAbility(),
        swing: () => this.swing(),
        inspect: (on) => (on ? this.startInspect() : this.stopInspect()),
        mute: () => this.hud.toast(this.sfx.toggleMute() ? "Sound off" : "Sound on"),
      });
      this.touch.blocked = (x, y) => this.hud.lobbyButtonAt(x, y) !== null;
      this.hud.setTouchMode(true);
      if (this.scale.height > this.scale.width && this.scale.width < 700) this.hud.toast("Tip: turn your phone sideways for a better view");
    }
    this.attach(this.initialRoom);
  }

  /** Draw the map: floors, walls, furniture, lights. Replaces the previous map if there was one. */
  private buildWorld(mapId: string) {
    // Remove the old map.
    for (const img of this.lightImages) this.tweens.killTweensOf(img);
    this.lightImages = [];
    for (const obj of this.worldObjects) obj.destroy();
    this.worldObjects = [];
    this.clearChecks();

    this.map = getMap(mapId);
    this.mapId = this.map.id;

    const before = new Set(this.children.list);
    drawWorld(this, this.map);
    placeProps(this, this.map);
    placeLights(this, this.map);
    placeFireflies(this, this.map);
    for (const obj of this.children.list) {
      if (!before.has(obj)) {
        this.worldObjects.push(obj);
        if (obj instanceof Phaser.GameObjects.Image && obj.texture.key === "glow") this.lightImages.push(obj);
      }
    }

    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);
    this.fog.setWorld(this.map.width, this.map.height);
    // Everyone has been moved to the new map: jump straight to their new spots.
    this.room?.state.bodies.forEach((b: BodyState, id: string) => {
      this.sprites.get(id)?.setPosition(b.x, b.y);
      this.lastPos.set(id, { x: b.x, y: b.y });
    });
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
    const wasReady = this.skinReady.has(id);
    if (wasReady && (pt || had)) {
      const { vol, pan } = this.audioFrom(dot.x, dot.y);
      if (vol > 0.03) (pt ? this.sfx.poof : this.sfx.unpoof).call(this.sfx, isMe ? 0.8 : vol, isMe ? 0 : pan);
      this.burst(dot.x, dot.y, 0xe8e4da, pt ? 12 : 8, 70, 520, 3.6, 0.8);
    }
    this.skinReady.add(id);

    if (!pt) return;
    const turn = ((this.room?.state.bodies.get(id)?.rot ?? 0) * Math.PI) / 2;
    this.skinShadows.set(id, this.add.image(dot.x + 3, dot.y + 4, `shadow_${pt.id}`).setAlpha(0.3).setDepth(4.5).setRotation(turn));
    // Starts small and pops up to full size (the wobble code eases the scale back to 1).
    this.skins.set(id, this.add.image(dot.x, dot.y, `prop_${pt.id}`).setDepth(5).setRotation(turn).setScale(wasReady ? 0.55 : 1));
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
      this.names.get(id)?.destroy();
      this.names.delete(id);
      this.styleOf.delete(id);
      this.skinReady.delete(id);
      this.lastPos.delete(id);
      this.stepAcc.delete(id);
      this.walkPhase.delete(id);
      this.idleFrames.delete(id);
      if (id === room.sessionId) this.selfRing?.destroy();
    });
    room.onMessage(MSG_SWING, (e: SwingEvent) => this.showSwing(e));
    room.onMessage(MSG_PING, (p: PingEvent) => this.showPing(p));
    room.onMessage(MSG_INSPECT_RESULT, (r: InspectResult) => this.showInspectResult(r));
    room.onMessage(MSG_TAUNTED, (e: TauntEvent) => this.showTaunt(e));
    room.onMessage(MSG_ALERT, (a: AlertMessage) => {
      this.beingInspected = a.active;
      if (a.active) this.sfx.alarm();
    });
    room.onDrop(() => {
      this.connected = false;
      this.hud.toast("Connection lost, reconnecting…");
    });
    room.onReconnect(() => {
      this.connected = true;
      this.lastInput = { dx: 0, dy: 0 };
      this.hud.toast("Reconnected");
    });
    room.onLeave(() => {
      this.connected = false;
    });
  }

  /** What the hunter learns from an inspection. */
  private showInspectResult(r: InspectResult) {
    const say = (text: string, color: string) => {
      const label = this.add
        .text(r.x, r.y - 22, text, { fontFamily: FONT_DISPLAY, fontSize: "18px", fontStyle: "600", color, stroke: "#0b0d12", strokeThickness: 4 })
        .setOrigin(0.5)
        .setDepth(70);
      this.tweens.add({ targets: label, y: label.y - 26, alpha: 0, duration: 1300, onComplete: () => label.destroy() });
    };
    if (r.result === "clear") {
      say("Just an object", "#9dffa8");
      this.sfx.inspectOk();
      if (r.propId !== undefined && !this.checks.has(r.propId)) {
        const prop = this.map.props.find((p) => p.id === r.propId);
        if (prop) {
          // A tick stays on checked objects for the rest of the round.
          const tick = this.add
            .text(prop.x, prop.y, "✓", { fontFamily: FONT_BODY, fontSize: "20px", fontStyle: "bold", color: "#7cf5a0", stroke: "#000", strokeThickness: 3 })
            .setOrigin(0.5)
            .setDepth(6)
            .setAlpha(0.9);
          this.checks.set(r.propId, tick);
        }
      }
    } else if (r.result === "moved") {
      say("It moved!", "#ffe27a");
    } else if (r.result === "none") {
      this.hud.toast("Nothing there to inspect");
    }
  }

  private clearChecks() {
    this.checks.forEach((t) => t.destroy());
    this.checks.clear();
  }

  /** A little puff of round particles. Used for dust, sparks and pops. */
  private burst(x: number, y: number, color: number, count: number, speed: number, life: number, size: number, alpha: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random() * 0.8);
      const t = life * (0.7 + Math.random() * 0.6);
      const dot = this.add.circle(x, y, size * (0.6 + Math.random() * 0.8), color, alpha).setDepth(8);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * v * (t / 1000),
        y: y + Math.sin(a) * v * (t / 1000),
        alpha: 0,
        scale: 0.2,
        duration: t,
        ease: "Quad.easeOut",
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** Rings on the hunter's screen: noises (yellow), radar blips (blue) and the radar sweep itself. */
  private showPing(p: PingEvent) {
    if (p.kind === "pulse") {
      const sweep = this.add.circle(p.x, p.y, 10).setStrokeStyle(3, 0x5ad1ff, 0.8).setDepth(55);
      this.tweens.add({ targets: sweep, radius: RADAR_RADIUS, alpha: 0, duration: 800, ease: "Cubic.easeOut", onComplete: () => sweep.destroy() });
      this.sfx.radar();
      return;
    }
    if (p.kind === "area") {
      // The prop is somewhere inside this circle.
      const r = p.r ?? 100;
      const area = this.add.circle(p.x, p.y, r, 0xff7a3a, 0.13).setStrokeStyle(2, 0xff9a5a, 0.7).setDepth(55);
      this.tweens.add({ targets: area, alpha: 0, duration: 3600, ease: "Quad.easeIn", onComplete: () => area.destroy() });
      this.sfx.ping(this.audioFrom(p.x, p.y).pan);
      return;
    }
    if (p.kind === "dust") {
      // Someone just changed shape near here.
      this.burst(p.x, p.y, 0xe8e4da, 10, 46, 1100, 4.5, 0.55);
      const q = this.add.text(p.x, p.y - 8, "?", { fontFamily: FONT_BODY, fontSize: "18px", color: "#fff", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5).setDepth(55);
      this.tweens.add({ targets: q, y: q.y - 16, alpha: 0, duration: 1400, onComplete: () => q.destroy() });
      this.sfx.poof(0.35, this.audioFrom(p.x, p.y).pan);
      return;
    }
    const radar = p.kind === "radar";
    const color = radar ? 0x5ad1ff : 0xfbbf24;
    const life = radar ? 2400 : 1700;
    const ring = this.add.circle(p.x, p.y, 6).setStrokeStyle(3, color, 0.95).setDepth(55);
    const dot = this.add.circle(p.x, p.y, 4, color, 0.9).setDepth(55);
    this.tweens.add({ targets: ring, radius: radar ? 36 : 54, alpha: 0, duration: life, onComplete: () => ring.destroy() });
    this.tweens.add({ targets: dot, alpha: 0, duration: life, onComplete: () => dot.destroy() });
    if (!radar) this.sfx.ping(this.audioFrom(p.x, p.y).pan);
  }

  private addBody(b: BodyState, id: string) {
    const isMe = id === this.room?.sessionId;
    // The "dot" is an invisible anchor: it holds the position that everything else follows.
    const dot = this.add.circle(b.x, b.y, PLAYER_RADIUS).setVisible(false);
    this.sprites.set(id, dot);
    this.chars.set(id, this.add.image(b.x, b.y, "char_0_0").setDepth(5));
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

  /** The object (or hiding player) in front of the hunter: the same spots the server checks when swinging. */
  private focusTarget(state: GameState): { x: number; y: number; w: number; h: number } | null {
    const id = this.room?.sessionId;
    const dot = id ? this.sprites.get(id) : undefined;
    if (!dot || !id) return null;
    const base = this.chars.get(id)?.rotation ?? Math.PI / 2;
    const SLOP = 6;
    const offsets = [0, SWING_CONE / 2, -SWING_CONE / 2, SWING_CONE, -SWING_CONE];
    for (const dist of [26, 42, SWING_REACH]) {
      for (const off of offsets) {
        const px = dot.x + Math.cos(base + off) * dist;
        const py = dot.y + Math.sin(base + off) * dist;
        let best: { x: number; y: number; w: number; h: number; d: number } | null = null;
        const consider = (x: number, y: number, w: number, h: number) => {
          if (Math.abs(px - x) > w / 2 + SLOP || Math.abs(py - y) > h / 2 + SLOP) return;
          const d = Math.hypot(px - x, py - y);
          if (!best || d < best.d) best = { x, y, w, h, d };
        };
        for (const p of this.map.props) {
          const fp = footprint(p.type, p.rot);
          consider(p.x, p.y, fp.w, fp.h);
        }
        state.bodies.forEach((b: BodyState, bid: string) => {
          const info = state.players.get(bid);
          if (bid === id || !b.disguise || !info || info.role !== "prop" || !info.alive) return;
          const fp = footprint(b.disguise, b.rot);
          consider(b.x, b.y, fp.w, fp.h);
        });
        if (best) return best;
      }
    }
    return null;
  }

  /** The spot in front of the hunter, the way they last walked. Swings and inspections land here. */
  private aimWorld(): { x: number; y: number } {
    const id = this.room?.sessionId;
    const dot = id ? this.sprites.get(id) : undefined;
    if (!dot || !id) return { x: 0, y: 0 };
    const a = this.chars.get(id)?.rotation ?? Math.PI / 2;
    return { x: dot.x + Math.cos(a) * 42, y: dot.y + Math.sin(a) * 42 };
  }

  private swing() {
    if (!this.canSwing()) return;
    this.stopInspect();
    this.room!.send(MSG_ATTACK, {}); // the server works out what is in front of you
  }

  // ---- things you can do (keyboard keys and touch buttons both call these)

  private doDisguise() {
    if (this.me?.role === "prop") this.room?.send(MSG_DISGUISE);
  }

  /** Props: make a silly sound (Space). The server checks the cooldown. */
  private doTaunt() {
    if (this.me?.role === "prop") this.room?.send(MSG_TAUNT);
  }

  /** Someone taunted: play the sound (louder when close) and show the sound word. */
  private showTaunt(e: TauntEvent) {
    const myDot = this.room ? this.sprites.get(this.room.sessionId) : undefined;
    const dist = myDot ? Math.hypot(e.x - myDot.x, e.y - myDot.y) : 0;
    const vol = Math.max(0.2, 1 - dist / 1100);
    const pan = myDot ? Math.max(-1, Math.min(1, (e.x - myDot.x) / 300)) : 0;
    this.sfx.taunt(e.sound, vol, pan);
    const words = ["pfffffft!", "Yo-del-ay-hee-hoo!", "BOING!", "HONK HONK!", "womp womp wooomp"];
    const colors = [0xa6d65c, 0xffd166, 0x7ad7ff, 0xffa94d, 0xc4a1ff];
    this.burst(e.x, e.y, colors[e.sound % 5]!, 14, 80, 900, 4.5, 0.7);
    const bubble = this.add
      .text(e.x, e.y - 26, words[e.sound % 5]!, {
        fontFamily: FONT_DISPLAY,
        fontSize: "20px",
        fontStyle: "600",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(80);
    this.tweens.add({ targets: bubble, y: bubble.y - 34, alpha: 0, scale: 1.25, duration: 1700, ease: "Quad.easeOut", onComplete: () => bubble.destroy() });
  }

  /** Lobby: add or remove a computer player. */
  private botButton(which: "add" | "addEasy" | "remove") {
    if (!this.room || this.room.state.phase !== "lobby") return;
    if (which === "remove") this.room.send(MSG_REMOVE_BOT, {});
    else this.room.send(MSG_ADD_BOT, { level: which === "addEasy" ? "easy" : "normal" });
  }

  private doRotate() {
    if (this.myBody?.disguise) this.room?.send(MSG_ROTATE);
  }

  private doAbility() {
    const me = this.me;
    const room = this.room;
    if (!room || !me || room.state.phase !== "hunt" || !me.alive || me.cooldown > 0) return;
    if (me.role !== "prop" && me.role !== "hunter") return;
    room.send(MSG_ABILITY);
    if (me.role === "prop") {
      this.sfx.distract();
      this.hud.toast("Fake noise sent");
    }
  }

  /** The hunter starts checking whatever is where they are aiming (takes a couple of seconds). */
  private startInspect() {
    const me = this.me;
    if (!this.room || !me || me.role !== "hunter" || this.room.state.phase !== "hunt" || this.inspectHeld) return;
    this.inspectHeld = true;
    this.inspectAim = this.aimWorld();
    this.room.send(MSG_INSPECT, { x: 0, y: 0, on: true });
  }

  private stopInspect() {
    if (!this.inspectHeld) return;
    this.inspectHeld = false;
    this.room?.send(MSG_INSPECT, { x: 0, y: 0, on: false });
  }

  /** A slash, a ring and a message where a swing landed, plus its sounds. */
  private showSwing(e: SwingEvent) {
    const { vol, pan } = this.audioFrom(e.x, e.y);
    this.sfx.swing(Math.max(vol, 0.25), pan);
    if (e.result === "player") this.sfx.found(Math.max(vol, 0.4), pan);
    else if (e.result === "caught") this.sfx.alarm();
    else if (e.result === "escaped") this.sfx.unpoof(Math.max(vol, 0.5), pan);
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

    if (e.result === "caught") {
      this.burst(e.x, e.y, 0xffd166, 14, 120, 600, 3.2, 0.95);
      this.burst(e.x, e.y, 0xff7a6a, 8, 80, 500, 2.6, 0.9);
    } else if (e.result === "escaped") {
      this.burst(e.x, e.y, 0xcfd3dc, 10, 90, 500, 3, 0.7);
    } else if (e.result === "player") {
      this.burst(e.x, e.y, 0x7cf5a0, 16, 120, 650, 3.4, 0.95);
      this.burst(e.x, e.y, 0xfff1a6, 8, 90, 550, 2.6, 0.95);
    } else if (e.result === "prop") {
      this.burst(e.x, e.y, 0xff7a6a, 10, 100, 500, 3, 0.9);
      this.burst(e.x, e.y, 0xb8b8c0, 8, 70, 480, 2.4, 0.8);
    } else {
      this.burst(e.x, e.y, 0xd0d0d8, 4, 40, 300, 2, 0.5);
    }
    const color = e.result === "player" ? 0x4ade80 : e.result === "caught" ? 0xffd166 : e.result === "prop" ? 0xef4444 : 0xaaaaaa;
    const ring = this.add.circle(e.x, e.y, 8).setStrokeStyle(3, color).setDepth(70);
    this.tweens.add({ targets: ring, radius: 30, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    if (e.result === "nothing") return;
    if (e.result === "prop" && this.me?.role === "hunter") this.cameras.main.shake(130, 0.005);
    const label = this.add
      .text(e.x, e.y - 20, e.result === "player" ? "Got you!" : e.result === "caught" ? "Found you! Tag them!" : e.result === "escaped" ? "Escaped!" : "Just an object", {
        fontFamily: FONT_DISPLAY,
        fontSize: "19px",
        fontStyle: "600",
        color: e.result === "player" ? "#9dffa8" : e.result === "caught" ? "#ffd166" : e.result === "escaped" ? "#cfd3dc" : "#ff8a8a",
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
    // The hunter never sees ghosts; everyone else sees them faintly.
    const hidden = ghost && myRole === "hunter";
    const skin = this.skins.get(id);
    char.setVisible(!skin && !hidden).setAlpha(ghost ? 0.35 : 1);
    skin?.setVisible(!hidden).setAlpha(ghost ? 0.35 : 1);
    this.skinShadows.get(id)?.setVisible(!hidden && !ghost);

    // A name tag over everyone else while they look like themselves.
    if (id !== this.room!.sessionId) {
      let tag = this.names.get(id);
      if (!tag) {
        tag = this.add
          .text(0, 0, p.name, { fontFamily: FONT_BODY, fontSize: "13px", fontStyle: "800", color: "#ffffff", stroke: "#0b0d12", strokeThickness: 4 })
          .setOrigin(0.5, 1)
          .setDepth(6);
        this.names.set(id, tag);
      }
      tag.setPosition(char.x, char.y - 22).setVisible(!skin && !hidden && !ghost).setText(p.name);
    }
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

      // Walking animation: swap between two step poses as they travel, standing when still.
      const idle = moved < 0.2 ? (this.idleFrames.get(id) ?? 0) + 1 : 0;
      this.idleFrames.set(id, idle);
      const phase = (this.walkPhase.get(id) ?? 0) + (moved < 60 ? moved : 0);
      this.walkPhase.set(id, phase);
      const pose = idle > 6 ? 0 : 1 + (Math.floor(phase / 14) % 2);
      const tex = `${charKey(info.role, id)}_${pose}`;
      if (img.texture.key !== tex) img.setTexture(tex);

      // Everyone faces the way they walk. The hunter swings and inspects that way.
      // Turning is smooth and the same speed at any frame rate. You face where you push (like the server
      // does), even when a wall stops you; others face the way they actually travel.
      void me;
      const turn = 0.25 * Math.min(this.frameDelta, 50) / 16.7;
      const mine = id === myId && Math.hypot(this.curInput.dx, this.curInput.dy) > 0.05;
      if (mine) img.rotation = Phaser.Math.Angle.RotateTo(img.rotation, Math.atan2(this.curInput.dy, this.curInput.dx), turn);
      else if (moved > 0.4) img.rotation = Phaser.Math.Angle.RotateTo(img.rotation, Math.atan2(dot.y - last.y, dot.x - last.x), turn);

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
      if (body?.disguise) {
        this.sfx.scrape(vol, pan);
        this.burst(dot.x, dot.y + 6, 0xb9a98a, 2, 22, 380, 2.2, 0.5);
      } else {
        this.sfx.step(vol, pan);
        this.burst(dot.x, dot.y + 8, 0xcfd3dc, 2, 16, 320, 1.8, 0.35);
      }
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
    if (state.map && state.map !== this.mapId) this.buildWorld(state.map);
    const phase = state.phase;
    const myDot = this.sprites.get(room.sessionId);
    const iAmHunter = me.role === "hunter";
    const frozen = iAmHunter && (phase === "hide" || me.inspect > 0);

    // Movement: keyboard (whole steps) or touch joystick (any direction and strength).
    const key = {
      x: (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0),
      y: (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0),
    };
    const stick = this.touch?.vector ?? { x: 0, y: 0 };
    const useStick = Math.abs(stick.x) + Math.abs(stick.y) > 0.01;
    const dx = frozen ? 0 : useStick ? stick.x : key.x;
    const dy = frozen ? 0 : useStick ? stick.y : key.y;
    this.curInput = { dx, dy };
    this.frameDelta = delta;
    // Send when it changes (a joystick changes a lot, so not more often than every 40 ms).
    const changed = Math.abs(dx - this.lastInput.dx) > 0.04 || Math.abs(dy - this.lastInput.dy) > 0.04;
    const stopped = dx === 0 && dy === 0 && (this.lastInput.dx !== 0 || this.lastInput.dy !== 0);
    if (stopped || (changed && time - this.lastSentAt >= 40)) {
      this.lastInput = { dx, dy };
      this.lastSentAt = time;
      room.send(MSG_INPUT, { dx, dy });
    }

    // Keys. The hunter's E is "inspect" (hold); a prop's E is "become that object".
    if (me.role === "hunter") {
      if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.startInspect();
      if (Phaser.Input.Keyboard.JustUp(this.keyE)) this.stopInspect();
    } else if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.doDisguise();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) room.send(MSG_UNDISGUISE);
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.doRotate();
    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      if (me.role === "hunter") this.swing();
      else this.doTaunt();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyF)) this.doAbility();
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) this.botButton("add");
    if (Phaser.Input.Keyboard.JustDown(this.keyX)) this.botButton("remove");
    if (Phaser.Input.Keyboard.JustDown(this.keyM)) this.hud.toast(this.sfx.toggleMute() ? "Sound off" : "Sound on");

    state.bodies.forEach((p: BodyState, id: string) => {
      const dot = this.sprites.get(id);
      const info = state.players.get(id);
      if (!dot || !info) return;
      this.styleAndVisibility(id, info, me.role);

      if (id !== room.sessionId) {
        // Other players: glide toward the latest server position.
        const k = 1 - Math.pow(0.7, Math.min(delta, 100) / 16.7); // same glide at any frame rate
        dot.x = Phaser.Math.Linear(dot.x, p.x, k);
        dot.y = Phaser.Math.Linear(dot.y, p.y, k);
        return;
      }

      // Me: move instantly with the same rules as the server (prediction),
      // so the game feels responsive even when the connection is slow.
      const len = Math.hypot(dx, dy);
      const moving = len > 0.05;
      if (moving) {
        const step = (moveSpeed(me.role, !!myBody.disguise, me.chase > 0) * Math.min(delta, 50) * Math.min(1, len)) / 1000;
        // Players disguised as objects are solid (only the ones we can see).
        const solid = (px: number, py: number, r: number) => {
          let hit = false;
          state.bodies.forEach((o: BodyState, oid: string) => {
            if (hit || oid === room.sessionId || !o.disguise) return;
            const op = state.players.get(oid);
            if (!op || op.role !== "prop" || !op.alive) return;
            const fp = footprint(o.disguise, o.rot);
            if (Math.abs(px - o.x) < fp.w / 2 + r && Math.abs(py - o.y) < fp.h / 2 + r) hit = true;
          });
          return hit;
        };
        const pieces = Math.max(1, Math.ceil(step / 6));
        let x = dot.x;
        let y = dot.y;
        for (let i = 0; i < pieces; i++) {
          const n = this.map.moveWithCollision(x, y, ((dx / len) * step) / pieces, ((dy / len) * step) / pieces, PLAYER_RADIUS, solid);
          x = n.x;
          y = n.y;
        }
        dot.setPosition(x, y);
      }

      // Correct drift toward the server's version of events. The server is always a
      // little behind while we move, so only pull when the gap is big, and pull gently.
      const err = Math.hypot(p.x - dot.x, p.y - dot.y);
      if (err > 400) {
        dot.setPosition(p.x, p.y); // really far off (e.g. pushed by the game): snap
      } else if (!moving) {
        dot.x = Phaser.Math.Linear(dot.x, p.x, 0.2); // standing still: settle
        dot.y = Phaser.Math.Linear(dot.y, p.y, 0.2);
      } else if (err > 60) {
        const kk = 1 - Math.pow(0.92, Math.min(delta, 50) / 16.7);
        dot.x = Phaser.Math.Linear(dot.x, p.x, kk);
        dot.y = Phaser.Math.Linear(dot.y, p.y, kk);
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
      else this.fog.see(myDot.x, myDot.y, this.map);
      if (phase === "hunt") {
        // Auto-focus: the thing the hunter would hit gets a friendly glowing frame.
        const focus = me.inspect > 0 ? null : this.focusTarget(state);
        const aim = focus ? { x: focus.x, y: focus.y } : me.inspect > 0 ? this.inspectAim : this.aimWorld();
        const ax = aim.x;
        const ay = aim.y;
        const pulse = 1 + Math.sin(time / 160) * 0.05;
        if (focus) {
          const w = (focus.w + 14) * pulse;
          const h = (focus.h + 14) * pulse;
          const arm = Math.min(14, w / 3, h / 3);
          const x0 = ax - w / 2;
          const x1 = ax + w / 2;
          const y0 = ay - h / 2;
          const y1 = ay + h / 2;
          const g = this.reticle;
          g.fillStyle(0xffd166, 0.12).fillRoundedRect(x0, y0, w, h, 8);
          g.lineStyle(3, 0xffd166, 1);
          for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) {
            g.beginPath().moveTo(cx, cy + sy * arm).lineTo(cx, cy).lineTo(cx + sx * arm, cy).strokePath();
          }
          this.reticleIcon.setPosition(ax, y0 - 14).setDisplaySize(20, 20).setTint(0xffd166).setAlpha(1).setVisible(true);
        } else if (me.inspect <= 0) {
          // Nothing in reach: a small soft ring where a swing would land.
          this.reticle.lineStyle(2, 0xffffff, 0.45).strokeCircle(ax, ay, 8);
          this.reticle.fillStyle(0xffffff, 0.45).fillCircle(ax, ay, 2);
          this.reticleIcon.setVisible(false);
        }
        // Inspecting: a ring fills up around the thing being checked.
        if (me.inspect > 0) {
          this.reticleIcon.setVisible(false);
          this.reticle.lineStyle(3, 0x5ad1ff, 0.25).strokeCircle(ax, ay, 24);
          this.reticle.lineStyle(5, 0x5ad1ff, 1).beginPath().arc(ax, ay, 24, -Math.PI / 2, -Math.PI / 2 + (me.inspect / 100) * Math.PI * 2).strokePath();
        }
      } else {
        this.reticleIcon.setVisible(false);
      }
    } else {
      this.fog.hide();
      this.reticleIcon.setVisible(false);
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
      const pts = new Sight(this.map, hx, hy, VISION_RADIUS).polygon().map((q) => {
        const d = Math.hypot(q.x - hx, q.y - hy);
        const k = d > VISION_RADIUS ? VISION_RADIUS / d : 1;
        return new Phaser.Math.Vector2(hx + (q.x - hx) * k, hy + (q.y - hy) * k);
      });
      this.hunterView.fillStyle(0xffb347, 0.14).fillPoints(pts, true);
      this.hunterView.lineStyle(2, 0xffc46b, 0.4).strokePoints(pts, true);
    }

    // Round changed: forget what was ticked off.
    if (state.round !== this.prevRound) {
      this.prevRound = state.round;
      this.clearChecks();
      this.beingInspected = false;
    }
    // The hunt tightens: tell everyone what that means for them.
    if (state.alert !== this.prevAlert) {
      if (state.alert > this.prevAlert && state.phase === "hunt") {
        const every = SWEEP_EVERY[state.alert - 1];
        this.hud.toast(
          iAmHunter
            ? `The hunt tightens: you'll see a rough area for every prop every ${every}s, and radar recharges faster`
            : `Careful! The hunter now senses roughly where you are every ${every}s`,
        );
        this.sfx.huntStart();
      }
      this.prevAlert = state.alert;
    }
    // A prop being inspected has a few seconds to slip away.
    if (this.beingInspected && (me.role !== "prop" || !me.alive || phase !== "hunt")) this.beingInspected = false;
    let runnerLeft = 0;
    state.players.forEach((p: PlayerState) => {
      if (p.chase > 0) runnerLeft = Math.max(runnerLeft, p.chase);
    });
    if (me.chase > 0) {
      this.hud.setWarning(`YOU'VE BEEN FOUND — RUN!  ${me.chase.toFixed(1)}s`, time);
    } else if (iAmHunter && runnerLeft > 0 && phase === "hunt") {
      this.hud.setWarning(`CATCH THE RUNNER — touch them!  ${runnerLeft.toFixed(1)}s`, time);
    } else if (this.beingInspected) {
      this.hud.setWarning("THE HUNTER IS INSPECTING YOU — MOVE AWAY!", time);
      if (time - this.lastAlarmAt > 450) {
        this.lastAlarmAt = time;
        this.sfx.alarm();
      }
    } else {
      this.hud.setWarning(null, time);
    }

    // Touch buttons for the role you have right now.
    if (this.touch) {
      const mode = !me.alive || me.role === "spectator" || phase === "end" ? "none" : me.role === "hunter" ? "hunter" : "prop";
      const abilityOn = phase === "hunt" && me.alive && (me.role === "hunter" || me.role === "prop");
      this.touch.update(mode, abilityOn ? { label: me.role === "hunter" ? "Radar" : "Distract", cooldown: me.cooldown } : null);
    }

    // Prompt to copy a nearby object (props only).
    let prompt: string | null = null;
    if (myDot && me.role === "prop" && me.alive && phase !== "end") {
      const near = this.map.nearestDisguisableProp(myDot.x, myDot.y);
      if (near && near.type !== myBody.disguise) prompt = `${this.touch ? "Tap Become" : "E: become"}: ${PROP_TYPES[near.type]!.name}`;
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

    const rows: BoardRow[] = [];
    state.players.forEach((p: PlayerState, id: string) => rows.push({ name: p.name, score: p.score, gain: p.gain, role: p.role, me: id === room.sessionId }));
    rows.sort((a, b) => b.score - a.score);
    let botCount = 0;
    state.players.forEach((p: PlayerState) => {
      if (p.bot) botCount++;
    });
    this.hud.setLobbyButtons(false, false, false); // the lobby card has these buttons now
    const lobbyRows: LobbyPlayer[] = [];
    state.players.forEach((p: PlayerState, id: string) => lobbyRows.push({ name: p.name, ready: p.ready, bot: p.bot, me: id === room.sessionId, score: p.score }));
    this.lobby.update(phase === "lobby", lobbyRows, state.timeLeft);
    this.hud.setBoard(this.keyTab.isDown || !!this.touch?.scoresHeld || phase === "end", rows, state.round, phase === "end");

    const abilityLabel = phase === "hunt" && me.alive ? (me.role === "hunter" ? "Radar" : me.role === "prop" ? "Distract" : null) : null;
    this.hud.setAbility(abilityLabel, me.cooldown);

    this.hud.update({
      connected: true,
      round: state.round,
      mapName: this.map.name,
      alert: state.alert,
      fraction: phase === "hide" ? state.timeLeft / HIDE_TIME : phase === "hunt" ? state.timeLeft / HUNT_TIME : -1,
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
