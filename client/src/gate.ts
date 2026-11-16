import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, SERVER_PORT, GameState } from "@prop-hunt/shared";

const SAVED_KEY = "prop-hunt-password";

function serverUrl(): string {
  // Hosted builds set VITE_SERVER_URL; local dev uses the server on port 2567.
  return import.meta.env.VITE_SERVER_URL || `ws://${location.hostname}:${SERVER_PORT}`;
}

function tryJoin(password: string): Promise<Room<any, GameState>> {
  return new Client(serverUrl()).joinOrCreate<GameState>(ROOM_NAME, { password }, GameState);
}

const isWrongPassword = (e: unknown) => /password/i.test(String((e as Error)?.message ?? e)) || (e as { code?: number })?.code === 401;

function remember(password: string) {
  try {
    sessionStorage.setItem(SAVED_KEY, password);
  } catch {
    /* storage can be blocked; that's fine */
  }
}

function recall(): string {
  try {
    return sessionStorage.getItem(SAVED_KEY) ?? "";
  } catch {
    return "";
  }
}

/** A small "enter the password" screen. Resolves with the room once someone gets in. */
function askForPassword(firstMessage: string): Promise<Room<any, GameState>> {
  return new Promise((resolve) => {
    const gate = document.createElement("div");
    gate.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#14161b;font-family:sans-serif;color:#fff;z-index:10";
    gate.innerHTML = `
      <form style="display:flex;flex-direction:column;gap:12px;width:min(320px,86vw);text-align:center">
        <div style="font-size:30px;font-weight:700">Prop Hunt</div>
        <div id="gate-msg" style="min-height:20px;color:#c0c4cc;font-size:14px"></div>
        <input id="gate-pw" type="password" autocomplete="current-password" placeholder="Password" autofocus
          style="padding:12px;font-size:16px;border-radius:8px;border:1px solid #3a3f4a;background:#1d2027;color:#fff;outline:none" />
        <button id="gate-go" type="submit"
          style="padding:12px;font-size:16px;font-weight:600;border-radius:8px;border:0;background:#4ade80;color:#10261a;cursor:pointer">Join</button>
      </form>`;
    document.body.appendChild(gate);
    const form = gate.querySelector("form")!;
    const input = gate.querySelector<HTMLInputElement>("#gate-pw")!;
    const msg = gate.querySelector<HTMLDivElement>("#gate-msg")!;
    const button = gate.querySelector<HTMLButtonElement>("#gate-go")!;
    msg.textContent = firstMessage;
    input.focus();

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      button.disabled = true;
      msg.style.color = "#c0c4cc";
      msg.textContent = "Joining…";
      try {
        const room = await tryJoin(input.value);
        remember(input.value);
        gate.remove();
        resolve(room);
      } catch (e) {
        msg.style.color = "#ff8a8a";
        msg.textContent = isWrongPassword(e) ? "Wrong password" : "Could not reach the game server. Try again in a moment.";
        button.disabled = false;
        input.select();
      }
    });
  });
}

/** Join the game: silently if no password is needed (or it was saved), otherwise ask for it. */
export async function joinGame(): Promise<Room<any, GameState>> {
  try {
    return await tryJoin(recall());
  } catch (e) {
    return askForPassword(isWrongPassword(e) ? "This game is private. Enter the password." : "Could not reach the game server.");
  }
}
