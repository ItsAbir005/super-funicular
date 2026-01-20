import WebSocket from "ws";
const cellSubscriptions = new Map<string, Set<WebSocket>>();
export function subscribe(socket: WebSocket, cellId: string) {
  if (!cellSubscriptions.has(cellId)) {
    cellSubscriptions.set(cellId, new Set());
  }
  cellSubscriptions.get(cellId)!.add(socket);
}
export function unsubscribe(socket: WebSocket) {
  for (const sockets of cellSubscriptions.values()) {
    sockets.delete(socket);
  }
}
export function publish(cellId: string, payload: any) {
  const sockets = cellSubscriptions.get(cellId);
  if (!sockets) return;

  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }
}
