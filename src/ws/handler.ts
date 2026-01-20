import { subscribe, unsubscribe, publish } from "./registry";
function cellId(lat: number, lng: number) {
  return `${Math.floor(lat * 100)}:${Math.floor(lng * 100)}`;
}
export function handleMessage(socket:any, raw: string) {
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
}
export function cleanupSocket(socket:any) {
  unsubscribe(socket);
}

