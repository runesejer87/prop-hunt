# Prop Hunt

A 2D top-down multiplayer prop hunt game for the browser (2–4 players).
One hunter searches the rooms; the others hide by disguising as objects.

## Stack
- **TypeScript** everywhere
- **Phaser** – 2D game engine (WebGL) in `client/`
- **Colyseus** – multiplayer server (authoritative, rooms, state sync) in `server/`
- **Vite** – client dev server and build
- `shared/` – constants and synced state used by both sides

## Password
Set the `GAME_PASSWORD` environment variable on the **server** and players must enter it on a join screen
(it is remembered for the browser tab). If it is not set, anyone can join (handy for local development).
- Local: `GAME_PASSWORD=yourpassword npm run dev`
- Vercel: project `prop-hunt-server` > Settings > Environment Variables, then redeploy.

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
- Running does not work: the hunter is faster than props, a disguised prop that moves only shuffles slowly, and a prop that keeps
  moving shows up as a yellow ping near its position for the hunter every few seconds. Hiding (and holding still) is the way to win.
- Props: **E** to become a nearby small object (it copies which way that object faces), **R** to turn it, **Q** to change back. Found props become ghosts.
- A disguised prop that moves **wobbles** (a tell). Hold still for 1 second and it settles into a perfect copy.
- Tuning numbers (timers, health, range) are at the top of `shared/src/index.ts`.

## Rooms
Each room has a job and is furnished by hand in `shared/src/props.ts` (kitchen, living room, bedroom, bathroom, hallway,
study, garage, library, storage). Everyday small things (chairs, plants, lamps, crates) appear in several rooms so
hiders have lookalikes; themed things (toilet, tire, globe) belong to one room, so they look odd anywhere else.

## Art and sound
Everything is made in code, so there are no image or sound files to manage:
- `client/src/art.ts` paints floors, walls, rugs, furniture, shadows and the little characters once at start-up.
  To use real artwork later, load images under the same texture keys (`prop_<id>`, `char_0..3`, `char_hunter`).
- `client/src/Sound.ts` makes every sound effect with the browser's Web Audio.
  Press **M** to mute. Footsteps get quieter and pan left/right with distance, and a disguised prop that moves makes a scraping noise.

## Status
Playable first version. Next ideas: a trial with friends to tune the numbers, real artwork and recorded sounds if wanted, a name entry and title screen.

## Hosting (Vercel)
Two Vercel projects from this repo:
- `prop-hunt-server` – root directory `server` (Colyseus as a Vercel Function)
- `prop-hunt` – root directory `client`, with env var `VITE_SERVER_URL` set to the server URL
