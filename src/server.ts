import http from "http";
import { loadConfig } from "./config";

const config = loadConfig();
const { PORT, NODE_ENV } = config;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        env: NODE_ENV,
      })
    );
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`[orbit] server started on port ${PORT}`);
});
