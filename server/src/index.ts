import { defineServer } from "colyseus";
import { SERVER_PORT } from "@prop-hunt/shared";
import { rooms } from "./app.ts";

const server = defineServer({ rooms });

const port = Number(process.env.PORT) || SERVER_PORT;
await server.listen(port);
console.log(`Prop Hunt server listening on ws://localhost:${port}`);
