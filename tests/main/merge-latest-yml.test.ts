import { describe, it, expect } from "vitest";
import {
  parseLatestYml,
  mergeFeeds,
  serializeLatestYml,
} from "../../scripts/merge-latest-yml.ts";

const ARM64 = `version: 1.10.2
files:
  - url: Amphetamine-1.10.2-arm64-mac.zip
    sha512: aaa
    size: 100
path: Amphetamine-1.10.2-arm64-mac.zip
sha512: aaa
releaseDate: '2026-07-31T00:00:00.000Z'
`;

const X64 = `version: 1.10.2
files:
  - url: Amphetamine-1.10.2-mac.zip
    sha512: bbb
    size: 200
path: Amphetamine-1.10.2-mac.zip
sha512: bbb
releaseDate: '2026-07-31T00:00:00.000Z'
`;

describe("merge-latest-yml", () => {
  it("parses electron-builder feed shape", () => {
    const feed = parseLatestYml(ARM64);
    expect(feed.version).toBe("1.10.2");
    expect(feed.files).toHaveLength(1);
    expect(feed.files[0]?.url).toBe("Amphetamine-1.10.2-arm64-mac.zip");
    expect(feed.files[0]?.size).toBe(100);
  });

  it("merges dual-arch feeds into one files list", () => {
    const merged = mergeFeeds([parseLatestYml(ARM64), parseLatestYml(X64)]);
    expect(merged.version).toBe("1.10.2");
    expect(merged.files.map((f) => f.url).sort()).toEqual([
      "Amphetamine-1.10.2-arm64-mac.zip",
      "Amphetamine-1.10.2-mac.zip",
    ]);
    // Prefer non-arm64 path as generic entry
    expect(merged.path).toBe("Amphetamine-1.10.2-mac.zip");
    expect(merged.sha512).toBe("bbb");
  });

  it("refuses to merge different versions", () => {
    const other = parseLatestYml(X64.replaceAll("1.10.2", "1.10.3"));
    expect(() => mergeFeeds([parseLatestYml(ARM64), other])).toThrow(/different versions/);
  });

  it("round-trips serialize → parse", () => {
    const merged = mergeFeeds([parseLatestYml(ARM64), parseLatestYml(X64)]);
    const again = parseLatestYml(serializeLatestYml(merged));
    expect(again.files).toHaveLength(2);
    expect(again.version).toBe("1.10.2");
  });
});
