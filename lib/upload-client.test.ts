import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeHttpFailure,
  normalizeErrorGroups,
  normalizeImports,
  normalizeReports,
  uploadFiles,
} from "@/lib/upload-client";

// Tests for the client-side bulk upload wrapper (#88, import model since #202).
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
  fetchMock.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 400,
    text: async () => JSON.stringify(body),
  });
}

/** A proxy error page: HTML body, not JSON (#132). */
function respondHtml(status: number) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () =>
      `<html><head><title>${status} Gateway Time-out</title></head></html>`,
  });
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

describe("normalizeImports", () => {
  it("keeps well-formed imports and drops garbage", () => {
    const imported = { id: "i1", fileName: "a.xlsx", rowCount: 3 };
    expect(normalizeImports([imported, { id: "i2" }, null])).toEqual([
      imported,
    ]);
  });

  it("returns an empty list for a non-array", () => {
    expect(normalizeImports(undefined)).toEqual([]);
  });
});

describe("uploadFiles", () => {
  it("posts the files as multipart form data", async () => {
    respond({
      report: [validReport],
      imports: [{ id: "i1", fileName: "a.xlsx", rowCount: 3 }],
      samplings: 2,
      catches: 3,
    });

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/upload/new");
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.getAll("files")).toHaveLength(1);
    expect(outcome).toEqual({
      ok: true,
      report: [validReport],
      imports: [{ id: "i1", fileName: "a.xlsx", rowCount: 3 }],
      samplings: 2,
      catches: 3,
    });
  });

  it("defaults missing counts and imports to empty values", async () => {
    respond({ report: [validReport] });

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    expect(outcome).toEqual({
      ok: true,
      report: [validReport],
      imports: [],
      samplings: 0,
      catches: 0,
    });
  });

  // A duplicate file is rejected with 409 and only an `error` field: the server
  // text is the message, nothing crashes (#202).
  it("surfaces a duplicate file (409) as a plain error message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({
          error: "This file has already been imported.",
        }),
    });

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    expect(outcome).toEqual({
      ok: false,
      error: "This file has already been imported.",
      details: undefined,
      report: [],
      zipToken: undefined,
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
    respond({ error: "Too many files: at most 20 per import." }, false);

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    expect(outcome).toMatchObject({
      ok: false,
      error: "Too many files: at most 20 per import.",
      report: [],
    });
  });

  // A reverse proxy answers oversized/slow uploads with an HTML page, so the
  // response is not JSON and must not be reported as a network error (#132).
  it("explains a 504 from the proxy instead of claiming a network error", async () => {
    respondHtml(504);

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    expect(outcome).toMatchObject({ ok: false, report: [] });
    if (outcome.ok) return;
    expect(outcome.error).toContain("HTTP 504");
    expect(outcome.error).toContain("check your uploads before retrying");
  });

  it("explains a 413 from the proxy", async () => {
    respondHtml(413);

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    if (outcome.ok) return;
    expect(outcome.error).toContain("HTTP 413");
  });

  it("falls back to the status code for an unmapped failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 418,
      text: async () => "",
    });

    const outcome = await uploadFiles([new File(["x"], "a.xlsx")]);

    if (outcome.ok) return;
    expect(outcome.error).toBe("Upload failed (HTTP 418).");
  });
});

describe("describeHttpFailure", () => {
  it("maps the proxy statuses that used to look like network errors", () => {
    expect(describeHttpFailure(401)).toContain("session has expired");
    expect(describeHttpFailure(413)).toContain("HTTP 413");
    expect(describeHttpFailure(502)).toContain("HTTP 502");
    expect(describeHttpFailure(503)).toContain("HTTP 503");
    expect(describeHttpFailure(504)).toContain("HTTP 504");
  });

  it("covers unmapped server errors with the status code", () => {
    expect(describeHttpFailure(500)).toContain("HTTP 500");
    expect(describeHttpFailure(507)).toContain("HTTP 507");
  });

  it("returns null for client errors with no generic hint", () => {
    expect(describeHttpFailure(400)).toBeNull();
    expect(describeHttpFailure(422)).toBeNull();
  });
});
