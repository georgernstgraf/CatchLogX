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

  const payload = (await response.json()) as {
    error?: string;
    details?: string;
    report?: unknown;
    zipToken?: string;
    uploads?: UploadedFile[];
  };

  if (!response.ok) {
    return {
      ok: false,
      error: payload.error || "Upload failed.",
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
