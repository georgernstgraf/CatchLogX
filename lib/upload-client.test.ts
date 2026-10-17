import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeErrorGroups,
  normalizeReports,
  uploadFiles,
} from "@/lib/upload-client";

// Tests for the client-side bulk upload wrapper (#88).
// fetch is stubbed: no request leaves the test.
// downloadErrorArchive is not covered (needs a DOM).

const validReport = {
  fileName: "a.xlsx",
  status: "passed" as const,
  totalRows: 3,
  passedRows: 3,
  failedRows: 0,
  errors: [],
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

describe("normalizeReports", () => {
  it("keeps well-formed reports and drops garbage", () => {
    expect(normalizeReports([validReport, { id: 1 }, null])).toEqual([
      validReport,
    ]);
  });

  it("returns an empty list for a non-array", () => {
    expect(normalizeReports(undefined)).toEqual([]);
  });
});

describe("normalizeErrorGroups", () => {
  it("keeps groups with the expected shape", () => {
    const group = {
      column: "species",
      value: "Walli",
      message: "Unknown species",
      rows: [3, 5],
    };
    expect(normalizeErrorGroups([group, { column: 1 }])).toEqual([group]);
  });
});

describe("uploadFiles", () => {
  it("posts the files as multipart form data", async () => {
    respond({ report: [validReport], uploads: [{ id: "u1", fileName: "a.xlsx", state: "UPLOADED" }] });

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/upload/new");
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.getAll("files")).toHaveLength(1);
    expect(outcome).toEqual({
      ok: true,
      report: [validReport],
      uploads: [{ id: "u1", fileName: "a.xlsx", state: "UPLOADED" }],
    });
  });

  it("returns the report and the archive token on a rejection", async () => {
    respond(
      {
        error: "Validation failed",
        report: [{ ...validReport, status: "failed", failedRows: 1 }],
        zipToken: "tok",
      },
      false,
    );

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    expect(outcome).toMatchObject({
      ok: false,
      error: "Validation failed",
      zipToken: "tok",
    });
    if (outcome.ok) return;
    expect(outcome.report[0].status).toBe("failed");
  });

  it("surfaces structural errors as a plain message", async () => {
    respond({ error: "Too many files: at most 20 per upload." }, false);

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    expect(outcome).toMatchObject({
      ok: false,
      error: "Too many files: at most 20 per upload.",
      report: [],
    });
  });
});
