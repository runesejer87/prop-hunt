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

## Status
Base only: players join a room and move around an empty map.
Next: rooms/map, props to disguise as, hunter role + vision circle, round timer.
