#!/usr/bin/env bun
/**
 * Merge electron-builder `latest*.yml` update feeds from separate arch CI jobs.
 *
 * Dual-arch packaging produces one feed file per job (same basename). GitHub
 * release assets must be unique, so CD must publish a single merged feed with
 * every arch's file entry for electron-updater.
 *
 * Usage:
 *   bun run scripts/merge-latest-yml.ts <a.yml> <b.yml> ... --out <out.yml>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

type FeedFile = {
  url: string;
  sha512: string;
  size: number;
};

type Feed = {
  version: string;
  files: FeedFile[];
  path: string;
  sha512: string;
  releaseDate: string;
  [key: string]: unknown;
};

function usage(): never {
  process.stderr.write(
    "Usage: bun run scripts/merge-latest-yml.ts <yml...> --out <path>\n",
  );
  process.exit(2);
}

function parseArgs(argv: readonly string[]): { inputs: string[]; outPath: string } {
  const inputs: string[] = [];
  let outPath: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      const next = argv[i + 1];
      if (typeof next !== "string" || next.startsWith("--")) usage();
      outPath = next;
      i += 1;
      continue;
    }
    if (arg === undefined || arg.startsWith("--")) usage();
    inputs.push(arg);
  }
  if (inputs.length === 0 || outPath === null) usage();
  return { inputs, outPath };
}

/**
 * Minimal parser for electron-builder latest*.yml (no full YAML dependency).
 * Supports the fixed shape electron-builder emits for GitHub provider feeds.
 */
export function parseLatestYml(raw: string): Feed {
  const version = matchScalar(raw, "version");
  const pathValue = matchScalar(raw, "path");
  const sha512 = matchScalar(raw, "sha512");
  const releaseDate = matchScalar(raw, "releaseDate");
  if (version === null || pathValue === null || sha512 === null || releaseDate === null) {
    throw new Error("latest.yml missing required top-level fields (version/path/sha512/releaseDate)");
  }

  const files: FeedFile[] = [];
  const filesBlock = raw.match(/^files:\n((?:[ \t]+.*\n?)*)/m);
  if (filesBlock?.[1] !== undefined) {
    const entries = filesBlock[1].split(/^[ \t]*-[ \t]+url:/m).slice(1);
    for (const entry of entries) {
      const url = matchInlineOrNext(entry, "url") ?? entry.split("\n")[0]?.trim();
      const fileSha = matchInlineOrNext(entry, "sha512");
      const sizeRaw = matchInlineOrNext(entry, "size");
      if (url === undefined || url.length === 0 || fileSha === null || sizeRaw === null) {
        throw new Error(`latest.yml file entry incomplete:\n${entry}`);
      }
      const size = Number(sizeRaw);
      if (!Number.isFinite(size)) {
        throw new Error(`latest.yml file size is not a number: ${sizeRaw}`);
      }
      files.push({ url: stripQuotes(url), sha512: stripQuotes(fileSha), size });
    }
  }

  if (files.length === 0) {
    // Some feeds only use path/sha512 without a files list — synthesize one entry.
    files.push({ url: pathValue, sha512, size: 0 });
  }

  return {
    version: stripQuotes(version),
    files,
    path: stripQuotes(pathValue),
    sha512: stripQuotes(sha512),
    releaseDate: stripQuotes(releaseDate),
  };
}

function matchScalar(raw: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const m = raw.match(re);
  return m?.[1]?.trim() ?? null;
}

function matchInlineOrNext(block: string, key: string): string | null {
  // "url: value" on first line after split, or "  key: value" later
  if (key === "url") {
    const first = block.split("\n")[0]?.trim();
    if (first !== undefined && first.length > 0 && !first.includes(":")) {
      return first;
    }
  }
  const re = new RegExp(`^\\s*${key}:\\s*(.+)$`, "m");
  const m = block.match(re);
  return m?.[1]?.trim() ?? null;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function mergeFeeds(feeds: readonly Feed[]): Feed {
  if (feeds.length === 0) {
    throw new Error("mergeFeeds requires at least one feed");
  }
  const first = feeds[0];
  if (first === undefined) {
    throw new Error("mergeFeeds requires at least one feed");
  }
  const version = first.version;
  for (const feed of feeds) {
    if (feed.version !== version) {
      throw new Error(
        `Refusing to merge feeds with different versions: ${version} vs ${feed.version}`,
      );
    }
  }

  const byUrl = new Map<string, FeedFile>();
  for (const feed of feeds) {
    for (const file of feed.files) {
      byUrl.set(file.url, file);
    }
  }
  const files = [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));

  // Prefer a non-arm64 path as the generic `path` when present (electron-builder convention).
  const preferred =
    feeds.map((f) => f.path).find((p) => !p.includes("arm64")) ?? first.path;
  const preferredMeta =
    feeds.find((f) => f.path === preferred) ?? first;

  return {
    version,
    files,
    path: preferred,
    sha512: preferredMeta.sha512,
    releaseDate: preferredMeta.releaseDate,
  };
}

export function serializeLatestYml(feed: Feed): string {
  const lines: string[] = [];
  lines.push(`version: ${feed.version}`);
  lines.push("files:");
  for (const file of feed.files) {
    lines.push(`  - url: ${file.url}`);
    lines.push(`    sha512: ${file.sha512}`);
    lines.push(`    size: ${file.size}`);
  }
  lines.push(`path: ${feed.path}`);
  lines.push(`sha512: ${feed.sha512}`);
  // Preserve quoting style electron-builder uses for ISO dates when needed
  const date =
    feed.releaseDate.includes(":") && !feed.releaseDate.startsWith("'")
      ? `'${feed.releaseDate}'`
      : feed.releaseDate;
  lines.push(`releaseDate: ${date}`);
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const { inputs, outPath } = parseArgs(process.argv.slice(2));
  const feeds = inputs.map((file) => {
    const raw = readFileSync(file, "utf-8");
    return parseLatestYml(raw);
  });
  const merged = mergeFeeds(feeds);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, serializeLatestYml(merged), "utf-8");
  process.stdout.write(
    `[merge-latest-yml] wrote ${outPath} (${merged.files.length} file entries, v${merged.version})\n`,
  );
}

// Only run CLI when executed directly (not when imported by tests).
if (import.meta.main) {
  try {
    main();
  } catch (err: unknown) {
    process.stderr.write(
      `[merge-latest-yml] ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
