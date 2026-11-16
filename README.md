# Prop Hunt

A 2D top-down multiplayer prop hunt game for the browser (2–4 players).
One hunter searches the rooms; the others hide by disguising as objects.

## Stack
- **TypeScript** everywhere
- **Phaser** – 2D game engine (WebGL) in `client/`
- **Colyseus** – multiplayer server (authoritative, rooms, state sync) in `server/`
- **Vite** – client dev server and build
- `shared/` – constants and synced state used by both sides

## Run it
```
npm install
npm run dev
```
Open http://localhost:5173 in two browser tabs. Move with WASD or arrow keys.
The server runs on port 2567.

## Other commands
- `npm run typecheck` – check all packages
- `npm run build` – build the client for production

## How a round works
- Needs 2–4 players. A round starts a few seconds after the second player joins.
- One random player is the **hunter**; the rest are **props**.
- Hide phase (15 s): props hide; the hunter is blind and frozen.
- Hunt phase (3 min): the hunter sees only a small circle, and only what is in line of sight:
  walls and big furniture (beds, sofas, cars...) block the view. Props see the hunter's view as a red glow.
- Anti-cheat: the server only sends the hunter the props they can currently see (in range and in line of sight). Hidden props' positions never reach the hunter's browser. Click or Space swings at the mouse.
  Hitting a hiding player finds them; hitting anything else costs 10 health (starts at 100).
- Props win if the timer runs out or the hunter runs out of health. The hunter wins by finding everyone.
- Props: **E** to become a nearby small object, **Q** to change back. Found props become ghosts.
- A disguised prop that moves **wobbles** (a tell). Hold still for 1 second and it settles into a perfect copy.
- Tuning numbers (timers, health, range) are at the top of `shared/src/index.ts`.

## Status
Playable first version. Next ideas: sounds, real art, a trial with friends to tune the numbers.

## Hosting (Vercel)
Two Vercel projects from this repo:
- `prop-hunt-server` – root directory `server` (Colyseus as a Vercel Function)
- `prop-hunt` – root directory `client`, with env var `VITE_SERVER_URL` set to the server URL
