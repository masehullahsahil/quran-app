import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dockerfile = await readFile(
  resolve(root, "services/quran-acoustic-evaluator/Dockerfile.gpu"),
  "utf8"
);
const entrypoint = await readFile(
  resolve(root, "services/quran-acoustic-evaluator/entrypoint.sh"),
  "utf8"
);
const publishWorkflow = await readFile(
  resolve(root, ".github/workflows/publish-acoustic-image.yml"),
  "utf8"
);

const requiredDockerfileMarkers = [
  "USER node",
  "EXPOSE 4317",
  "HEALTHCHECK",
  "QURAN_ACOUSTIC_SHADOW_MODEL=obadx/muaalem-model-v3_2",
  "QURAN_ACOUSTIC_SHADOW_REVISION=01a1ef9fbe40d144ef845101e89ff924aed3fef5",
  "QURAN_ACOUSTIC_REQUIRE_CUDA=1",
  "QURAN_ACOUSTIC_SHADOW_URL=http://127.0.0.1:4318/v1/shadow/analyze",
  "COPY shared ./shared",
  "--format=cjs",
  "--outfile=/output/quran-acoustic-evaluator.cjs",
  'ENTRYPOINT ["/usr/bin/tini", "-s", "--", "/app/entrypoint.sh"]',
];
for (const marker of requiredDockerfileMarkers) {
  if (!dockerfile.includes(marker))
    throw new Error(`GPU Dockerfile is missing required marker: ${marker}`);
}
if (/EXPOSE\s+4318/.test(dockerfile))
  throw new Error("The private Python worker port must not be exposed");
if (!entrypoint.includes("QURAN_EVALUATOR_API_KEY:-"))
  throw new Error("The container must refuse unauthenticated startup");
if (!entrypoint.includes("node /app/quran-acoustic-evaluator.cjs"))
  throw new Error("The container must start the CommonJS evaluator bundle");
if (
  !entrypoint.includes("uvicorn app:app --app-dir /app/python --host 127.0.0.1")
)
  throw new Error("The Python worker must bind only to loopback");
if (!publishWorkflow.includes("workflow_dispatch:"))
  throw new Error("The GPU image publication workflow must remain manual");
if (/^\s{2}(push|pull_request):/m.test(publishWorkflow))
  throw new Error("The large GPU image must not build on every push or PR");
if (!publishWorkflow.includes("quran-acoustic-evaluator:sha-${{ github.sha }}"))
  throw new Error("Published GPU images must use an immutable commit tag");

console.log("Acoustic GPU container contract passed.");
