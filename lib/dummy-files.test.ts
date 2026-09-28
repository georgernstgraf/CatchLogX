import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDummyFile,
  fetchDummyFiles,
  normalizeDummyFile,
  updateDummyFileVisibility,
  uploadDummyFileToBackend,
} from "@/lib/dummy-files";

// Tests for the client-side dummy-file API wrappers (#112).
// fetch is stubbed: no request leaves the test.
// downloadDummyFile is not covered (needs a DOM).

const validRecord = {
  id: "1",
  fileName: "dummy.xlsx",
  filePath: "CatchLogX/dummy_files/20240101000000/dummy.xlsx",
  uploadedByUserId: "u1",
  createdAt: "2024-01-01T00:00:00.000Z",
  isVisible: true,
};

const fetchMock = vi.fn();

function respond(body: unknown, ok = true) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeDummyFile", () => {
  it("returns a clean record and drops unknown fields", () => {
    expect(normalizeDummyFile({ ...validRecord, extra: 1 })).toEqual(
      validRecord,
    );
  });

  it("rejects non-objects", () => {
    expect(normalizeDummyFile(null)).toBeNull();
    expect(normalizeDummyFile("x")).toBeNull();
  });

  it("rejects missing or wrongly typed fields", () => {
    expect(normalizeDummyFile({ ...validRecord, id: 1 })).toBeNull();
    expect(normalizeDummyFile({ ...validRecord, isVisible: "true" })).toBeNull();
    expect(
      normalizeDummyFile({ ...validRecord, fileName: undefined }),
    ).toBeNull();
  });
});

describe("fetchDummyFiles", () => {
  it("passes includeHidden as a query parameter", async () => {
    respond({ dummyFiles: [] });
    await fetchDummyFiles({ includeHidden: true });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/upload/dummy-file?includeHidden=true",
    );

    respond({ dummyFiles: [] });
    await fetchDummyFiles();
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/upload/dummy-file?includeHidden=false",
    );
  });

  it("filters out invalid entries", async () => {
    respond({ dummyFiles: [validRecord, { id: 2 }] });
    expect(await fetchDummyFiles()).toEqual([validRecord]);
  });

  it("returns an empty list for a malformed payload", async () => {
    respond({});
    expect(await fetchDummyFiles()).toEqual([]);
  });

  it("throws on a failed response", async () => {
    respond({}, false);
    await expect(fetchDummyFiles()).rejects.toThrow(
      "Dummy files could not be loaded.",
    );
  });
});

describe("uploadDummyFileToBackend", () => {
  const file = new File(["x"], "dummy.xlsx");

  it("sends the file name header and returns the record", async () => {
    respond({ dummyFile: validRecord });
    expect(await uploadDummyFileToBackend(file)).toEqual(validRecord);
    expect(fetchMock.mock.calls[0][1].headers["x-file-name"]).toBe(
      "dummy.xlsx",
    );
  });

  it("uses the server error message", async () => {
    respond({ error: "Too large" }, false);
    await expect(uploadDummyFileToBackend(file)).rejects.toThrow("Too large");
  });

  it("falls back to a generic error", async () => {
    respond({}, false);
    await expect(uploadDummyFileToBackend(file)).rejects.toThrow(
      "Dummy file upload failed.",
    );
  });

  it("rejects an invalid record from the server", async () => {
    respond({ dummyFile: { id: 1 } });
    await expect(uploadDummyFileToBackend(file)).rejects.toThrow(
      "Invalid dummy file payload",
    );
  });
});

describe("updateDummyFileVisibility", () => {
  it("PATCHes the visibility flag", async () => {
    respond({ dummyFile: { ...validRecord, isVisible: false } });
    const result = await updateDummyFileVisibility("1", false);
    expect(result.isVisible).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload/dummy-file/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ isVisible: false }),
      }),
    );
  });

  it("falls back to a generic error", async () => {
    respond({}, false);
    await expect(updateDummyFileVisibility("1", true)).rejects.toThrow(
      "Dummy file could not be updated.",
    );
  });
});

describe("deleteDummyFile", () => {
  it("resolves on success", async () => {
    respond({});
    await expect(deleteDummyFile("1")).resolves.toBeUndefined();
  });

  it("uses the server error message", async () => {
    respond({ error: "Not found" }, false);
    await expect(deleteDummyFile("1")).rejects.toThrow("Not found");
  });

  it("keeps the fallback message when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });
    await expect(deleteDummyFile("1")).rejects.toThrow(
      "Dummy file could not be deleted.",
    );
  });
});
