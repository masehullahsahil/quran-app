import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("../dist/public/", import.meta.url));
const port = await getFreePort();
const server = spawn(process.execPath, ["-e", `
  const http = require("http");
  const fs = require("fs");
  const path = require("path");
  const root = ${JSON.stringify(root)};
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
  http.createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    const relative = pathname === "/" || !path.extname(pathname) ? "/index.html" : pathname;
    const file = path.resolve(root, "." + relative);
    if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file)) { res.statusCode = 404; res.end("Not found"); return; }
    res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  }).listen(${port}, "127.0.0.1");
`], { stdio: "ignore" });

try {
  await waitForServer(port);
  for (const route of ["/", "/curriculum-audit"]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    const html = await response.text();
    if (!response.ok || !html.includes('<div id="root"></div>')) {
      throw new Error(`Production shell failed for ${route}: HTTP ${response.status}`);
    }
  }
  console.log("Production static shell passed for / and /curriculum-audit.");
} finally {
  server.kill();
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
    probe.on("error", reject);
  });
}

async function waitForServer(port) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw new Error("Production static server did not start");
}
