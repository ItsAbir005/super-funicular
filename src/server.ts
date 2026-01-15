import http, { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import { loadConfig } from "./config/index";
import { logger } from "./logger";

const config = loadConfig();
const { PORT } = config;
const server = http.createServer(
  (req: IncomingMessage, res: ServerResponse) => {
    const requestId = randomUUID();
    const startTime = Date.now();
    res.setHeader("x-request-id", requestId);
    logger.info(
      {
        requestId,
        method: req.method,
        url: req.url,
      },
      "request received"
    );

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));

      logger.info(
        {
          requestId,
          durationMs: Date.now() - startTime,
        },
        "request completed"
      );
      return;
    }

    res.writeHead(404);
    res.end("Not Found");

    logger.warn(
      {
        requestId,
        durationMs: Date.now() - startTime,
      },
      "route not found"
    );
  }
);

server.listen(PORT, () => {
  logger.info({ port: PORT }, "orbit server started");
});
