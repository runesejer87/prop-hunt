import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, SERVER_PORT, MAX_NAME_LENGTH, GameState } from "@prop-hunt/shared";
import { isTouchDevice } from "./Touch.ts";

const PASSWORD_KEY = "prop-hunt-password";
const NAME_KEY = "prop-hunt-name";

function serverUrl(): string {
  // Hosted builds set VITE_SERVER_URL; local dev uses the server on port 2567.
  return import.meta.env.VITE_SERVER_URL || `ws://${location.hostname}:${SERVER_PORT}`;
}

function tryJoin(name: string, password: string): Promise<Room<any, GameState>> {
  return new Client(serverUrl()).joinOrCreate<GameState>(ROOM_NAME, { name, password }, GameState);
}

const isWrongPassword = (e: unknown) => /password/i.test(String((e as Error)?.message ?? e)) || (e as { code?: number })?.code === 401;

function load(store: "local" | "session", key: string): string {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key) ?? "";
  } catch {
    return ""; // storage can be blocked; that's fine
  }
}

function save(store: "local" | "session", key: string, value: string) {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** The title screen: pick a name, enter the password if there is one. Resolves with the room once in. */
function titleScreen(firstMessage: string, needPassword: boolean): Promise<Room<any, GameState>> {
  return new Promise((resolve) => {
    const gate = document.createElement("div");
    gate.id = "gate";
    gate.className = "ph-screen";
    const keys = isTouchDevice()
      ? ["Left thumb: move", "Right buttons: act", "Hold still to blend in"]
      : ["WASD move", "E become object", "Q change back", "R turn", "Hold still to blend in"];
    gate.innerHTML = `
      <form class="ph-gate">
        <img class="ph-logo" src="/icon.svg" alt="" />
        <h1 class="ph-title">PROP HUNT</h1>
        <div class="ph-tag">Hide as an object. Don't get found.</div>
        <div class="ph-card">
          <div id="gate-msg" class="ph-msg"></div>
          <input id="gate-name" class="ph-input" maxlength="${MAX_NAME_LENGTH}" autocomplete="nickname" placeholder="Your name" />
          <input id="gate-pw" class="ph-input" type="password" autocomplete="current-password" placeholder="Password" style="display:${needPassword ? "block" : "none"}" />
          <button id="gate-go" class="ph-btn" type="submit">Play</button>
        </div>
        <div class="ph-help">2–4 players</div>
        <div class="ph-keys">${keys.map((k) => `<span class="ph-key">${k}</span>`).join("")}</div>
      </form>`;
    document.body.appendChild(gate);
    const form = gate.querySelector("form")!;
    const nameInput = gate.querySelector<HTMLInputElement>("#gate-name")!;
    const pwInput = gate.querySelector<HTMLInputElement>("#gate-pw")!;
    const msg = gate.querySelector<HTMLDivElement>("#gate-msg")!;
    const button = gate.querySelector<HTMLButtonElement>("#gate-go")!;
    msg.textContent = firstMessage;
    nameInput.value = load("local", NAME_KEY);
    (nameInput.value ? pwInput : nameInput).focus();

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      button.disabled = true;
      msg.style.color = "";
      msg.textContent = "Joining…";
      try {
        const name = nameInput.value.trim();
        const room = await tryJoin(name, pwInput.value);
        save("local", NAME_KEY, name);
        save("local", PASSWORD_KEY, pwInput.value);
        gate.remove();
        resolve(room);
      } catch (e) {
        const wrong = isWrongPassword(e);
        pwInput.style.display = wrong || needPassword ? "block" : pwInput.style.display;
        msg.style.color = "#ff8a8a";
        msg.textContent = wrong ? "Wrong password" : "Could not reach the game server. Try again in a moment.";
        button.disabled = false;
        (wrong ? pwInput : nameInput).select();
      }
    });
  });
}

/** Join the game: straight in if we know the name (and password, if needed), otherwise show the title screen. */
export async function joinGame(): Promise<Room<any, GameState>> {
  const name = load("local", NAME_KEY);
  if (name) {
    try {
      return await tryJoin(name, load("local", PASSWORD_KEY));
    } catch (e) {
      return titleScreen(isWrongPassword(e) ? "This game is private. Enter the password." : "Could not reach the game server.", isWrongPassword(e));
    }
  }
  return titleScreen("", false);
}

/** Forget the saved name and password and go back to the title screen. */
export function logOut() {
  try {
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(PASSWORD_KEY);
    sessionStorage.removeItem(PASSWORD_KEY);
  } catch {
    /* ignore */
  }
  location.reload();
}
