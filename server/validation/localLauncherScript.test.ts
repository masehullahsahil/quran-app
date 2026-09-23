import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  resolve(process.cwd(), "scripts/start-wave0-validation.ps1"),
  "utf8"
);

describe("the Windows Wave 0 launcher", () => {
  it("keeps the staff API local, acoustic decisions shadow-only, and the key out of command history", () => {
    expect(script).toContain('$env:QURAN_VALIDATION_STAFF_API = "1"');
    expect(script).toContain('$env:QURAN_EVALUATOR_PRIMARY_CORRECTIONS = "0"');
    expect(script).toContain("-AsSecureString");
    expect(script).not.toMatch(/Write-Host.*QURAN_EVALUATOR_API_KEY/);
  });

  it("isolates the rehearsal from a configured remote database by default", () => {
    expect(script).toContain("[switch]$UseConfiguredDatabase");
    expect(script).toContain("127.0.0.1:1/wave0");
    expect(script).toContain("if (-not $UseConfiguredDatabase)");
  });
});
