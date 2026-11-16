import { defineRoom } from "colyseus";
import { ROOM_NAME } from "@prop-hunt/shared";
import { PropHuntRoom } from "./PropHuntRoom.ts";

/** Rooms the game server offers. Shared by the local and Vercel entry points. */
export const rooms = {
  [ROOM_NAME]: defineRoom(PropHuntRoom),
};
