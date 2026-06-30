import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant-scope";
import { clientIpFrom, hashIp } from "@/lib/hotel-share";
import { rateLimit } from "@/lib/ratelimit";
import { HotelDashboardBody } from "@/components/dashboard/HotelDashboardBody";
import { ShareLinkWarningBanner } from "@/components/dashboard/ShareLinkWarningBanner";

// Public, no-login, READ-ONLY hotel dashboard, addressed by an unguessable
// 256-bit share token. It renders the SAME full-depth dashboard the logged-in
// hotel owner sees (shared <HotelDashboardBody>) — Meta Ads spend/ROAS, channel
// deep-dives, Instagram content, revenue by source, journeys, commission saved —
// matching what the agency sees for THIS hotel.
//
// Access + data isolation are enforced entirely here and in the read routes:
//   • The token IS the credential — the hotel is looked up by it directly. An
//     unknown / revoked / soft-deleted token, or a suspended agency, → notFound()
//     (a real HTTP 404; we never reveal which reason).
//   • The page passes the token down to the client fetch components, which attach
//     it as the share-token header. Every /api/hotel/[id]/* read route then
//     authorizes via requireReadAccess → requireShareTokenAccess, which re-checks
//     the token AND that it addresses THIS exact hotel — so no other tenant's data
//     is ever reachable, and a foreign token can't read this hotel.
//   • There are no write routes under /api/hotel/[id]; all mutations require a
//     Clerk session, which the anonymous share session never has. READ-ONLY.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your performance dashboard · HotelTrack",
  robots: { index: false, follow: false }, // shared privately; keep out of search
};

export default async function PublicHotelDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ shareToken: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shareToken } = await params;

  // Per-IP throttle before the token lookup — blunts scraping/enumeration of the
  // token space. Fails CLOSED, surfaced as a neutral 404 (consistent with how
  // this page hides every other access failure).
  const throttle = await rateLimit("hotelOwner", clientIpFrom(await headers()) ?? "anon");
  if (!throttle.ok) notFound();

  // The token IS the credential — look the hotel up by it directly (NOT scoped to
  // a session). We deliberately fetch only this one hotel; no other hotel is ever
  // joined or listed.
  const hotel = await prisma.hotelClient.findUnique({
    where: { shareToken },
    select: {
      id: true,
      agencyId: true,
      name: true,
      shareTokenRevoked: true,
      lastSyncedAt: true,
      snippetStatus: true,
      deletedAt: true,
      agency: {
        select: {
          name: true,
          suspendedAt: true,
          mobile: true,
          contactEmail: true,
          address: true,
          websiteUrl: true,
          whatsappNumber: true,
        },
      },
    },
  });

  // Unknown token, revoked, soft-deleted, or a suspended agency → a real 404 via
  // the not-found boundary. We never reveal which reason, nor another hotel's data.
  if (!hotel || hotel.shareTokenRevoked || hotel.deletedAt || hotel.agency.suspendedAt) {
    notFound();
  }

  // Access audit (hashed IP only). Best-effort: a logging failure must never break
  // the dashboard. Stamped with this hotel's agencyId via the scoped client.
  try {
    const h = await headers();
    await agencyScopedFor(hotel.agencyId, prisma.hotelShareAccess).create({
      data: {
        agencyId: hotel.agencyId, // also stamped by the scoped client; kept for type-safety
        hotelClientId: hotel.id,
        ipHash: hashIp(clientIpFrom(h)),
        userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
      },
    });
  } catch {
    // ignore — a missed access-log row must never block the view
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  return (
    <div className="min-h-screen">
      {/* Dismissible security warning (reappears each browser session). */}
      <ShareLinkWarningBanner hotelName={hotel.name} />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <HotelDashboardBody
          hotelId={hotel.id}
          hotelName={hotel.name}
          agencyId={hotel.agencyId}
          agencyName={hotel.agency.name}
          snippetStatus={hotel.snippetStatus}
          lastSyncedAt={hotel.lastSyncedAt}
          agencyContact={hotel.agency}
          basePath={`/h/${shareToken}`}
          apiBase="/api/hotel"
          shareToken={shareToken}
          rangeParam={one(sp.range)}
          fromParam={one(sp.from)}
          toParam={one(sp.to)}
          channelParam={one(sp.channel)}
          channelBackLabel="← Dashboard"
        />

        <footer className="space-y-1 pt-8 text-center">
          <p className="text-xs text-ink-disabled">
            Powered by HotelTrack — private dashboard for {hotel.name}
          </p>
          <p className="mx-auto max-w-xl text-xs text-ink-disabled">
            This is a private dashboard for {hotel.name}. Do not share this link publicly — anyone
            with the URL can see your hotel&apos;s performance data.
          </p>
        </footer>
      </main>
    </div>
  );
}
