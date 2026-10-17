/**
 * Shape of the upload report (#88). Shared by the upload service (server) and
 * the upload page (client); types only, no runtime dependency.
 *
 * Single-file upload is the N=1 case of a bulk upload, so both produce the
 * same report.
 */

/** Upload limits, enforced by the API and pre-checked in the UI. */
export const MAX_UPLOAD_FILES = 20;
export const MAX_UPLOAD_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MiB

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
