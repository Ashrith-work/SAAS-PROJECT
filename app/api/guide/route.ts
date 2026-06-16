import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgencyContext, agencyScopedFor } from "@/lib/tenant";

// Serves the static setup-guide PDF with a friendly download filename and logs
// each request to GuideDownload so guide usage can be reported later.
//
// This route is for the authenticated agency surfaces (the "Send setup guide to
// hotel" modal). The fully-public /setup-guide pages link straight to the static
// /docs/…pdf instead, since there is no agency to attribute those downloads to.

export const runtime = "nodejs";

const PDF_PATH = path.join(
  process.cwd(),
  "public",
  "docs",
  "HotelTrack_Integration_Guide.pdf",
);
const DOWNLOAD_NAME = "HotelTrack-Integration-Guide.pdf";

const METHODS = ["direct", "link", "email"] as const;
type Method = (typeof METHODS)[number];

function parseMethod(value: string | null): Method {
  return (METHODS as readonly string[]).includes(value ?? "")
    ? (value as Method)
    : "direct";
}

export async function GET(request: NextRequest) {
  const method = parseMethod(request.nextUrl.searchParams.get("method"));
  const requestedHotelId = request.nextUrl.searchParams.get("hotelClientId");

  // Resolve the signed-in agency. If there's no agency context (signed out, or a
  // super-admin with no single agency), we still serve the file for `direct` but
  // skip the analytics row — there's nothing to attribute it to.
  let agencyId: string | null = null;
  try {
    ({ agencyId } = await getAgencyContext());
  } catch {
    agencyId = null;
  }

  if (agencyId) {
    // Only attribute to a hotel that actually belongs to this agency. Scope each
    // delegate individually — agencyScopedFor wraps a single model, not the client.
    let hotelClientId: string | null = null;
    if (requestedHotelId) {
      const hotel = await agencyScopedFor(agencyId, prisma.hotelClient).findFirst({
        where: { id: requestedHotelId },
        select: { id: true },
      });
      hotelClientId = hotel?.id ?? null;
    }

    // Best-effort: a logging failure must never block the download itself.
    try {
      await agencyScopedFor(agencyId, prisma.guideDownload).create({
        data: { agencyId, hotelClientId, method },
      });
    } catch {
      // swallow — analytics is non-critical
    }
  }

  // link / email shares only need tracking, not the file payload.
  if (method !== "direct") {
    return new NextResponse(null, { status: 204 });
  }

  let pdf: Buffer;
  try {
    pdf = await readFile(PDF_PATH);
  } catch {
    return new NextResponse("Setup guide is temporarily unavailable.", {
      status: 404,
    });
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${DOWNLOAD_NAME}"`,
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
