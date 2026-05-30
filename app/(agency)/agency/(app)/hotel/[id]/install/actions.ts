"use server";

import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import {
  classifyConnection,
  detectSnippet,
  fetchHomepage,
  isSafePublicUrl,
  type TestLevel,
} from "@/lib/snippet-test";

// ── Multi-tenant guard ────────────────────────────────────────────────────────
// Scope every lookup by agencyId so one agency can never test another's hotel.
async function ownedHotel(hotelId: string) {
  const member = await getCurrentMember();
  if (!member) return null;
  return agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelId },
    select: { id: true, websiteUrl: true, siteId: true },
  });
}

export type TestConnectionResult = {
  level: TestLevel;
  title: string;
  detail: string;
  // Diagnostics shown under the headline result.
  checkedUrl: string;
  snippetDetected: boolean;
  fetchError: string | null;
  eventsEver: number;
  recentEvents: number; // in the last 30 minutes
  lastEventAt: string | null; // ISO
  lastConversionAt: string | null; // ISO
};

export type TestConnectionState = {
  error: string | null;
  result: TestConnectionResult | null;
};

const RECENT_WINDOW_MS = 30 * 60 * 1000;

export async function testSnippetConnection(
  _prev: TestConnectionState,
  formData: FormData,
): Promise<TestConnectionState> {
  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const hotel = await ownedHotel(hotelId);
  if (!hotel) {
    return { error: "That hotel wasn't found for your agency.", result: null };
  }

  // 1) Look for the snippet in the live homepage HTML.
  const checkedUrl = hotel.websiteUrl;
  let snippetDetected = false;
  let fetchError: string | null = null;
  if (!isSafePublicUrl(checkedUrl)) {
    fetchError = "The saved website URL isn't a valid public address.";
  } else {
    const { html, error } = await fetchHomepage(checkedUrl);
    fetchError = error;
    if (html) snippetDetected = detectSnippet(html, hotel.siteId);
  }

  // 2) Have we actually received events from this hotel (is it firing)?
  const since = new Date(Date.now() - RECENT_WINDOW_MS);
  const events = agencyScoped(prisma.trackingEvent);
  const [eventsEver, recentEvents, lastEvent, lastConversion] = await Promise.all([
    events.count({ where: { hotelClientId: hotel.id } }),
    events.count({ where: { hotelClientId: hotel.id, createdAt: { gte: since } } }),
    events.findFirst({
      where: { hotelClientId: hotel.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    events.findFirst({
      where: { hotelClientId: hotel.id, eventType: "conversion" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  // 3) Combine the two signals into a traffic light.
  const { level, title, detail } = classifyConnection({
    snippetDetected,
    fetchError,
    eventsEver,
    recentEvents,
    checkedUrl,
  });

  return {
    error: null,
    result: {
      level,
      title,
      detail,
      checkedUrl,
      snippetDetected,
      fetchError,
      eventsEver,
      recentEvents,
      lastEventAt: lastEvent?.createdAt.toISOString() ?? null,
      lastConversionAt: lastConversion?.createdAt.toISOString() ?? null,
    },
  };
}
