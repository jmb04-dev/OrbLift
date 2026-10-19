const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};
function createServer() {
  return http.createServer((req, res) => {
    let file;
    try {
      file = path.resolve(
        root,
        "." +
          decodeURIComponent(
            new URL(req.url, "http://localhost").pathname.replace(
              /\/$/,
              "/index.html",
            ),
          ),
      );
    } catch {
      res.writeHead(400).end("Invalid URL");
      return;
    }
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404).end("Not found");
        return;
      }
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(data);
    });
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT) || 4173;
  createServer()
    .on("error", (error) => {
      console.error("OrbLift server: " + error.message);
      process.exitCode = 1;
    })
    .listen(port, "127.0.0.1", () =>
      console.log("OrbLift: http://127.0.0.1:" + port),
    );
}
module.exports = { createServer };
