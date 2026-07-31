#!/usr/bin/env bun
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const RESULT_PREFIX = "AMPHETAMINE_BENCHMARK_RESULT:";
const DEFAULT_TIMEOUT_MS = 60000;

type BenchmarkArgs = {
  readonly label: string;
  readonly outPath: string;
  readonly baselinePath: string | null;
  readonly scenario: "idle" | "active-session";
};

type ElectronRunResult = {
  readonly payload: Record<string, unknown>;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
};

class UsageError extends Error {
  override readonly name = "UsageError";
}

class BenchmarkRunError extends Error {
  override readonly name = "BenchmarkRunError";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const userDataPath = await mkdtemp(path.join(tmpdir(), "amphetamine-benchmark-"));

  try {
    const result = await runElectronBenchmark(args, userDataPath);
    const baseline = await readBaseline(args.baselinePath);
    const artifact = {
      ...result.payload,
      harness: {
        runId,
        outPath: args.outPath,
        userDataPath,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        bun: process.versions.bun,
        node: process.versions.node,
        baseline,
      },
    };
    await mkdir(path.dirname(args.outPath), { recursive: true });
    await writeFile(args.outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
    process.stdout.write(`[benchmark] wrote ${args.outPath}\n`);
  } finally {
    await rm(userDataPath, { recursive: true, force: true });
  }
}

function parseArgs(argv: readonly string[]): BenchmarkArgs {
  let label = "benchmark";
  let outPath: string | null = null;
  let baselinePath: string | null = null;
  let scenario: "idle" | "active-session" = "idle";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--label") {
      label = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--out") {
      outPath = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--baseline") {
      baselinePath = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--scenario") {
      const value = readOptionValue(argv, index, arg);
      if (value !== "idle" && value !== "active-session") {
        throw new UsageError(`Invalid --scenario ${value}; expected idle|active-session.`);
      }
      scenario = value;
      index += 1;
    } else {
      throw new UsageError(`Unknown argument: ${arg ?? ""}`);
    }
  }

  if (outPath === null) {
    throw new UsageError("Missing required --out <path> argument.");
  }
  return { label, outPath, baselinePath, scenario };
}

function readOptionValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (typeof value !== "string" || value.startsWith("--")) {
    throw new UsageError(`Missing value for ${flag}.`);
  }
  return value;
}

async function runElectronBenchmark(
  args: BenchmarkArgs,
  userDataPath: string,
): Promise<ElectronRunResult> {
  if (!existsSync("lib/main/index.cjs") || !existsSync("lib/renderer/index.html")) {
    throw new BenchmarkRunError("Built app output is missing. Run `bun run build` first.");
  }

  const started = performance.now();
  const child = spawn("bun", ["x", "electron", ".", "--disable-gpu-sandbox", "--log-level=3"], {
    env: buildBenchmarkEnv(args, userDataPath),
    detached: true,
  });
  const output = await collectBenchmarkOutput(child);
  return {
    ...output,
    durationMs: Math.round((performance.now() - started) * 1000) / 1000,
  };
}

function buildBenchmarkEnv(
  args: BenchmarkArgs,
  userDataPath: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    AMPHETAMINE_BENCHMARK: "1",
    AMPHETAMINE_BENCHMARK_LABEL: args.label,
    AMPHETAMINE_BENCHMARK_USER_DATA: userDataPath,
    AMPHETAMINE_BENCHMARK_SCENARIO: args.scenario,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  };
}

async function collectBenchmarkOutput(
  child: ChildProcessWithoutNullStreams,
): Promise<Omit<ElectronRunResult, "durationMs">> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let payload: Record<string, unknown> | null = null;
    let isSettled = false;
    const resolveOnce = (): void => {
      if (isSettled || payload === null) return;
      isSettled = true;
      clearTimeout(timeout);
      terminateBenchmarkChild(child);
      resolve({ payload, stdout, stderr });
    };
    const rejectOnce = (error: Error): void => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeout);
      terminateBenchmarkChild(child);
      reject(error);
    };
    const timeout = setTimeout(() => {
      rejectOnce(new BenchmarkRunError(`Electron benchmark timed out after ${DEFAULT_TIMEOUT_MS}ms.`));
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
      for (const line of stdout.split("\n")) {
        if (!line.startsWith(RESULT_PREFIX)) continue;
        payload = parsePayload(line.slice(RESULT_PREFIX.length));
        resolveOnce();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (error) => {
      rejectOnce(error);
    });
    child.on("exit", (code) => {
      if (payload !== null) {
        resolveOnce();
        return;
      }
      rejectOnce(new BenchmarkRunError(`Electron exited with ${code ?? "unknown"} before result.`));
    });
  });
}

function terminateBenchmarkChild(child: ChildProcessWithoutNullStreams): void {
  child.stdin.destroy();
  child.stdout.destroy();
  child.stderr.destroy();
  child.unref();

  if (typeof child.pid !== "number") {
    child.kill();
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (isNoSuchProcessError(error)) return;
    process.stderr.write(`[benchmark] failed to terminate Electron process group: ${describeError(error)}\n`);
  }
}

function isNoSuchProcessError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parsePayload(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new BenchmarkRunError("Benchmark payload was not a JSON object.");
}

async function readBaseline(
  baselinePath: string | null,
): Promise<{ readonly path: string; readonly status: "loaded" | "missing" } | null> {
  if (baselinePath === null) return null;
  if (!existsSync(baselinePath)) return { path: baselinePath, status: "missing" };
  await readFile(baselinePath, "utf-8");
  return { path: baselinePath, status: "loaded" };
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(
      "Usage: bun run benchmark:performance -- --label <label> --out <path> [--baseline <path>] [--scenario idle|active-session]\n",
    );
    process.exit(2);
  }
  if (error instanceof Error) {
    process.stderr.write(`[benchmark] ${error.name}: ${error.message}\n`);
    process.exit(1);
  }
  process.stderr.write("[benchmark] Unknown failure.\n");
  process.exit(1);
});
