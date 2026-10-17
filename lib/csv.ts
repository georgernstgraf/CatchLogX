// CSV helpers for the SQL query export (#119).

// Leading characters that spreadsheet apps interpret as the start of a formula.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
// Plain numeric strings (e.g. Postgres decimals serialized as text) are not formulas.
const NUMERIC_STRING = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/**
 * Escapes a single value for a CSV cell.
 * Neutralizes formula injection (OWASP) by prefixing `'` to strings that start
 * with a formula trigger, then quotes values containing separators or quotes.
 */
export function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number" || typeof val === "bigint") return String(val);

  let str = String(val);
  if (FORMULA_TRIGGER.test(str) && !NUMERIC_STRING.test(str)) {
    str = "'" + str;
  }
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
