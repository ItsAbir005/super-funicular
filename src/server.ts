import http, { IncomingMessage, ServerResponse } from "http";
const PORT = 3000;
const server = http.createServer(
  (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  }
);
server.listen(PORT, () => {
  console.log(`[orbit] server started on port ${PORT}`);
});
