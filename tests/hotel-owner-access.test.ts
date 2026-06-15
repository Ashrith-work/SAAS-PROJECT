import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Hotel-owner FULL-visibility access. Verifies that a hotel owner can read their
// OWN hotel's rich data through the /api/hotel/[hotelClientId]/* routes (Meta Ads
// spend/CTR/ROAS, owner-metrics, revenue-by-source, savings, summary), while
// being denied any OTHER hotel — same agency or not — and that no agency-only
// surface leaks (tokens, cross-hotel data, agencyId mutation, OTA rate edits).
//
// auth() is mocked (the route auth helper reads it); the data loaders run under
// runWithAgencyScope, which needs no session. A live DB holds the fixtures.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: h.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/prisma";
import { requireHotelOwnerAccess } from "@/lib/hotel-auth";
import { updateHotelDetails } from "@/app/hotel/[hotelClientId]/dashboard/actions";
import { GET as channelViewGET } from "@/app/api/hotel/[hotelClientId]/channel-view/route";
import { GET as ownerMetricsGET } from "@/app/api/hotel/[hotelClientId]/owner-metrics/route";
import { GET as summaryGET } from "@/app/api/hotel/[hotelClientId]/summary/route";
import { GET as revenueGET } from "@/app/api/hotel/[hotelClientId]/revenue-by-source/route";
import { GET as savingsGET } from "@/app/api/hotel/[hotelClientId]/savings/route";

const PREFIX = "TEST_HOA_";
const loginAs = (id: string | null) => { h.userId = id; };
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const WINDOW = `startDate=${ymd(day(-14))}&endDate=${ymd(day(1))}`;

function call(
  GET: (req: Request, ctx: { params: Promise<{ hotelClientId: string }> }) => Promise<Response>,
  hotelClientId: string,
  query = WINDOW,
) {
  return GET(new Request(`http://localhost/api/hotel/${hotelClientId}/x?${query}`), {
    params: Promise.resolve({ hotelClientId }),
  });
}

async function mkAgency(t: string) {
  return prisma.agency.create({ data: { name: `${PREFIX}${t}`, email: `${PREFIX.toLowerCase()}${t}@x.test`, subscriptionStatus: "active" } });
}
async function mkHotel(agencyId: string, t: string, ownerUserId: string) {
  return prisma.hotelClient.create({
    data: {
      agencyId, name: `${PREFIX}${t}`, websiteUrl: "https://h.example", contactName: "C", contactEmail: "c@t.local",
      siteId: `${PREFIX}s-${t}-${randomUUID()}`, conversionMethod: "both", createdByUserId: ownerUserId,
      otaCommissionRate: "15.00",
    },
  });
}

let agencyA: string, agencyB: string;
let ownerA1: string, ownerA2: string, memberAClerk: string, memberBClerk: string;
let hotelA1: string, hotelA2: string;

beforeAll(async () => {
  await prisma.agency.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const A = await mkAgency("AgencyA");
  const B = await mkAgency("AgencyB");
  agencyA = A.id; agencyB = B.id;

  ownerA1 = `user_ownerA1_${randomUUID()}`;
  ownerA2 = `user_ownerA2_${randomUUID()}`;
  memberAClerk = `user_memberA_${randomUUID()}`;
  memberBClerk = `user_memberB_${randomUUID()}`;
  await prisma.agencyMember.create({ data: { agencyId: A.id, clerkId: memberAClerk, email: "a@m.test", name: "A", role: "admin" } });
  await prisma.agencyMember.create({ data: { agencyId: B.id, clerkId: memberBClerk, email: "b@m.test", name: "B", role: "admin" } });

  const hA1 = await mkHotel(agencyA, "HotelA1", ownerA1);
  const hA2 = await mkHotel(agencyA, "HotelA2", ownerA2);
  hotelA1 = hA1.id; hotelA2 = hA2.id;

  // Give hotelA1 real Meta spend + a Meta-attributed booking inside the window.
  await prisma.adSnapshot.create({
    data: {
      agencyId: agencyA, hotelClientId: hotelA1, metaAccountId: "act_test", date: day(-3),
      spend: "1000.00", impressions: 10000, reach: 8000, clicks: 200, ctr: 2, cpc: "5", cpm: "100",
      conversions: 4, roas: 3, pixelPurchases: 0, pixelLeads: 0, pixelPageViews: 0,
    },
  });
  await prisma.trackingEvent.create({
    data: {
      agencyId: agencyA, hotelClientId: hotelA1, eventType: "conversion", pageUrl: "https://h/thx",
      conversionValue: "3000.00", sessionId: `s_${randomUUID()}`, deviceType: "desktop", utmSource: "facebook",
      utmMedium: "paid", utmCampaign: "Summer", createdAt: day(-3),
    },
  });
});

