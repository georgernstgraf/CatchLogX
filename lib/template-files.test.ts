import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteTemplateFile,
  fetchTemplateFiles,
  normalizeTemplateFile,
  updateTemplateFileVisibility,
  uploadTemplateFileToBackend,
} from "@/lib/template-files";

// Tests for the client-side template-file API wrappers (#112).
// fetch is stubbed: no request leaves the test.
// downloadTemplateFile is not covered (needs a DOM).

const validRecord = {
  id: "1",
  fileName: "template.xlsx",
  filePath: "CatchLogX/template_files/20240101000000/template.xlsx",
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

describe("normalizeTemplateFile", () => {
  it("returns a clean record and drops unknown fields", () => {
    expect(normalizeTemplateFile({ ...validRecord, extra: 1 })).toEqual(
      validRecord,
    );
  });

  it("rejects non-objects", () => {
    expect(normalizeTemplateFile(null)).toBeNull();
    expect(normalizeTemplateFile("x")).toBeNull();
  });

  it("rejects missing or wrongly typed fields", () => {
    expect(normalizeTemplateFile({ ...validRecord, id: 1 })).toBeNull();
    expect(normalizeTemplateFile({ ...validRecord, isVisible: "true" })).toBeNull();
    expect(
      normalizeTemplateFile({ ...validRecord, fileName: undefined }),
    ).toBeNull();
  });
});

describe("fetchTemplateFiles", () => {
  it("passes includeHidden as a query parameter", async () => {
    respond({ templateFiles: [] });
    await fetchTemplateFiles({ includeHidden: true });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/upload/template-file?includeHidden=true",
    );

    respond({ templateFiles: [] });
    await fetchTemplateFiles();
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/upload/template-file?includeHidden=false",
    );
  });

  it("filters out invalid entries", async () => {
    respond({ templateFiles: [validRecord, { id: 2 }] });
    expect(await fetchTemplateFiles()).toEqual([validRecord]);
  });

  it("returns an empty list for a malformed payload", async () => {
    respond({});
    expect(await fetchTemplateFiles()).toEqual([]);
  });

  it("throws on a failed response", async () => {
    respond({}, false);
    await expect(fetchTemplateFiles()).rejects.toThrow(
      "Template files could not be loaded.",
    );
  });
});

describe("uploadTemplateFileToBackend", () => {
  const file = new File(["x"], "template.xlsx");

  it("sends the file name header and returns the record", async () => {
    respond({ templateFile: validRecord });
    expect(await uploadTemplateFileToBackend(file)).toEqual(validRecord);
    expect(fetchMock.mock.calls[0][1].headers["x-file-name"]).toBe(
      "template.xlsx",
    );
  });

  it("uses the server error message", async () => {
    respond({ error: "Too large" }, false);
    await expect(uploadTemplateFileToBackend(file)).rejects.toThrow("Too large");
  });

  it("falls back to a generic error", async () => {
    respond({}, false);
    await expect(uploadTemplateFileToBackend(file)).rejects.toThrow(
      "Template file upload failed.",
    );
  });

  it("rejects an invalid record from the server", async () => {
    respond({ templateFile: { id: 1 } });
    await expect(uploadTemplateFileToBackend(file)).rejects.toThrow(
      "Invalid template file payload",
    );
  });
});

describe("updateTemplateFileVisibility", () => {
  it("PATCHes the visibility flag", async () => {
    respond({ templateFile: { ...validRecord, isVisible: false } });
    const result = await updateTemplateFileVisibility("1", false);
    expect(result.isVisible).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload/template-file/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ isVisible: false }),
      }),
    );
  });

  it("falls back to a generic error", async () => {
    respond({}, false);
    await expect(updateTemplateFileVisibility("1", true)).rejects.toThrow(
      "Template file could not be updated.",
    );
  });
});

describe("deleteTemplateFile", () => {
  it("resolves on success", async () => {
    respond({});
    await expect(deleteTemplateFile("1")).resolves.toBeUndefined();
  });

  it("uses the server error message", async () => {
    respond({ error: "Not found" }, false);
    await expect(deleteTemplateFile("1")).rejects.toThrow("Not found");
  });

  it("keeps the fallback message when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });
    await expect(deleteTemplateFile("1")).rejects.toThrow(
      "Template file could not be deleted.",
    );
  });
});
