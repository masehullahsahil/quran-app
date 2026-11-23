import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { getAnalyticsConfig, type AnalyticsEnv } from "./shared/analyticsConfig";

function vitePluginOptionalAnalytics(env: AnalyticsEnv): Plugin {
  const analytics = getAnalyticsConfig(env);

  return {
    name: "optional-analytics",
    apply: "build",
    transformIndexHtml(html) {
      if (!analytics) {
        return html;
      }

      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              defer: true,
              src: `${analytics.endpoint}/umami`,
              "data-website-id": analytics.websiteId,
            },
            injectTo: "body",
          },
        ],
      };
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const projectRoot = import.meta.dirname;
  const env = { ...process.env, ...loadEnv(mode, projectRoot, "") };
  const isBuild = command === "build";
  const plugins = [
    react(),
    tailwindcss(),
    vitePluginOptionalAnalytics(env),
    ...(isBuild ? [] : [jsxLocPlugin()]),
  ];

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(projectRoot, "client", "src"),
        "@shared": path.resolve(projectRoot, "shared"),
        "@locales": path.resolve(projectRoot, "locales"),
        "@assets": path.resolve(projectRoot, "attached_assets"),
      },
    },
    envDir: path.resolve(projectRoot),
    root: path.resolve(projectRoot, "client"),
    publicDir: path.resolve(projectRoot, "client", "public"),
    build: {
      outDir: path.resolve(projectRoot, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      host: true,
      allowedHosts: [
        ".manuspre.computer",
        ".manus.computer",
        ".manus-asia.computer",
        ".manuscomputer.ai",
        ".manusvm.computer",
        "localhost",
        "127.0.0.1",
      ],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});

