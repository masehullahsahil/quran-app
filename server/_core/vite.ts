import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  /**
   * `vite.config.ts` exports a *function*, because it needs `command` and
   * `mode` to decide which plugins to load and which env files to read. So it
   * has to be called before its settings exist.
   *
   * Spreading it instead — `{ ...viteConfig }` — is silently empty: a function
   * has no own enumerable properties, so the result is `{}`. Vite then starts
   * with no `root`, no plugins and no aliases, roots itself at the process
   * working directory, and stops recognising `/src/main.tsx` as anything it
   * owns. The request falls through to the HTML catch-all below, the browser is
   * handed `text/html` where it asked for a module, and the page goes blank
   * with nothing logged on either side. `vite.test.ts` is that request.
   */
  const resolvedConfig = typeof viteConfig === "function"
    ? await viteConfig({
        command: "serve",
        // The dev script sets this; the fallback is Vite's own serve default.
        mode: process.env.NODE_ENV ?? "development",
      })
    : viteConfig;

  const vite = await createViteServer({
    ...resolvedConfig,
    configFile: false,
    // Deliberately replaces the config file's `server` block rather than
    // merging with it: middleware mode, this HTTP server's HMR socket, and an
    // open host list are what running inside Express requires.
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