afterAll(async () => {
  await prisma.agency.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

beforeEach(() => { h.userId = null; });

describe("requireHotelOwnerAccess", () => {
  test("the owner is granted access, scoped to their agency", async () => {
    loginAs(ownerA1);
    const a = await requireHotelOwnerAccess(hotelA1);
    expect(a).not.toBeNull();
    expect(a!.agencyId).toBe(agencyA);
    expect(a!.hotelId).toBe(hotelA1);
    expect(a!.isOwner).toBe(true);
    expect(a!.isAgencyMember).toBe(false);
  });

  test("a hotel owner cannot access a DIFFERENT hotel in the same agency", async () => {
    loginAs(ownerA1);
    expect(await requireHotelOwnerAccess(hotelA2)).toBeNull();
  });

  test("an agency member of the owning agency is granted (as member, not owner)", async () => {
    loginAs(memberAClerk);
    const a = await requireHotelOwnerAccess(hotelA1);
    expect(a).not.toBeNull();
    expect(a!.isOwner).toBe(false);
    expect(a!.isAgencyMember).toBe(true);
    expect(a!.agencyId).toBe(agencyA);
  });

  test("a member of a DIFFERENT agency is denied", async () => {
    loginAs(memberBClerk);
    expect(await requireHotelOwnerAccess(hotelA1)).toBeNull();
  });

  test("a signed-out request is denied", async () => {
    loginAs(null);
    expect(await requireHotelOwnerAccess(hotelA1)).toBeNull();
  });
});

describe("hotel-owner data routes — own hotel", () => {
  test("owner sees full Meta Ads spend / CTR / ROAS / campaigns", async () => {
    loginAs(ownerA1);
    const res = await call(channelViewGET, hotelA1, `channel=meta_ads&${WINDOW}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.channelName).toBe("Meta Ads");
    expect(body.hasData).toBe(true);
    expect(body.kpis.totalSpend).toBeGreaterThan(0);
    expect(body.kpis.ctr).toBeGreaterThan(0);
    expect(Array.isArray(body.topCampaigns)).toBe(true);
  });

  test("owner sees their full owner-metrics (marketing spend present)", async () => {
    loginAs(ownerA1);
    const res = await call(ownerMetricsGET, hotelA1);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.marketingSpend.meta).toBeGreaterThan(0);
    expect(body.meta.metaConnected).toBe(true);
  });

  test("owner sees revenue-by-source and savings and summary", async () => {
    loginAs(ownerA1);
    const rbs = await call(revenueGET, hotelA1, `granularity=source&${WINDOW}`);
    expect(rbs.status).toBe(200);
    const rbsBody = await rbs.json();
    expect(rbsBody.hotelId).toBe(hotelA1);
    const sav = await call(savingsGET, hotelA1);
    expect(sav.status).toBe(200);
    const sum = await call(summaryGET, hotelA1, "period=30d");
    expect(sum.status).toBe(200);
  });

  test("no raw Meta token (or any token) appears in a data response", async () => {
    loginAs(ownerA1);
    const res = await call(channelViewGET, hotelA1, `channel=meta_ads&${WINDOW}`);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/accessToken|access_token|"token"|encryptedToken/i);
  });
});

describe("hotel-owner data routes — isolation (403)", () => {
  test("owner CANNOT read a different hotel in the same agency", async () => {
    loginAs(ownerA1);
    for (const GET of [channelViewGET, ownerMetricsGET, summaryGET, savingsGET, revenueGET]) {
      const res = await call(GET, hotelA2, `channel=meta_ads&${WINDOW}`);
      expect(res.status).toBe(403);
    }
  });

  test("the other owner CANNOT read hotelA1", async () => {
    loginAs(ownerA2);
    const res = await call(ownerMetricsGET, hotelA1);
    expect(res.status).toBe(403);
  });

  test("a different agency's member CANNOT read hotelA1", async () => {
    loginAs(memberBClerk);
    const res = await call(channelViewGET, hotelA1, `channel=meta_ads&${WINDOW}`);
    expect(res.status).toBe(403);
  });

  test("a signed-out request is rejected", async () => {
    loginAs(null);
    const res = await call(ownerMetricsGET, hotelA1);
    expect(res.status).toBe(403);
  });
});

describe("hotel-owner edits", () => {
  test("owner can update their own contact info", async () => {
    loginAs(ownerA1);
    const r = await updateHotelDetails(hotelA1, {
      contactName: "New Owner Name", contactEmail: "new@hotel.test", contactPhone: "9876543210",
      whatsappNumber: "9000000000", address: "456 New Road, City 560002", otaCommissionRate: "5", channelManager: "eZee",
    });
    expect(r.ok).toBe(true);
    const hotel = await prisma.hotelClient.findUnique({ where: { id: hotelA1 } });
    expect(hotel?.contactName).toBe("New Owner Name");
    expect(hotel?.channelManager).toBe("eZee");
  });

  test("owner CANNOT change the OTA commission rate (agency-managed)", async () => {
    loginAs(ownerA1);
    const before = await prisma.hotelClient.findUnique({ where: { id: hotelA1 }, select: { otaCommissionRate: true } });
    await updateHotelDetails(hotelA1, {
      contactName: "New Owner Name", contactEmail: "new@hotel.test", contactPhone: "9876543210",
      whatsappNumber: "9000000000", address: "456 New Road, City 560002", otaCommissionRate: "1", channelManager: "eZee",
    });
    const after = await prisma.hotelClient.findUnique({ where: { id: hotelA1 }, select: { otaCommissionRate: true } });
    expect(Number(after?.otaCommissionRate)).toBe(Number(before?.otaCommissionRate));
    expect(Number(after?.otaCommissionRate)).not.toBe(1);
  });

  test("owner CANNOT edit a hotel they don't own", async () => {
    loginAs(ownerA1);
    const r = await updateHotelDetails(hotelA2, {
      contactName: "Hijack", contactEmail: "x@x.com", contactPhone: "9876543210",
      whatsappNumber: "9000000000", address: "456 New Road, City 560002", otaCommissionRate: "5", channelManager: "eZee",
    });
    expect(r.ok).toBe(false);
  });
});
