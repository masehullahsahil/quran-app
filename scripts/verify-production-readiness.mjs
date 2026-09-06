import { spawnSync } from "node:child_process";

const checks = [
  [
    "test",
    "--",
    "server/recitation.benchmark.test.ts",
    "server/learner.router.test.ts",
    "client/src/lib/learnerPersistence.test.ts",
    "client/src/lib/memorizationHistory.test.ts",
    "locales/locales.test.ts",
    "shared/teacherDecision.test.ts",
    "server/quranEvaluator.test.ts",
  ],
  ["check"],
];

if (process.env.VERIFY_DATABASE === "1") {
  checks.push(["db:verify-learner-persistence"]);
} else {
  console.log(
    "database verification not run (set VERIFY_DATABASE=1 with DATABASE_URL to enable it)",
  );
}

for (const args of checks) {
  console.log(`\n> pnpm ${args.join(" ")}`);
  const command = process.env.npm_execpath ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const commandArgs = process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    env: { ...process.env, OPENAI_BASE_URL: undefined },
  });
  if (result.error) {
    console.error(result.error.message);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nDeterministic production-readiness checks passed.");

