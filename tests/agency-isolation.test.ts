import "dotenv/config";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "../lib/prisma";

// Verifies the headline multi-tenant security invariant from CLAUDE.md:
// **no query scoped by agencyId can ever return another agency's rows.**
//
// We create two agencies prefixed `TEST_ISO_` (so a partial cleanup never
// touches real demo or onboarded data), populate each with one of every
// tenant-scoped row type, then run the actual query shapes used across the
// app and assert the result set never crosses the tenant line.

const PREFIX = "TEST_ISO_";

type SeedFixture = {
  agencyAId: string;
  agencyBId: string;
  hotelAId: string;
  hotelBId: string;
  contentAId: string;
  contentBId: string;
};

let fx: SeedFixture;

async function seed(): Promise<SeedFixture> {
  // Two agencies, each with one of every tenant-scoped row type.
  const a = await prisma.agency.create({
    data: {
      name: `${PREFIX}A`,
      email: `${PREFIX.toLowerCase()}a@example.test`,
      plan: "starter",
      subscriptionStatus: "active",
    },
    select: { id: true },
  });
  const b = await prisma.agency.create({
    data: {
      name: `${PREFIX}B`,
      email: `${PREFIX.toLowerCase()}b@example.test`,
      plan: "starter",
      subscriptionStatus: "active",
    },
    select: { id: true },
  });

  const hotelA = await prisma.hotelClient.create({
    data: {
      agencyId: a.id,
      name: `${PREFIX}A-Hotel`,
      websiteUrl: "https://test-a.example",
      contactName: "Test A",
      contactEmail: "a@hotel.test",
      siteId: `${PREFIX}site-a-${Date.now()}`,
      conversionMethod: "url_change",
    },
    select: { id: true },
  });
  const hotelB = await prisma.hotelClient.create({
    data: {
      agencyId: b.id,
      name: `${PREFIX}B-Hotel`,
      websiteUrl: "https://test-b.example",
      contactName: "Test B",
      contactEmail: "b@hotel.test",
      siteId: `${PREFIX}site-b-${Date.now()}`,
      conversionMethod: "url_change",
    },
    select: { id: true },
  });

  const contentA = await prisma.contentPiece.create({
    data: {
      agencyId: a.id,
      hotelClientId: hotelA.id,
      title: `${PREFIX}A-content`,
      contentType: "organic",
      platform: "instagram",
      destinationUrl: "https://test-a.example/rooms",
      utmLink: "https://test-a.example/rooms?utm_source=instagram",
    },
    select: { id: true },
  });
  const contentB = await prisma.contentPiece.create({
    data: {
      agencyId: b.id,
      hotelClientId: hotelB.id,
      title: `${PREFIX}B-content`,
      contentType: "organic",
      platform: "instagram",
      destinationUrl: "https://test-b.example/rooms",
      utmLink: "https://test-b.example/rooms?utm_source=instagram",
    },
    select: { id: true },
  });

  await prisma.trackingEvent.createMany({
    data: [
      {
        agencyId: a.id,
        hotelClientId: hotelA.id,
        eventType: "visit",
        utmSource: "instagram",
        utmMedium: "organic",
        utmCampaign: null,
        utmContent: `ht-${contentA.id}`,
        utmTerm: null,
        pageUrl: "https://test-a.example/rooms",
        sessionId: `${PREFIX}sess-a`,
        deviceType: "mobile",
      },
      {
        agencyId: b.id,
        hotelClientId: hotelB.id,
        eventType: "visit",
        utmSource: "instagram",
        utmMedium: "organic",
        utmCampaign: null,
        utmContent: `ht-${contentB.id}`,
        utmTerm: null,
        pageUrl: "https://test-b.example/rooms",
        sessionId: `${PREFIX}sess-b`,
        deviceType: "mobile",
      },
    ],
  });

  return {
    agencyAId: a.id,
    agencyBId: b.id,
    hotelAId: hotelA.id,
    hotelBId: hotelB.id,
    contentAId: contentA.id,
    contentBId: contentB.id,
  };
}

async function cleanup() {
  // Cascades take care of children (HotelClient → events; ContentPiece → events).
  await prisma.agency.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanup(); // safety: clean stale rows from a prior interrupted run
  fx = await seed();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("multi-tenant isolation — agencyId filter must hold", () => {
  test("HotelClient: agency A sees only its hotels", async () => {
    const rows = await prisma.hotelClient.findMany({
      where: { agencyId: fx.agencyAId },
      select: { id: true, agencyId: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.agencyId === fx.agencyAId)).toBe(true);
    expect(rows.some((r) => r.id === fx.hotelBId)).toBe(false);
  });

  test("HotelClient: scoping by id alone is INSUFFICIENT — the app must also filter by agencyId", async () => {
    // This is the attack: agency A asks "give me the hotel with this id". If
    // the code forgets the agencyId, it would happily return B's hotel.
    // The query shape the app uses (findFirst with both filters) protects us.
    const stolen = await prisma.hotelClient.findFirst({
      where: { id: fx.hotelBId, agencyId: fx.agencyAId },
    });
    expect(stolen).toBeNull();
  });

  test("ContentPiece: agency A sees only its content", async () => {
    const rows = await prisma.contentPiece.findMany({
      where: { agencyId: fx.agencyAId },
      select: { id: true, agencyId: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.agencyId === fx.agencyAId)).toBe(true);
    expect(rows.some((r) => r.id === fx.contentBId)).toBe(false);
  });

  test("ContentPiece: cannot fetch B's content under A's agencyId", async () => {
    const stolen = await prisma.contentPiece.findFirst({
      where: { id: fx.contentBId, agencyId: fx.agencyAId },
    });
    expect(stolen).toBeNull();
  });

  test("TrackingEvent: aggregations stay tenant-scoped", async () => {
    const grouped = await prisma.trackingEvent.groupBy({
      by: ["hotelClientId"],
      where: { agencyId: fx.agencyAId },
      _count: { _all: true },
    });
    expect(grouped.length).toBeGreaterThan(0);
    expect(grouped.every((g) => g.hotelClientId === fx.hotelAId)).toBe(true);
  });

  test("TrackingEvent: findMany under agency A returns no B events", async () => {
    const events = await prisma.trackingEvent.findMany({
      where: { agencyId: fx.agencyAId },
      select: { agencyId: true, hotelClientId: true },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.agencyId === fx.agencyAId)).toBe(true);
    expect(events.every((e) => e.hotelClientId === fx.hotelAId)).toBe(true);
  });

  test("Cross-tenant counts are symmetric (A sees A's count; B sees B's count)", async () => {
    const aCount = await prisma.hotelClient.count({ where: { agencyId: fx.agencyAId } });
    const bCount = await prisma.hotelClient.count({ where: { agencyId: fx.agencyBId } });
    expect(aCount).toBeGreaterThan(0);
    expect(bCount).toBeGreaterThan(0);
    // Different agencies — neither count includes the other's rows.
    const cross = await prisma.hotelClient.count({
      where: { agencyId: fx.agencyAId, id: fx.hotelBId },
    });
    expect(cross).toBe(0);
  });
});
