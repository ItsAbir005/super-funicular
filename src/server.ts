import http from "http";
import { randomUUID } from "crypto";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { AppError, NotFoundError } from "./errors/AppError";
import { redis } from "./redis";
import { cleanupDeadDrivers } from "./redis/cleanup";

const config = loadConfig();
const { PORT } = config;

const server = http.createServer(async (req, res) => {
  const requestId = randomUUID();
  const startTime = Date.now();
  res.setHeader("x-request-id", requestId);
  try {
    logger.info(
      { requestId, method: req.method, url: req.url },
      "request received"
    );
    if (req.method === "GET" && req.url === "/health") {
      try {
        await redis.ping();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            redis: "up",
          })
        );
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "degraded",
            redis: "down",
          })
        );
      }
      return;
    }
    throw new NotFoundError("Route not found");
  } catch (err) {
    handleError(err, req, res, requestId, startTime);
  }
});
function handleError(
  err: unknown,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  requestId: string,
  startTime: number
) {
  let error: AppError;
  if (err instanceof AppError) {
    error = err;
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
  res.writeHead(error.statusCode, {
    "Content-Type": "application/json",
  });
  res.end(
    JSON.stringify({
      error: error.message,
      requestId,
    })
  );
setInterval(() => {
    cleanupDeadDrivers().catch(() => { });
  }, 10_000);
}
async function start() {
  try {
    await redis.connect();
    server.listen(PORT, () => {
      logger.info({ port: PORT }, "orbit server started");
    });
  } catch (err) {
    logger.error({ err }, "failed to start orbit");
    process.exit(1);
  }
}
start();

