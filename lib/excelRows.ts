/**
 * Reading the `DATA` sheet of an upload (#88, #202).
 *
 * The validation and the import must read a file **identically** — the
 * production duplicates came from two parsers with different options
 * (`cellDates`, object vs. array rows, no stop at the first empty row). Both
 * sides therefore go through {@link readDataRows}.
 */

import * as XLSX from "xlsx";

export type CellValue = string | number | boolean | Date | null | undefined;
export type SheetRow = CellValue[];
export type DataObject = Record<string, CellValue>;

/** Row where every cell is null, undefined or a blank string. */
export const isEmptyRow = (row: SheetRow): boolean =>
  row.every(
    (cell) =>
      cell === null ||
      cell === undefined ||
      (typeof cell === "string" && cell.trim() === ""),
  );

/** Renders a cell for messages and for the date key of the PIT check. */
export const cellToText = (value: CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

/** Maps array rows to header-keyed objects, cut at the first empty row. */
export function toDataObjects(
  headers: string[],
  table: SheetRow[],
): DataObject[] {
  const rows: DataObject[] = [];

  for (let i = 1; i < table.length; i++) {
    if (isEmptyRow(table[i])) break;

    const row: DataObject = {};
    headers.forEach((header, index) => {
      row[header] = table[i][index];
    });
    rows.push(row);
  }

  return rows;
}

/** The `DATA` sheet as header-keyed objects, cut at the first empty row. */
export type DataSheet = {
  headers: string[];
  rows: DataObject[];
};

/**
 * Reads the `DATA` sheet with the options the validator uses.
 *
 * `cellDates` keeps real dates as `Date` objects (Excel serials would otherwise
 * arrive as numbers), and `dense` stores rows as arrays — ~2x faster and ~35 %
 * less peak memory on the BOKU bulk (247k rows, #132).
 */
export function readDataRows(buffer: Buffer): DataSheet {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: true });
  } catch {
    return { headers: [], rows: [] };
  }

  const sheet = workbook.Sheets["DATA"];
  if (!sheet) return { headers: [], rows: [] };

  const table = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
  }) as SheetRow[];

  const headers = ((table[0] as string[]) ?? []).map(String);
  return { headers, rows: toDataObjects(headers, table) };
}
