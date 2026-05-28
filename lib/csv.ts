// Tiny CSV serializer. RFC 4180-ish: comma separator, CRLF line endings, fields
// containing comma/quote/newline are wrapped in double quotes with embedded
// quotes doubled. Dates → ISO; null/undefined → empty string; numbers → as-is.

type CellValue = string | number | boolean | Date | null | undefined;

function escapeCell(v: CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  const s = typeof v === "string" ? v : String(v);
  if (s === "") return "";
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: ReadonlyArray<Record<string, CellValue>>, headers?: readonly string[]): string {
  const cols = headers ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  const out: string[] = [];
  out.push(cols.map(escapeCell).join(","));
  for (const row of rows) {
    out.push(cols.map((c) => escapeCell(row[c])).join(","));
  }
  return out.join("\r\n");
}

export function csvResponse(body: string, filename: string): Response {
  // Prepend UTF-8 BOM so Excel opens non-ASCII correctly.
  return new Response("﻿" + body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function slugForFile(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "export";
}
