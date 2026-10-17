/**
 * Shape of the upload report (#88). Shared by the upload service (server) and
 * the upload page (client); types only, no runtime dependency.
 *
 * Single-file upload is the N=1 case of a bulk upload, so both produce the
 * same report.
 */

/**
 * Upload limits, enforced by the API and pre-checked in the UI.
 *
 * The reverse proxy must allow a larger body than MAX_UPLOAD_TOTAL_BYTES:
 * nginx defaults to `client_max_body_size 1m` and answers 413 before the app
 * sees the files (see docs/ai/PITFALLS.md, #132).
 */
export const MAX_UPLOAD_FILES = 20;
export const MAX_UPLOAD_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MiB

/**
 * Per-file cap. A workbook that satisfies MAX_ROWS_PER_FILE is a few MiB at
 * most, so anything larger is rejected before it is parsed — the whole file is
 * read into memory and a pathological workbook can otherwise pin the server for
 * minutes (#132).
 */
export const MAX_UPLOAD_FILE_BYTES = 32 * 1024 * 1024; // 32 MiB

/**
 * Data rows allowed per file (header row excluded). Stated in the upload page's
 * checklist since #88 but only enforced here — without it the per-row
 * validation runs unbounded (#132).
 */
export const MAX_ROWS_PER_FILE = 10_000;

/** Errors that share a column, offending value and message are grouped. */
export type FileErrorGroup = {
  /** Column header the error belongs to (`"-"` for structural errors). */
  column: string;
  /** The offending cell value (`""` when the cell was empty). */
  value: string;
  /** Human-readable message, always naming the column and value. */
  message: string;
  /** 1-based Excel row numbers affected (header row is row 1). */
  rows: number[];
};

/** Report for one uploaded file. */
export type FileReport = {
  fileName: string;
  status: "passed" | "failed";
  totalRows: number;
  passedRows: number;
  failedRows: number;
  errors: FileErrorGroup[];
};

/** Successful bulk upload response. */
export type BulkUploadResult = {
  report: FileReport[];
  uploads: { id: string; fileName: string; state: string }[];
};

/** Failed bulk upload response: report plus a token for the error archive. */
export type BulkUploadFailure = {
  report: FileReport[];
  zipToken: string;
};
