import { spawnSync } from "node:child_process";

const checks = [
  ["benchmark:recitation"],
  [
    "exec",
    "vitest",
    "run",
    "server/learner.router.test.ts",
    "client/src/lib/learnerPersistence.test.ts",
    "client/src/lib/memorizationHistory.test.ts",
    "locales/locales.test.ts",
    "shared/teacherDecision.test.ts",
    "server/quranEvaluator.test.ts",
  ],
  ["check"],
] as const;
if (process.env.VERIFY_DATABASE === "1")
  checks.push(["db:verify-learner-persistence"] as never);
else
  console.log(
    "database verification not run (set VERIFY_DATABASE=1 with DATABASE_URL to enable it)"
  );

for (const args of checks) {
  console.log(`\n> pnpm ${args.join(" ")}`);
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: { ...process.env, OPENAI_BASE_URL: undefined },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("\nDeterministic production-readiness checks passed.");
