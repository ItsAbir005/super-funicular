import http from "http";
import { randomUUID } from "crypto";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { AppError, NotFoundError } from "./errors/AppError";

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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    throw new NotFoundError("Route not found");
  } catch (err) {
    handleError(err, req, res, requestId, startTime);
  }
});

server.listen(PORT, () => {
  logger.info({ port: PORT }, "orbit server started");
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
}
