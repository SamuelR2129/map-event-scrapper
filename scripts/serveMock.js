// Minimal static file server that serves the local mock of the Nib Hotel
// music page (used by the nibHotel scraper test). Serves the fixture under
// mock/nibHotel on port 5173 (the default Vite dev-server port the scraper
// expects) so no separate frontend checkout is required to run the tests.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.MOCK_PORT) || 5173;
const MOCK_DIR = path.join(__dirname, "..", "mock", "nibHotel");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  // Always serve the mock SPA shell for any path (matches a client-side routed app).
  const filePath =
    pathname === "/robots.txt" ? path.join(MOCK_DIR, "robots.txt") : path.join(MOCK_DIR, "index.html");

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[serveMock] Nib Hotel mock served at http://localhost:${PORT}`);
});