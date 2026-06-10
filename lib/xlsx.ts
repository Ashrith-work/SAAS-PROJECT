// Spreadsheet formula-injection (a.k.a. CSV injection) neutralization.
//
// Excel / LibreOffice / Google Sheets treat a cell whose text begins with one of
// `= + - @` (or a leading TAB / CR) as a FORMULA. User-controlled strings —
// UTM source/medium/campaign/content, page/referrer URLs, hotel & campaign names —
// flow from the unauthenticated tracking ingest and third-party APIs into the
// CSV/XLSX exports an agency downloads. Without neutralization, a value like
// `=HYPERLINK("https://evil.example","Click")` or `=cmd|'/c calc'!A1` executes
// when the agency opens the file. See SECURITY audit H-1.
//
// Mitigation (OWASP): prefix any value starting with a formula trigger with a
// single quote so the spreadsheet treats it as literal text, never a formula.
// Only STRINGS are touched — numbers/dates/booleans are never formulas, and
// prefixing a numeric value (e.g. -5) would corrupt it into text.

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Prefix a string with `'` when it begins with a spreadsheet formula trigger. */
export function neutralizeFormula(str: string): string {
  if (str.length > 0 && FORMULA_TRIGGERS.has(str[0]!)) return "'" + str;
  return str;
}

/**
 * Make a single cell value safe to write to a spreadsheet. Strings are
 * formula-neutralized; every other type (number, Date, boolean, null) is
 * returned unchanged so numeric/date cells keep their native type.
 */
export function sanitizeForSpreadsheet<T>(value: T): T {
  return (typeof value === "string" ? neutralizeFormula(value) : value) as T;
}

/**
 * Sanitize every string value in an array of row objects — the shape passed to
 * `XLSX.utils.json_to_sheet`. Object KEYS (column headers) are developer-defined
 * constants and are left untouched; only the VALUES are neutralized.
 */
export function sanitizeRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(row)) out[key] = sanitizeForSpreadsheet(row[key]);
    return out;
  });
}

/**
 * Sanitize every string cell in an array-of-arrays — the shape passed to
 * `XLSX.utils.aoa_to_sheet`.
 */
export function sanitizeAoa<T>(rows: T[][]): T[][] {
  return rows.map((row) => row.map((cell) => sanitizeForSpreadsheet(cell)));
}
