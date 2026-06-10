import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { toCsv } from "@/lib/csv";
import {
  neutralizeFormula,
  sanitizeForSpreadsheet,
  sanitizeRows,
  sanitizeAoa,
} from "@/lib/xlsx";

// ─────────────────────────────────────────────────────────────────────────────
// Security regression test for audit finding H-1: CSV / Excel formula injection.
//
// User-controlled strings (UTM source/medium/campaign/content, page URLs) flow
// from the unauthenticated /api/track/event ingest into agency CSV/XLSX exports.
// Excel / Sheets execute a cell whose text starts with `= + - @` (or TAB/CR) as a
// FORMULA. These tests prove the export layer neutralizes that: such values are
// emitted as INERT TEXT (prefixed with a single quote), never as a live formula.
// ─────────────────────────────────────────────────────────────────────────────

// The exact attacker payloads from the audit / fix brief (URL-decoded).
const ATTACK_PAYLOADS = [
  `=HYPERLINK("https://malicious.com","Click here")`,
  `=CMD|'/c calc'!A1`,
  `+HYPERLINK("https://evil.example","x")`,
  `-2+5+cmd|'/c calc'!A0`,
  `@SUM(A1:A10)`,
  "\t=1+1", // leading TAB then formula
  "\r=1+1", // leading CR then formula
];

const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

describe("neutralizeFormula / sanitizeForSpreadsheet", () => {
  it("prefixes a single quote to every value starting with a formula trigger", () => {
    for (const t of FORMULA_TRIGGERS) {
      const input = `${t}EVIL`;
      expect(neutralizeFormula(input)).toBe(`'${input}`);
    }
  });

  it("neutralizes each real attacker payload", () => {
    for (const payload of ATTACK_PAYLOADS) {
      const out = neutralizeFormula(payload);
      expect(out.startsWith("'")).toBe(true);
      // The original text is preserved verbatim after the guarding quote.
      expect(out.slice(1)).toBe(payload);
    }
  });

  it("leaves safe strings untouched", () => {
    for (const safe of ["instagram", "facebook", "https://hotel.example/book", "Summer Sale"]) {
      expect(neutralizeFormula(safe)).toBe(safe);
      expect(sanitizeForSpreadsheet(safe)).toBe(safe);
    }
  });

  it("never coerces non-strings (numbers/dates/booleans keep their native type)", () => {
    // A negative NUMBER must stay a number — prefixing it would corrupt the data.
    expect(sanitizeForSpreadsheet(-5)).toBe(-5);
    expect(sanitizeForSpreadsheet(0)).toBe(0);
    expect(sanitizeForSpreadsheet(true)).toBe(true);
    const d = new Date("2026-06-10T00:00:00.000Z");
    expect(sanitizeForSpreadsheet(d)).toBe(d);
    expect(sanitizeForSpreadsheet(null)).toBe(null);
  });
});

describe("CSV export (toCsv)", () => {
  it("emits attacker payloads as quoted, neutralized text — no cell begins with a bare trigger", () => {
    const rows = ATTACK_PAYLOADS.map((p) => ({ Source: p, Visits: 3 }));
    const csv = toCsv(rows);
    const dataLines = csv.split("\r\n").slice(1); // drop the header row

    for (const line of dataLines) {
      // Every data line is `<cell>,3`. The first character of the serialized
      // record must NOT be a formula trigger — it is either `'` (neutralized,
      // unquoted) or `"` (RFC-4180 quoted, with the `'` inside).
      expect(FORMULA_TRIGGERS).not.toContain(line[0]);
    }

    // The dangerous text is still present (as data), just defused with a quote.
    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv).toContain(`'@SUM(A1:A10)`);
    // A numeric column stays numeric (not quoted / not prefixed).
    expect(csv).toContain(",3");
  });

  it("preserves RFC-4180 quoting for values containing commas/quotes", () => {
    const csv = toCsv([{ V: `=HYPERLINK("a,b","c")` }]);
    // Neutralized AND quoted, with embedded quotes doubled.
    expect(csv.split("\r\n")[1]).toBe(`"'=HYPERLINK(""a,b"",""c"")"`);
  });
});

// Round-trips a sheet through the real `xlsx` library and returns the parsed cell
// at the given address (e.g. "A2") so we can inspect its true type/value/formula.
function roundTripCell(rows: Record<string, unknown>[], address: string) {
  const ws = XLSX.utils.json_to_sheet(sanitizeRows(rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "S");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const parsed = XLSX.read(buf, { type: "buffer" });
  return parsed.Sheets["S"]![address];
}

describe("XLSX export round-trip (real xlsx library)", () => {
  it("writes attacker payloads as STRING cells with no formula", () => {
    ATTACK_PAYLOADS.forEach((payload) => {
      const cell = roundTripCell([{ Source: payload }], "A2");
      // t === "s" → a text cell. `.f` (formula) must be absent.
      expect(cell.t).toBe("s");
      expect(cell.f).toBeUndefined();
      // The stored value is the neutralized (quote-prefixed) text.
      expect(typeof cell.v).toBe("string");
      expect((cell.v as string).startsWith("'")).toBe(true);
      // It does NOT begin with a live formula trigger.
      expect(FORMULA_TRIGGERS).not.toContain((cell.v as string)[0]);
    });
  });

  it("keeps numeric cells numeric (no corruption of legitimate values)", () => {
    const cell = roundTripCell([{ Revenue: -1250.5 }], "A2");
    expect(cell.t).toBe("n");
    expect(cell.v).toBe(-1250.5);
    expect(cell.f).toBeUndefined();
  });

  it("sanitizeAoa neutralizes array-of-arrays cells used by summary sheets", () => {
    const aoa = sanitizeAoa([
      ["Agency", `=cmd|'/c calc'!A1`],
      ["Revenue", -42],
    ]);
    expect(aoa[0]![1]).toBe(`'=cmd|'/c calc'!A1`);
    expect(aoa[1]![1]).toBe(-42); // number untouched
  });
});
