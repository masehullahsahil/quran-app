import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDir = await mkdtemp(join(tmpdir(), "quran-acoustic-bundle-"));
const bundlePath = join(outputDir, "quran-acoustic-evaluator.cjs");

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited ${code}: ${stderr}`));
    });
  });
}

let service;
try {
  await run("pnpm", [
    "exec",
    "esbuild",
    "services/quran-acoustic-evaluator/index.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node24",
    `--outfile=${bundlePath}`,
  ]);

  service = spawn(process.execPath, [bundlePath], {
    cwd: root,
    env: {
      ...process.env,
      PORT: "4399",
      QURAN_EVALUATOR_API_KEY: "runtime-smoke-only",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  service.stdout.on("data", chunk => {
    output += chunk;
  });
  service.stderr.on("data", chunk => {
    output += chunk;
  });

  const deadline = Date.now() + 10_000;
  let response;
  while (Date.now() < deadline) {
    if (service.exitCode !== null)
      throw new Error(`Bundled evaluator exited before startup:\n${output}`);
    try {
      response = await fetch("http://127.0.0.1:4399/health");
      break;
    } catch {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    }
  }
  if (!response)
    throw new Error(
      `Bundled evaluator did not start within 10 seconds:\n${output}`
    );
  const body = await response.json();
  if (response.status !== 503 || body.shadowReady !== false)
    throw new Error(
      `Unexpected bundled evaluator health response: ${response.status} ${JSON.stringify(body)}`
    );

  console.log("Acoustic evaluator bundle runtime smoke passed.");
} finally {
  if (service && service.exitCode === null) {
    service.kill("SIGTERM");
    await new Promise(resolvePromise => service.once("exit", resolvePromise));
  }
  await rm(outputDir, { recursive: true, force: true });
}
