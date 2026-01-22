import WebSocket from "ws";
import { logger } from "../logger";
interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
  clientId?: string;
  subscribedCells?: Set<string>;
}

const HEARTBEAT_INTERVAL = 30_000;
const CLIENT_TIMEOUT = 60_000;

let heartbeatTimer: NodeJS.Timeout | null = null;

export function initializeHeartbeat(wss: WebSocket.Server): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  heartbeatTimer = setInterval(() => {
    let activeConnections = 0;
    let deadConnections = 0;

    wss.clients.forEach((ws) => {
      const socket = ws as ExtendedWebSocket;

      if (socket.isAlive === false) {
        logger.info(
          { clientId: socket.clientId },
          "Terminating dead connection"
        );
        deadConnections++;
        return socket.terminate();
      }

      socket.isAlive = false;
      socket.ping();
      activeConnections++;
    });

    logger.debug(
      { active: activeConnections, terminated: deadConnections },
      "Heartbeat check completed"
    );
  }, HEARTBEAT_INTERVAL);

  logger.info({ interval: HEARTBEAT_INTERVAL }, "Heartbeat monitoring started");
}

export function setupHeartbeat(socket: ExtendedWebSocket): void {
  socket.isAlive = true;

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("ping", () => {
    socket.pong();
  });
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    logger.info("Heartbeat monitoring stopped");
  }
}

export function getConnectionStats(wss: WebSocket.Server): {
  total: number;
  alive: number;
  dead: number;
} {
  let alive = 0;
  let dead = 0;

  wss.clients.forEach((ws) => {
    const socket = ws as ExtendedWebSocket;
    if (socket.isAlive === false || socket.readyState !== WebSocket.OPEN) {
      dead++;
    } else {
      alive++;
    }
  });

  return {
    total: wss.clients.size,
    alive,
    dead,
  };
}