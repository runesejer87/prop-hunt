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

export default await server.serverless();
