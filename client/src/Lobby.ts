import { MAX_PLAYERS, MIN_PLAYERS } from "@prop-hunt/shared";
import { icon } from "./icons.ts";

export interface LobbyPlayer {
  name: string;
  ready: boolean;
  bot: boolean;
  me: boolean;
  score: number;
  /** Asked to be the hunter. */
  wantHunter: boolean;
  wantHider: boolean;
}

export interface LobbyActions {
  ready(on: boolean): void;
  role(role: "hunter" | "hider" | "auto"): void;
  addBot(level: "normal" | "easy"): void;
  removeBot(): void;
  logOut(): void;
}

const COLORS = ["#4ade80", "#60a5fa", "#fbbf24", "#f472b6"];

/** The lobby screen: who is here, who is ready, and a Ready button. A plain HTML card over the game. */
export class Lobby {
  private el: HTMLDivElement;
  private list: HTMLDivElement;
  private status: HTMLDivElement;
  private readyBtn: HTMLButtonElement;
  private addBtn: HTMLButtonElement;
  private easyBtn: HTMLButtonElement;
  private removeBtn: HTMLButtonElement;
  private autoBtn!: HTMLButtonElement;
  private hiderBtn!: HTMLButtonElement;
  private hunterBtn!: HTMLButtonElement;
  private lastKey = "";
  private myReady = false;

  constructor(private actions: LobbyActions) {
    const el = document.createElement("div");
    el.id = "lobby";
    el.className = "ph-lobby";
    el.innerHTML = `
      <div class="ph-card">
        <div class="ph-head"><h2>${icon("users", 26)} Lobby</h2><div id="lb-count" class="ph-count"></div></div>
        <div id="lb-list" class="ph-list"></div>
        <div id="lb-status" class="ph-status"></div>
        <div class="ph-seg" role="group" aria-label="Your role">
          <button id="lb-auto" class="ph-segbtn">${icon("shuffle", 20)} Auto</button>
          <button id="lb-hider" class="ph-segbtn">${icon("ghost", 20)} Hider</button>
          <button id="lb-hunter" class="ph-segbtn">${icon("search", 20)} Hunter</button>
        </div>
        <div id="lb-roletip" class="ph-help" style="text-align:center"></div>
        <button id="lb-ready" class="ph-btn">Ready</button>
        <div class="ph-actions">
          <button id="lb-add" class="ph-btn ph-small">${icon("robot", 18)} CPU player</button>
          <button id="lb-easy" class="ph-btn ph-small">${icon("plus", 18)} Easy CPU</button>
          <button id="lb-remove" class="ph-btn ph-small ph-danger" style="flex:none">${icon("minus", 18)} CPU</button>
        </div>
        <div class="ph-foot"><span>${icon("link", 14)} Share the link with friends</span><a id="lb-out" href="#">${icon("logout", 14)} Log out</a></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.list = el.querySelector("#lb-list")!;
    this.status = el.querySelector("#lb-status")!;
    this.readyBtn = el.querySelector("#lb-ready")!;
    this.addBtn = el.querySelector("#lb-add")!;
    this.easyBtn = el.querySelector("#lb-easy")!;
    this.removeBtn = el.querySelector("#lb-remove")!;
    this.hiderBtn = el.querySelector("#lb-hider")!;
    this.hunterBtn = el.querySelector("#lb-hunter")!;
    this.autoBtn = el.querySelector("#lb-auto")!;
    this.autoBtn.onclick = () => this.actions.role("auto");
    this.hiderBtn.onclick = () => this.actions.role("hider");
    this.hunterBtn.onclick = () => this.actions.role("hunter");
    this.readyBtn.onclick = () => this.actions.ready(!this.myReady);
    this.addBtn.onclick = () => this.actions.addBot("normal");
    this.easyBtn.onclick = () => this.actions.addBot("easy");
    this.removeBtn.onclick = () => this.actions.removeBot();
    el.querySelector<HTMLAnchorElement>("#lb-out")!.onclick = (e) => {
      e.preventDefault();
      this.actions.logOut();
    };
  }

  /** Show or hide, and refresh. Cheap to call every frame: the page only changes when something did. */
  update(visible: boolean, players: LobbyPlayer[], countdown: number) {
    this.el.style.display = visible ? "flex" : "none";
    if (!visible) return;
    const me = players.find((p) => p.me);
    this.myReady = !!me?.ready;
    const key = JSON.stringify([players, countdown]);
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.list.innerHTML = "";
    players.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = `ph-row${p.ready ? " ph-ready" : ""}${p.me ? " ph-me" : ""}`;
      const av = document.createElement("span");
      av.className = "ph-avatar";
      av.style.background = COLORS[i % COLORS.length]!;
      if (p.bot) av.innerHTML = icon("robot", 20);
      else av.textContent = (p.name.trim()[0] ?? "?").toUpperCase();
      const name = document.createElement("span");
      name.className = "ph-name";
      name.textContent = p.name;
      if (p.me) {
        const you = document.createElement("small");
        you.textContent = "you";
        name.appendChild(you);
      }
      const score = document.createElement("span");
      score.className = "ph-pts";
      score.textContent = p.score ? `${p.score} pts` : "";
      const roleTag = document.createElement("span");
      roleTag.className = `ph-role${p.wantHunter ? " ph-hunter" : ""}`;
      roleTag.innerHTML = p.wantHunter ? `${icon("search", 14)} Hunter` : p.wantHider ? `${icon("ghost", 14)} Hider` : `${icon("shuffle", 14)} Auto`;
      const badge = document.createElement("span");
      badge.className = "ph-badge";
      badge.innerHTML = p.ready ? `${icon("check", 14)} Ready` : "Not ready";
      row.append(av, name, score, roleTag, badge);
      this.list.appendChild(row);
    });
    for (let i = players.length; i < MAX_PLAYERS; i++) {
      const row = document.createElement("div");
      row.className = "ph-empty";
      row.textContent = "Waiting for a player…";
      this.list.appendChild(row);
    }
    (this.el.querySelector("#lb-count") as HTMLElement).innerHTML = `${icon("user", 15)} ${players.length}/${MAX_PLAYERS}`;

    const everyoneReady = players.length >= MIN_PLAYERS && players.every((p) => p.ready);
    if (players.length < MIN_PLAYERS) this.status.textContent = "Need at least 2 players. Invite a friend or add a CPU.";
    else if (everyoneReady) this.status.innerHTML = `Starting in <b>${countdown}</b>`;
    else this.status.textContent = `Waiting for ${players.filter((p) => !p.ready).map((p) => p.name).join(", ")}`;

    const takenBy = players.find((p) => !p.bot && p.wantHunter && !p.me);
    this.hunterBtn.classList.toggle("ph-on", !!me?.wantHunter);
    this.hiderBtn.classList.toggle("ph-on", !!me?.wantHider);
    this.autoBtn.classList.toggle("ph-on", !me?.wantHunter && !me?.wantHider);
    this.hunterBtn.disabled = !!takenBy;
    (this.el.querySelector("#lb-roletip") as HTMLElement).textContent = takenBy
      ? `${takenBy.name} is the hunter this round.`
      : "Auto: the hunter changes every round. One hunter, everyone else hides.";
    this.readyBtn.innerHTML = this.myReady ? "Not ready" : `${icon("check", 22)} Ready`;
    this.readyBtn.classList.toggle("ph-off", this.myReady);
    const hasBot = players.some((p) => p.bot);
    const full = players.length >= MAX_PLAYERS;
    this.addBtn.style.display = this.easyBtn.style.display = full ? "none" : "";
    this.removeBtn.style.display = hasBot ? "" : "none";
  }
}
