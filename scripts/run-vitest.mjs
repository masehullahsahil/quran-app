import path from "node:path";
import { fileURLToPath } from "node:url";
import { startVitest } from "vitest/node";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filters = process.argv.slice(2).filter((arg) => arg !== "--");

const vitest = await startVitest(
  "test",
  filters,
  {
    config: false,
    run: true,
    root: projectRoot,
    test: {
      environment: "node",
      testTimeout: 15000,
      include: [
        "server/**/*.test.ts",
        "server/**/*.spec.ts",
        "client/src/**/*.test.ts",
        "client/src/**/*.spec.ts",
        "locales/**/*.test.ts",
        "shared/**/*.test.ts",
        "services/**/*.test.ts",
      ],
    },
  },
  {
    resolve: {
      alias: {
        "@": path.resolve(projectRoot, "client", "src"),
        "@shared": path.resolve(projectRoot, "shared"),
        "@locales": path.resolve(projectRoot, "locales"),
      },
    },
  },
);

if (!vitest) {
  process.exitCode = 1;
}

