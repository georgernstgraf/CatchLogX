import { describe, expect, it } from "vitest";
import { formatReleaseLabel, readReleaseInfo } from "./releaseInfo";

describe("readReleaseInfo", () => {
  it("reads version and commit from the environment", () => {
    expect(
      readReleaseInfo({
        NEXT_PUBLIC_APP_VERSION: "0.1.0",
        NEXT_PUBLIC_GIT_SHA: "2b7c2ee9f1c0d4a5b6e7f8091a2b3c4d5e6f7081",
      })
    ).toEqual({ version: "0.1.0", commit: "2b7c2ee" });
  });

  it("falls back to the package version placeholder when nothing is injected", () => {
    expect(readReleaseInfo({})).toEqual({ version: "dev", commit: null });
  });

  it("treats an empty sha as absent", () => {
    expect(readReleaseInfo({ NEXT_PUBLIC_APP_VERSION: "0.2.0", NEXT_PUBLIC_GIT_SHA: "" })).toEqual({
      version: "0.2.0",
      commit: null,
    });
  });

  it("accepts a sha shorter than seven characters", () => {
    expect(readReleaseInfo({ NEXT_PUBLIC_APP_VERSION: "0.1.0", NEXT_PUBLIC_GIT_SHA: "abc" }).commit).toBe(
      "abc"
    );
  });
});

describe("formatReleaseLabel", () => {
  it("joins version and commit", () => {
    expect(formatReleaseLabel({ version: "0.1.0", commit: "2b7c2ee" })).toBe("0.1.0 · 2b7c2ee");
  });

  it("omits the separator when there is no commit", () => {
    expect(formatReleaseLabel({ version: "0.1.0", commit: null })).toBe("0.1.0");
  });
});
