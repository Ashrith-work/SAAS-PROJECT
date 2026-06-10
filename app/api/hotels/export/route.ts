import * as XLSX from "xlsx";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { csvResponse, slugForFile, toCsv } from "@/lib/csv";
import { sanitizeRows } from "@/lib/xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mirrors /agency/hotels — one row per hotel with the same columns visible on
// the page, plus a couple of small extras that are useful in a spreadsheet
// (websiteUrl, agency-internal id).

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();

  const hotels = await agencyScoped(prisma.hotelClient).findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      contactName: true,
      contactEmail: true,
      snippetStatus: true,
      lastEventAt: true,
      createdAt: true,
    },
  });

  const rows = hotels.map((h) => ({
    Hotel: h.name,
    Website: h.websiteUrl,
    Contact: h.contactName,
    "Contact Email": h.contactEmail,
    "Snippet Status": h.snippetStatus,
    "Last Event": h.lastEventAt ? h.lastEventAt.toISOString().slice(0, 19).replace("T", " ") : "",
    Created: h.createdAt.toISOString().slice(0, 10),
  }));

  const baseName = `hotels-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    return csvResponse(toCsv(rows), `${slugForFile(baseName)}.csv`);
  }

  const ws = XLSX.utils.json_to_sheet(
    sanitizeRows(
      rows.length
        ? rows
        : [
            {
              Hotel: "",
              Website: "",
              Contact: "",
              "Contact Email": "",
              "Snippet Status": "",
              "Last Event": "",
              Created: "",
            },
          ],
    ),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hotels");
  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slugForFile(baseName)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
