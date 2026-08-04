#!/usr/bin/env bun
/**
 * Parallel production compilation orchestrator (main + preload + renderer).
 * Windows-safe: no POSIX shell job control. Starts three children concurrently,
 * labels stdout/stderr, waits for all success, and terminates unfinished siblings
 * on the first failure.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";

type BuildTarget = {
  readonly name: "main" | "preload" | "renderer";
  readonly command: string;
  readonly args: readonly string[];
};

const TARGETS: readonly BuildTarget[] = [
  {
    name: "main",
    command: "bun",
    args: ["x", "rslib", "build", "-c", "rslib.config.ts"],
  },
  {
    name: "preload",
    command: "bun",
    args: ["x", "rslib", "build", "-c", "rslib.config.preload.ts"],
  },
  {
    name: "renderer",
    command: "bun",
    args: ["x", "rsbuild", "build"],
  },
] as const;

const REQUIRED_OUTPUTS = [
  "lib/main/index.cjs",
  "lib/preload/index.cjs",
  "lib/preload/utility-dialog.cjs",
  "lib/renderer/index.html",
  "lib/renderer/settings.html",
  "lib/renderer/about.html",
  "lib/renderer/utility-dialog.html",
] as const;

type ChildHandle = {
  readonly target: BuildTarget;
  readonly child: ChildProcessWithoutNullStreams;
  readonly done: Promise<{ name: string; code: number | null }>;
};

function prefixStream(name: string, stream: NodeJS.ReadableStream, write: (s: string) => void): void {
  let buffer = "";
  stream.on("data", (chunk: Buffer | string) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      write(`[${name}] ${line}\n`);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      write(`[${name}] ${buffer}\n`);
      buffer = "";
    }
  });
}

function startTarget(target: BuildTarget): ChildHandle {
  const child = spawn(target.command, [...target.args], {
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;

  prefixStream(target.name, child.stdout, (s) => {
    process.stdout.write(s);
  });
  prefixStream(target.name, child.stderr, (s) => {
    process.stderr.write(s);
  });

  const done = new Promise<{ name: string; code: number | null }>((resolve) => {
    child.on("error", (err) => {
      process.stderr.write(`[${target.name}] spawn error: ${err.message}\n`);
      resolve({ name: target.name, code: 1 });
    });
    child.on("close", (code) => {
      resolve({ name: target.name, code });
    });
  });

  return { target, child, done };
}

function terminateChild(handle: ChildHandle): void {
  const { child, target } = handle;
  if (child.exitCode !== null || child.killed) return;
  try {
    child.kill("SIGTERM");
  } catch {
    process.stderr.write(`[build] failed to SIGTERM ${target.name}\n`);
  }
  // Escalate if still alive shortly after (Windows-friendly; no process groups required).
  setTimeout(() => {
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }, 2000).unref();
}

async function main(): Promise<void> {
  process.stdout.write("[build] starting parallel production compilation (main, preload, renderer)\n");
  const handles = TARGETS.map(startTarget);
  const results: Array<{ name: string; code: number | null }> = [];

  await new Promise<void>((resolve) => {
    let remaining = handles.length;
    for (const handle of handles) {
      void handle.done.then((result) => {
        results.push(result);
        if (result.code !== 0) {
          process.stderr.write(
            `[build] ${result.name} failed with exit code ${result.code ?? "null"}; terminating siblings\n`,
          );
          for (const sibling of handles) {
            if (sibling.target.name !== result.name) {
              terminateChild(sibling);
            }
          }
        }
        remaining -= 1;
        if (remaining === 0) resolve();
      });
    }
  });

  const failed = results.filter((r) => r.code !== 0);
  if (failed.length > 0) {
    process.stderr.write(
      `[build] compilation failed: ${failed.map((f) => `${f.name}=${f.code}`).join(", ")}\n`,
    );
    process.exit(1);
  }

  const missing = REQUIRED_OUTPUTS.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    process.stderr.write(`[build] missing expected outputs: ${missing.join(", ")}\n`);
    process.exit(1);
  }

  process.stdout.write("[build] all targets succeeded\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`[build] unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
