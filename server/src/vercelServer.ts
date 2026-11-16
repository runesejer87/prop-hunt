// Entry point when running as a Vercel Function (no listen(), export the HTTP server).
import { createServer } from "node:http";
import { defineServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { rooms } from "./rooms.ts";

const httpServer = createServer();
const server = defineServer({
  transport: new WebSocketTransport({ server: httpServer }),
  rooms,
});

// Say whether the join password is set (never the password itself).
console.log(`Password protection: ${process.env.GAME_PASSWORD ? "ON" : "OFF (anyone can join)"}`);

export default await server.serverless();
