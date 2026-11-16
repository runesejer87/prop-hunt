import { defineServer, defineRoom } from "colyseus";
import { ROOM_NAME, SERVER_PORT } from "@prop-hunt/shared";
import { PropHuntRoom } from "./PropHuntRoom.ts";

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(PropHuntRoom),
  },
});

const port = Number(process.env.PORT) || SERVER_PORT;
await server.listen(port);
console.log(`Prop Hunt server listening on ws://localhost:${port}`);
