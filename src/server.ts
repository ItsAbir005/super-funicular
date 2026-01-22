import http from "http";
import { randomUUID } from "crypto";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { AppError, NotFoundError } from "./errors/AppError";
import { redis } from "./redis";
import { cleanupDeadDrivers } from "./redis/cleanup";
import WebSocket, { WebSocketServer } from "ws";
import { handleMessage, cleanupSocket, handleConnection } from "./ws/handler";
import { initializeHeartbeat, stopHeartbeat, getConnectionStats } from "./ws/heartbeat";
import { redisCircuitBreaker, matchingCircuitBreaker } from "./resilience/circuitBreaker";
import { matchDriver, releaseDriver } from "./matching/matchDriver";

const config = loadConfig();
const { PORT } = config;

export const wss = new WebSocketServer({
  port: 8081,
  perMessageDeflate: false,
  clientTracking: true,
});

wss.on("connection", (socket) => {
  handleConnection(socket as any);

  socket.on("message", (msg) => {
    handleMessage(socket as any, msg.toString());
  });

  socket.on("close", () => {
    cleanupSocket(socket as any);
  });

  socket.on("error", (err) => {
    logger.error({ err }, "WebSocket error");
  });
});

initializeHeartbeat(wss);

const server = http.createServer(async (req, res) => {
  const requestId = randomUUID();
  const startTime = Date.now();

  res.setHeader("x-request-id", requestId);
  res.setHeader("content-type", "application/json");

  try {
    logger.info(
      { requestId, method: req.method, url: req.url },
      "request received"
    );

    if (req.method === "GET" && req.url === "/health") {
      await handleHealthCheck(res);
      return;
    }

    if (req.method === "GET" && req.url === "/metrics") {
      await handleMetrics(res);
      return;
    }

    if (req.method === "POST" && req.url === "/match") {
      await handleMatchRequest(req, res, requestId);
      return;
    }

    if (req.method === "POST" && req.url?.startsWith("/release/")) {
      const driverId = req.url.split("/")[2];
      await handleReleaseDriver(res, driverId);
      return;
    }

    throw new NotFoundError("Route not found");
  } catch (err) {
    handleError(err, req, res, requestId, startTime);
  } finally {
    const duration = Date.now() - startTime;
    logger.info(
      { requestId, duration, status: res.statusCode },
      "request completed"
    );
  }
});

async function handleHealthCheck(res: http.ServerResponse): Promise<void> {
  try {
    await redis.ping();
    
    const wsStats = getConnectionStats(wss);
    
    res.writeHead(200);
    res.end(
      JSON.stringify({
        status: "ok",
        redis: "up",
        websocket: {
          connections: wsStats.total,
          alive: wsStats.alive,
        },
        circuit: {
          redis: redisCircuitBreaker.getStats(),
          matching: matchingCircuitBreaker.getStats(),
        },
      })
    );
  } catch (err) {
    logger.error({ err }, "Health check failed");
    res.writeHead(503);
    res.end(
      JSON.stringify({
        status: "degraded",
        redis: "down",
        error: err instanceof Error ? err.message : "Unknown error",
      })
    );
  }
}

async function handleMetrics(res: http.ServerResponse): Promise<void> {
  const wsStats = getConnectionStats(wss);
  const redisStats = redisCircuitBreaker.getStats();
  const matchingStats = matchingCircuitBreaker.getStats();

  res.writeHead(200);
  res.end(
    JSON.stringify({
      timestamp: Date.now(),
      websocket: wsStats,
      circuit_breakers: {
        redis: redisStats,
        matching: matchingStats,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    })
  );
}

async function handleMatchRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  requestId: string
): Promise<void> {
  const chunks: Buffer[] = [];

  req.on("data", (chunk) => chunks.push(chunk));

  await new Promise<void>((resolve, reject) => {
    req.on("end", async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { lat, lng, idempotencyKey } = body;

        if (
          typeof lat !== "number" ||
          typeof lng !== "number" ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid coordinates" }));
          return resolve();
        }

        const result = await matchDriver(lat, lng, idempotencyKey || requestId);

        res.writeHead(200);
        res.end(JSON.stringify(result));
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
  });
}

async function handleReleaseDriver(
  res: http.ServerResponse,
  driverId: string
): Promise<void> {
  if (!driverId) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "Missing driverId" }));
    return;
  }

  await releaseDriver(driverId);

  res.writeHead(200);
  res.end(JSON.stringify({ success: true, driverId }));
}

function handleError(
  err: unknown,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  requestId: string,
  startTime: number
): void {
  let error: AppError;

  if (err instanceof AppError) {
    error = err;
  } else if (err instanceof Error) {
    error = new AppError(err.message, 500, false);
  } else {
    error = new AppError("Internal server error", 500, false);
  }

  logger.error(
    {
      requestId,
      err,
      durationMs: Date.now() - startTime,
    },
    "request failed"
  );

  res.writeHead(error.statusCode);
  res.end(
    JSON.stringify({
      error: error.message,
      requestId,
    })
  );
}

let cleanupInterval: NodeJS.Timeout | null = null;

async function start(): Promise<void> {
  try {
    await redis.connect();

    cleanupInterval = setInterval(() => {
      cleanupDeadDrivers().catch((err) => {
        logger.error({ err }, "Cleanup failed");
      });
    }, 10_000);

    server.listen(PORT, () => {
      logger.info(
        { 
          port: PORT,
          wsPort: 8081,
          env: process.env.NODE_ENV,
        },
        "orbit server started"
      );
    });

    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
  } catch (err) {
    logger.error({ err }, "failed to start orbit");
    process.exit(1);
  }
}

async function gracefulShutdown(): Promise<void> {
  logger.info("Initiating graceful shutdown");

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  stopHeartbeat();

  server.close(() => {
    logger.info("HTTP server closed");
  });

  wss.close(() => {
    logger.info("WebSocket server closed");
  });

  try {
    await redis.quit();
    logger.info("Redis connection closed");
  } catch (err) {
    logger.error({ err }, "Error closing Redis");
  }

  logger.info("Shutdown complete");
  process.exit(0);
}

start();