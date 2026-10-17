import type { FileErrorGroup, FileReport } from "@/lib/uploadReport";

/**
 * Client-side wrappers for the bulk upload API (#88). Also exports the report
 * normalisers so a malformed payload never reaches the UI.
 */

export type UploadedFile = { id: string; fileName: string; state: string };

export type UploadOutcome =
  | { ok: true; report: FileReport[]; uploads: UploadedFile[] }
  | {
      ok: false;
      error: string;
      details?: string;
      report: FileReport[];
      zipToken?: string;
    };

// Exported for unit tests (see lib/upload-client.test.ts, #112).
export function normalizeErrorGroups(value: unknown): FileErrorGroup[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isErrorGroup);
}

function isErrorGroup(value: unknown): value is FileErrorGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Record<string, unknown>;
  return (
    typeof group.column === "string" &&
    typeof group.value === "string" &&
    typeof group.message === "string" &&
    Array.isArray(group.rows) &&
    group.rows.every((row) => typeof row === "number")
  );
}

// Exported for unit tests (see lib/upload-client.test.ts, #112).
export function normalizeReports(value: unknown): FileReport[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFileReport);
}

function isFileReport(value: unknown): value is FileReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.fileName === "string" &&
    (report.status === "passed" || report.status === "failed") &&
    typeof report.totalRows === "number" &&
    typeof report.passedRows === "number" &&
    typeof report.failedRows === "number"
  );
}

/**
 * Messages for failures that never reach the app: a reverse proxy answers 413
 * or 504 with an HTML page, `fetch` resolves normally, and the generic catch in
 * the UI would otherwise claim a "network error" (#132).
 *
 * Exported for unit tests (see lib/upload-client.test.ts, #112).
 */
export function describeHttpFailure(status: number): string | null {
  switch (status) {
    case 401:
      return "Your session has expired. Please sign in again and retry the upload.";
    case 413:
      return "The web server rejected the upload as too large (HTTP 413). Split the files or upload them one at a time.";
    case 502:
      return "The server is not reachable right now (HTTP 502). Please try again in a moment.";
    case 503:
      return "The server is temporarily unavailable (HTTP 503). Please try again in a moment.";
    case 504:
      return "The server took too long to process the upload (HTTP 504). It may still be running in the background — check your uploads before retrying.";
    default:
      return status >= 500
        ? `The server failed while processing the upload (HTTP ${status}).`
        : null;
  }
}

/** Uploads 1..N files and returns the validation report. */
export async function uploadFiles(files: File[]): Promise<UploadOutcome> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }

  const response = await fetch("/api/upload/new", {
    method: "POST",
    body: form,
  });

  // A proxy error page (413/504) is HTML, so parsing must not throw: that
  // would turn a diagnosable failure into "files could not be uploaded".
  const raw = await response.text();
  let payload: {
    error?: string;
    details?: string;
    report?: unknown;
    zipToken?: string;
    uploads?: UploadedFile[];
  } = {};

  if (raw.trim().length > 0) {
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      error:
        payload.error ||
        describeHttpFailure(response.status) ||
        `Upload failed (HTTP ${response.status}).`,
      details: payload.details,
      report: normalizeReports(payload.report),
      zipToken: payload.zipToken,
    };
  }

  return {
    ok: true,
    report: normalizeReports(payload.report),
    uploads: Array.isArray(payload.uploads) ? payload.uploads : [],
  };
}

/** Downloads the annotated error files of a failed upload. */
export async function downloadErrorArchive(token: string): Promise<void> {
  const response = await fetch(
    `/api/upload/error-report?token=${encodeURIComponent(token)}`,
    { method: "GET", cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Error report could not be downloaded.");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "upload_errors.zip";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}
