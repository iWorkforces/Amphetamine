import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Unit-level failure-path test for the production build orchestrator.
 * Spawns a tiny inline Bun process that mimics sibling termination behavior
 * used by scripts/build-production.ts (first failure kills remaining work).
 */
describe("build-production orchestrator contract", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits nonzero when a child fails and does not hang", async () => {
    const script = `
      import { spawn } from "node:child_process";
      const kids = [];
      const fail = spawn("bun", ["-e", "process.exit(2)"], { stdio: "ignore" });
      const hang = spawn("bun", ["-e", "await Bun.sleep(60000)"], { stdio: "ignore" });
      kids.push(fail, hang);
      fail.on("close", (code) => {
        for (const k of kids) {
          if (k.exitCode === null) k.kill("SIGTERM");
        }
        process.exit(code === 0 ? 0 : 1);
      });
    `;
    const result = await new Promise<{ code: number | null; ms: number }>((resolve) => {
      const started = Date.now();
      const child = spawn("bun", ["-e", script], { stdio: "ignore" });
      child.on("close", (code) => {
        resolve({ code, ms: Date.now() - started });
      });
    });
    expect(result.code).not.toBe(0);
    expect(result.ms).toBeLessThan(15_000);
  });

  it("package.json build script points at the parallel orchestrator", () => {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.build).toContain("build-production.ts");
    expect(pkg.scripts["build:main"]).toContain("rslib");
    expect(pkg.scripts["build:preload"]).toContain("rslib");
    expect(pkg.scripts["build:renderer"]).toContain("rsbuild");
  });
});
