import WebSocket from "ws";
import { subscribe, unsubscribe, publish } from "./registry";
import { logger } from "../logger";
import { setupHeartbeat } from "./heartbeat";
import { randomUUID } from "crypto";

interface ExtendedWebSocket extends WebSocket {
  clientId?: string;
  isAlive?: boolean;
  subscribedCells?: Set<string>;
}

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

function cellId(lat: number, lng: number): string {
  return `${Math.floor(lat * 100)}:${Math.floor(lng * 100)}`;
}

function validateCoordinates(lat: number, lng: number): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !isNaN(lat) &&
    !isNaN(lng)
  );
}

function sendError(socket: WebSocket, error: string, code = "ERROR"): void {
  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(
        JSON.stringify({
          type: "ERROR",
          code,
          message: error,
        })
      );
    } catch (err) {
      logger.error({ err }, "Failed to send error message");
    }
  }
}

function sendSuccess(socket: WebSocket, type: string, data: any = {}): void {
  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(
        JSON.stringify({
          type,
          ...data,
        })
      );
    } catch (err) {
      logger.error({ err, type }, "Failed to send success message");
    }
  }
}

export function handleConnection(socket: ExtendedWebSocket): void {
  socket.clientId = randomUUID();
  socket.subscribedCells = new Set();

  setupHeartbeat(socket);

  logger.info({ clientId: socket.clientId }, "WebSocket client connected");

  sendSuccess(socket, "CONNECTED", {
    clientId: socket.clientId,
    timestamp: Date.now(),
  });
}

export function handleMessage(socket: ExtendedWebSocket, raw: string): void {
  const clientId = socket.clientId || "unknown";

  try {
    let msg: WebSocketMessage;

    try {
      msg = JSON.parse(raw);
    } catch (parseErr) {
      logger.warn({ clientId, raw }, "Invalid JSON received");
      sendError(socket, "Invalid JSON format", "PARSE_ERROR");
      return;
    }

    if (!msg.type) {
      logger.warn({ clientId, msg }, "Message missing type field");
      sendError(socket, "Message must have a 'type' field", "INVALID_MESSAGE");
      return;
    }

    logger.debug({ clientId, type: msg.type }, "Processing WebSocket message");

    switch (msg.type) {
      case "PING":
        handlePing(socket);
        break;

      case "SUBSCRIBE":
        handleSubscribe(socket, msg);
        break;

      case "UNSUBSCRIBE":
        handleUnsubscribe(socket, msg);
        break;

      case "DRIVER_LOCATION":
        handleDriverLocation(socket, msg);
        break;

      default:
        logger.warn({ clientId, type: msg.type }, "Unknown message type");
        sendError(socket, `Unknown message type: ${msg.type}`, "UNKNOWN_TYPE");
    }
  } catch (err) {
    logger.error({ err, clientId }, "Failed to handle WebSocket message");
    sendError(socket, "Internal server error", "INTERNAL_ERROR");
  }
}

function handlePing(socket: ExtendedWebSocket): void {
  sendSuccess(socket, "PONG", { timestamp: Date.now() });
}

function handleSubscribe(socket: ExtendedWebSocket, msg: any): void {
  const { lat, lng } = msg;

  if (!validateCoordinates(lat, lng)) {
    sendError(socket, "Invalid coordinates", "INVALID_COORDS");
    return;
  }

  const cell = cellId(lat, lng);
  subscribe(socket, cell);
  socket.subscribedCells?.add(cell);

  logger.info({ clientId: socket.clientId, cell }, "Client subscribed to cell");
  
  sendSuccess(socket, "SUBSCRIBED", { cell, lat, lng });
}

function handleUnsubscribe(socket: ExtendedWebSocket, msg: any): void {
  const { lat, lng } = msg;

  if (lat !== undefined && lng !== undefined) {
    if (!validateCoordinates(lat, lng)) {
      sendError(socket, "Invalid coordinates", "INVALID_COORDS");
      return;
    }

    const cell = cellId(lat, lng);
    socket.subscribedCells?.delete(cell);
    
    sendSuccess(socket, "UNSUBSCRIBED", { cell });
  } else {
    unsubscribe(socket);
    socket.subscribedCells?.clear();
    
    sendSuccess(socket, "UNSUBSCRIBED_ALL");
  }
}

function handleDriverLocation(socket: ExtendedWebSocket, msg: any): void {
  const { driverId, lat, lng } = msg;

  if (!driverId) {
    sendError(socket, "Missing driverId", "MISSING_DRIVER_ID");
    return;
  }

  if (!validateCoordinates(lat, lng)) {
    sendError(socket, "Invalid coordinates", "INVALID_COORDS");
    return;
  }

  const cell = cellId(lat, lng);

  publish(cell, {
    type: "DRIVER_UPDATE",
    driverId,
    lat,
    lng,
    timestamp: Date.now(),
  });

  logger.debug(
    { clientId: socket.clientId, driverId, cell },
    "Driver location published"
  );
}

export function cleanupSocket(socket: ExtendedWebSocket): void {
  const clientId = socket.clientId || "unknown";

  logger.info({ clientId }, "WebSocket client disconnected");

  unsubscribe(socket);
  socket.subscribedCells?.clear();
}