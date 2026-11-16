import { defineServer } from "colyseus";
import { SERVER_PORT } from "@prop-hunt/shared";
import { rooms } from "./rooms.ts";

const server = defineServer({ rooms });

const port = Number(process.env.PORT) || SERVER_PORT;
await server.listen(port);
console.log(`Password protection: ${process.env.GAME_PASSWORD ? "ON" : "OFF (anyone can join)"}`);
console.log(`Prop Hunt server listening on ws://localhost:${port}`);
