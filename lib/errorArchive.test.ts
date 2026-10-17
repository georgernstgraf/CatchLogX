import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import {
  ARCHIVE_TTL_MS,
  buildZip,
  clearArchiveStore,
  getArchive,
  pruneArchives,
  putArchive,
} from "@/lib/errorArchive";

// Tests for the in-memory error archive (#88).

afterEach(() => {
  clearArchiveStore();
});

describe("buildZip", () => {
  it("packages the entries into a readable ZIP", async () => {
    const zip = await buildZip([
      { fileName: "a.xlsx", data: Buffer.from("aaa") },
      { fileName: "b.xlsx", data: Buffer.from("bbb") },
    ]);

    const loaded = await JSZip.loadAsync(zip);
    expect(Object.keys(loaded.files).sort()).toEqual(["a.xlsx", "b.xlsx"]);
    expect(await loaded.file("a.xlsx")!.async("string")).toBe("aaa");
  });
});

describe("putArchive / getArchive", () => {
  it("returns the stored archive for its token", () => {
    const token = putArchive(Buffer.from("zip"));
    expect(getArchive(token)?.toString()).toBe("zip");
  });

  it("returns null for an unknown token", () => {
    expect(getArchive("nope")).toBeNull();
  });

  it("expires the archive after the TTL", () => {
    const now = 1_000;
    const token = putArchive(Buffer.from("zip"), now);

    expect(getArchive(token, now + ARCHIVE_TTL_MS - 1)?.toString()).toBe("zip");
    expect(getArchive(token, now + ARCHIVE_TTL_MS)).toBeNull();
  });

  it("prunes expired archives without dropping live ones", () => {
    const now = 1_000;
    const live = putArchive(Buffer.from("live"), now);
    const dead = putArchive(Buffer.from("dead"), now);

    pruneArchives(now + ARCHIVE_TTL_MS);

    expect(getArchive(live, now + ARCHIVE_TTL_MS)).toBeNull();
    expect(getArchive(dead, now + ARCHIVE_TTL_MS)).toBeNull();
  });
});
