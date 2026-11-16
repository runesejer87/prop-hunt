# Prop Hunt

A 2D top-down multiplayer prop hunt game for the browser (2–4 players).
One hunter searches the rooms; the others hide by disguising as objects.

## Stack
- **TypeScript** everywhere
- **Phaser** – 2D game engine (WebGL) in `client/`
- **Colyseus** – multiplayer server (authoritative, rooms, state sync) in `server/`
- **Vite** – client dev server and build
- `shared/` – constants and synced state used by both sides

## Names, rounds and scores
Pick a name on the title screen. The game keeps going round after round and the hunter job rotates (whoever has hunted
least goes next). Points: the hunter gets 2 per prop found, plus 2 for finding everyone; props get 3 for surviving.
Hold **Tab** to see the scoreboard; it also shows at the end of each round.

## Phones and tablets
It works on phones and iPads: a joystick appears under your left thumb, and buttons on the right change with your role
(props: Become, Undo, Turn, Distract; hunter: Swing, hold Inspect, Radar). Several fingers work at once. Landscape is best.
On iPhone/iPad, "Add to Home Screen" opens it full screen like an app.

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
- **Inspect** (hunter, hold **E**): check the object under the mouse in 2 seconds, with no health cost. Ordinary objects get a tick;
  a hiding player is found. The player is warned and can slip away, which gives them away.
- **The hunt tightens**: after 60 s and 120 s the hunter gets a rough circle for every prop every 20 s, then 10 s, and the radar recharges faster.
- **Dust clue**: when a prop disguises or undisguises within about 12 tiles of the hunter, a small puff with a "?" shows nearby.
- Abilities (**F**): props can **Distract** (a fake yellow ping somewhere else, 15 s cooldown); the hunter has **Radar**
  (a blue sweep that pings every prop within about 10 tiles, even still ones, 25 s cooldown, ready 8 s into the hunt).
- Props: **E** to become a nearby small object (it copies which way that object faces), **R** to turn it, **Q** to change back. Found props become ghosts.
- A disguised prop that moves **wobbles** (a tell). Hold still for 1 second and it settles into a perfect copy.
- Tuning numbers (timers, health, range) are at the top of `shared/src/index.ts`.

## Maps
There are three maps and the server picks a different one each round: **The House** (9 rooms around a hallway),
**The Office** (corridor, offices, boardroom, open plan, break room, server room) and **The Diner** (dining hall, bar,
pool lounge, kitchen, cold storage, restrooms, back office). Each map is plain data in `shared/src/maps/`, furnished by hand:
every room has a job, furniture sits against walls or around a focus (sofa faces the TV, chairs face the table), everyday
small things (chairs, plants, lamps, crates) appear in several rooms so hiders have lookalikes, and themed things (toilet,
server rack, pool table) belong to one room so they look odd anywhere else.

To add a map: copy a file in `shared/src/maps/`, edit it, add it to `MAP_DEFS` in `shared/src/gamemap.ts`.
It is checked by hand-checking that nothing overlaps, doorways stay clear and every part of every room is reachable.

## Art and sound
Everything is made in code, so there are no image or sound files to manage:
- `client/src/art.ts` paints floors, walls, rugs, furniture, shadows and the little characters once at start-up.
  To use real artwork later, load images under the same texture keys (`prop_<id>`, `char_0..3`, `char_hunter`).
- Lighting and effects: glowing lamps, TVs and monitors, a vignette, walking animations, dust and spark bursts, a pop when you become an object, and a time bar.
- `client/src/Sound.ts` makes every sound effect with the browser's Web Audio.
  Press **M** to mute. Footsteps get quieter and pan left/right with distance, and a disguised prop that moves makes a scraping noise.

## Status
Playable first version. Next ideas: a trial with friends to tune the numbers, real artwork and recorded sounds if wanted, a name entry and title screen.

## Hosting (Vercel)
Two Vercel projects from this repo:
- `prop-hunt-server` – root directory `server` (Colyseus as a Vercel Function)
- `prop-hunt` – root directory `client`, with env var `VITE_SERVER_URL` set to the server URL
