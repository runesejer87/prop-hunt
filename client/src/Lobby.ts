import { MAX_PLAYERS, MIN_PLAYERS } from "@prop-hunt/shared";

export interface LobbyPlayer {
  name: string;
  ready: boolean;
  bot: boolean;
  me: boolean;
  score: number;
}

export interface LobbyActions {
  ready(on: boolean): void;
  addBot(level: "normal" | "easy"): void;
  removeBot(): void;
  logOut(): void;
}

const COLORS = ["#4ade80", "#60a5fa", "#f59e0b", "#f472b6"];

/** The lobby screen: who is here, who is ready, and a Ready button. A plain HTML card over the game. */
export class Lobby {
  private el: HTMLDivElement;
  private list: HTMLDivElement;
  private status: HTMLDivElement;
  private readyBtn: HTMLButtonElement;
  private addBtn: HTMLButtonElement;
  private easyBtn: HTMLButtonElement;
  private removeBtn: HTMLButtonElement;
  private lastKey = "";
  private myReady = false;

  constructor(private actions: LobbyActions) {
    const el = document.createElement("div");
    el.id = "lobby";
    el.style.cssText =
      "position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:5;font-family:sans-serif;color:#fff;" +
      "background:rgba(10,12,16,.55);padding:12px;box-sizing:border-box;overflow:auto;touch-action:auto;";
    const btn = "padding:11px 14px;font-size:15px;font-weight:700;border-radius:10px;border:0;cursor:pointer;";
    el.innerHTML = `
      <div style="width:min(420px,94vw);background:#181b22;border:1px solid #2f3440;border-radius:16px;padding:18px;box-shadow:0 10px 40px #000a;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-size:26px;font-weight:800">Lobby</div>
          <div id="lb-count" style="color:#8b92a0;font-size:14px"></div>
        </div>
        <div id="lb-list" style="display:flex;flex-direction:column;gap:8px"></div>
        <div id="lb-status" style="min-height:20px;text-align:center;color:#c0c4cc;font-size:14px"></div>
        <button id="lb-ready" style="${btn}font-size:18px;padding:14px;background:#4ade80;color:#10261a">Ready</button>
        <div style="display:flex;gap:8px">
          <button id="lb-add" style="${btn}flex:1;background:#2a2f3c;color:#e5e7eb">+ CPU player</button>
          <button id="lb-easy" style="${btn}flex:1;background:#2a2f3c;color:#e5e7eb">+ Easy CPU</button>
          <button id="lb-remove" style="${btn}background:#3a2a2a;color:#fca5a5">− CPU</button>
        </div>
        <div style="display:flex;justify-content:space-between;color:#7d8492;font-size:12px">
          <span>Share the link with friends (2–4 players)</span>
          <a id="lb-out" href="#" style="color:#7d8492">Log out</a>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.list = el.querySelector("#lb-list")!;
    this.status = el.querySelector("#lb-status")!;
    this.readyBtn = el.querySelector("#lb-ready")!;
    this.addBtn = el.querySelector("#lb-add")!;
    this.easyBtn = el.querySelector("#lb-easy")!;
    this.removeBtn = el.querySelector("#lb-remove")!;
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
      row.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:#20242d";
      const dot = document.createElement("span");
      dot.style.cssText = `width:14px;height:14px;border-radius:50%;background:${COLORS[i % COLORS.length]};flex:none`;
      const name = document.createElement("span");
      name.style.cssText = "flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      name.textContent = p.name + (p.me ? " (you)" : "");
      const score = document.createElement("span");
      score.style.cssText = "color:#8b92a0;font-size:13px";
      score.textContent = p.score ? `${p.score} pts` : "";
      const badge = document.createElement("span");
      badge.style.cssText = `font-size:13px;font-weight:700;padding:3px 9px;border-radius:99px;${p.ready ? "background:#14532d;color:#86efac" : "background:#2f3440;color:#9aa1ae"}`;
      badge.textContent = p.ready ? "Ready" : "Not ready";
      row.append(dot, name, score, badge);
      this.list.appendChild(row);
    });
    for (let i = players.length; i < MAX_PLAYERS; i++) {
      const row = document.createElement("div");
      row.style.cssText = "padding:10px 12px;border-radius:10px;border:1px dashed #323846;color:#5d6472;font-size:14px";
      row.textContent = "Waiting for a player…";
      this.list.appendChild(row);
    }
    (this.el.querySelector("#lb-count") as HTMLElement).textContent = `${players.length}/${MAX_PLAYERS} players`;

    const everyoneReady = players.length >= MIN_PLAYERS && players.every((p) => p.ready);
    if (players.length < MIN_PLAYERS) this.status.textContent = "Need at least 2 players. Invite a friend or add a CPU.";
    else if (everyoneReady) this.status.textContent = `Starting in ${countdown}…`;
    else this.status.textContent = `Waiting for ${players.filter((p) => !p.ready).map((p) => p.name).join(", ")}`;

    this.readyBtn.textContent = this.myReady ? "Not ready" : "Ready";
    this.readyBtn.style.background = this.myReady ? "#2f3440" : "#4ade80";
    this.readyBtn.style.color = this.myReady ? "#e5e7eb" : "#10261a";
    const hasBot = players.some((p) => p.bot);
    const full = players.length >= MAX_PLAYERS;
    this.addBtn.style.display = this.easyBtn.style.display = full ? "none" : "";
    this.removeBtn.style.display = hasBot ? "" : "none";
  }
}
