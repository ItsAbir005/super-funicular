import WebSocket from "ws";
import { subscribe, unsubscribe, publish } from "./registry";
import { logger } from "../logger";
function cellId(lat: number, lng: number) {
  return `${Math.floor(lat * 100)}:${Math.floor(lng * 100)}`;
}
export function handleMessage(socket: WebSocket, raw: string) {
  try {
    const msg = JSON.parse(raw);
    if (msg.type === "SUBSCRIBE") {
      const cell = cellId(msg.lat, msg.lng);
      subscribe(socket, cell);
    }
    if (msg.type === "DRIVER_LOCATION") {
      const cell = cellId(msg.lat, msg.lng);

      publish(cell, {
        driverId: msg.driverId,
        lat: msg.lat,
        lng: msg.lng,
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to handle WebSocket message");
  }
}
export function cleanupSocket(socket: WebSocket) {
  unsubscribe(socket);
}

