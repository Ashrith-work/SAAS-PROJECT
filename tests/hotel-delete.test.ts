import "dotenv/config";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Soft-delete / restore behaviour against a real database. We exercise the
// shared core (which takes the actor as a param) directly — no Clerk mock needed
// — plus the agency-scoped proxy's default-exclude filter and the sync filters.

import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant";
import {
  softDeleteHotelCore,
  restoreHotelCore,
  HotelDeleteError,
  type DeleteActor,
} from "@/lib/hotel-delete";

const PREFIX = "TEST_HDEL_";
const uniq = () => `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

let agencyA = "";
let agencyB = "";
let adminA: DeleteActor;
let analystA: DeleteActor;
let adminB: DeleteActor;
let hotelB = ""; // a hotel owned by agency B (cross-agency test)

async function mkAgency(tag: string) {
  const agency = await prisma.agency.create({
    data: {
      name: `${PREFIX}${tag}`,
      email: `${PREFIX.toLowerCase()}${tag}-${uniq()}@example.test`,
      subscriptionStatus: "active",
    },
  });
  const admin = await prisma.agencyMember.create({
    data: { agencyId: agency.id, clerkId: `${PREFIX}admin-${tag}-${uniq()}`, email: `admin-${tag}@t.test`, name: "Admin", role: "admin" },
  });
  const analyst = await prisma.agencyMember.create({
    data: { agencyId: agency.id, clerkId: `${PREFIX}analyst-${tag}-${uniq()}`, email: `analyst-${tag}@t.test`, name: "Analyst", role: "analyst" },
  });
  return {
    agencyId: agency.id,
    admin: { agencyId: agency.id, memberId: admin.id, role: "admin" } as DeleteActor,
    analyst: { agencyId: agency.id, memberId: analyst.id, role: "analyst" } as DeleteActor,
  };
}

async function mkHotel(agencyId: string, name: string) {
  return prisma.hotelClient.create({
    data: {
      agencyId,
      name,
      websiteUrl: "https://example.com",
      contactName: "C",
      contactEmail: "c@t.test",
      siteId: `${PREFIX}site-${uniq()}`,
      conversionMethod: "both",
    },
  });
}

beforeAll(async () => {
  const a = await mkAgency("A");
  const b = await mkAgency("B");
  agencyA = a.agencyId;
  agencyB = b.agencyId;
  adminA = a.admin;
  analystA = a.analyst;
  adminB = b.admin;
  hotelB = (await mkHotel(agencyB, `${PREFIX}B-Hotel`)).id;
});

afterAll(async () => {
  // Cascades delete members/hotels/connections/audit rows for the test agencies.
  await prisma.agency.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("softDeleteHotelCore — authorization + confirmation", () => {
  test("ANALYST cannot soft delete (UNAUTHORIZED)", async () => {
    const h = await mkHotel(agencyA, `${PREFIX}analyst-${uniq()}`);
    await expect(
      softDeleteHotelCore(analystA, { hotelClientId: h.id, confirmationName: h.name }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const row = await prisma.hotelClient.findUnique({ where: { id: h.id }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeNull(); // unchanged
  });

  test("ADMIN with wrong name cannot delete (WRONG_NAME)", async () => {
    const h = await mkHotel(agencyA, `${PREFIX}wrong-${uniq()}`);
    await expect(
      softDeleteHotelCore(adminA, { hotelClientId: h.id, confirmationName: "not the name" }),
    ).rejects.toMatchObject({ code: "WRONG_NAME" });
    const row = await prisma.hotelClient.findUnique({ where: { id: h.id }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeNull();
  });

  test("ADMIN with correct name CAN delete (deletedAt set + reason + actor)", async () => {
    const h = await mkHotel(agencyA, `${PREFIX}ok-${uniq()}`);
    const res = await softDeleteHotelCore(adminA, {
      hotelClientId: h.id,
      confirmationName: h.name,
      reason: "duplicate account",
    });
    expect(res.id).toBe(h.id);
    const row = await prisma.hotelClient.findUnique({
      where: { id: h.id },
      select: { deletedAt: true, deletedByAgencyMemberId: true, deletionReason: true },
    });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.deletedByAgencyMemberId).toBe(adminA.memberId);
    expect(row?.deletionReason).toBe("duplicate account");
  });

  test("already-deleted hotel cannot be deleted again (ALREADY_DELETED)", async () => {
    const h = await mkHotel(agencyA, `${PREFIX}twice-${uniq()}`);
    await softDeleteHotelCore(adminA, { hotelClientId: h.id, confirmationName: h.name });
    await expect(
      softDeleteHotelCore(adminA, { hotelClientId: h.id, confirmationName: h.name }),
    ).rejects.toMatchObject({ code: "ALREADY_DELETED" });
  });

  test("another agency's hotel → NOT_FOUND (no existence leak), not UNAUTHORIZED", async () => {
    await expect(
      softDeleteHotelCore(adminA, { hotelClientId: hotelB, confirmationName: `${PREFIX}B-Hotel` }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // And it must NOT have been touched.
    const row = await prisma.hotelClient.findUnique({ where: { id: hotelB }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeNull();
  });

  test("errors are HotelDeleteError instances", async () => {
    const h = await mkHotel(agencyA, `${PREFIX}type-${uniq()}`);
    await expect(
      softDeleteHotelCore(analystA, { hotelClientId: h.id, confirmationName: h.name }),
    ).rejects.toBeInstanceOf(HotelDeleteError);
  });
});

describe("scoping + sync exclusion", () => {
  test("agencyScoped hotelClient reads exclude deleted by default; includeDeleted/explicit see them", async () => {
    const h = await mkHotel(agencyA, `${PREFIX}scope-${uniq()}`);
    await softDeleteHotelCore(adminA, { hotelClientId: h.id, confirmationName: h.name });

    const scoped = agencyScopedFor(agencyA, prisma.hotelClient);
    const active = await scoped.findMany({ where: { id: h.id } });
    expect(active).toHaveLength(0); // hidden by default

    // Explicit deletedAt filter bypasses the default exclusion.
    const seen = await scoped.findMany({ where: { id: h.id, deletedAt: { not: null } } });
    expect(seen).toHaveLength(1);

    // count() (used by billing quota) also excludes the deleted hotel.
    const activeCount = await scoped.count({ where: { id: h.id } });
    expect(activeCount).toBe(0);
  });

  test("sync queries skip deleted hotels but tokens are NOT revoked (still in DB)", async () => {
    const h = await mkHotel(agencyA, `${PREFIX}sync-${uniq()}`);
    // A live GA4 connection for this hotel.
    const conn = await prisma.ga4Connection.create({
      data: {
        agencyId: agencyA,
        hotelClientId: h.id,
        propertyId: "123456789",
        accessToken: "cipher-access",
        refreshToken: "cipher-refresh",
        tokenExpiresAt: new Date(Date.now() + 3_600_000),
        scope: "analytics.readonly",
        status: "ACTIVE",
      },
    });

    await softDeleteHotelCore(adminA, { hotelClientId: h.id, confirmationName: h.name });

    // The GA4 sync selector (status ACTIVE + hotelClient not deleted) skips it.
    const syncable = await prisma.ga4Connection.findMany({
      where: { status: "ACTIVE", hotelClient: { deletedAt: null }, hotelClientId: h.id },
      select: { id: true },
    });
    expect(syncable).toHaveLength(0);

    // But the connection row is PRESERVED — not revoked or deleted. (accessToken
    // is intentionally stripped from query results by lib/prisma.ts, so the row
    // still existing + still ACTIVE is the assertion that it wasn't touched.)
    const stillThere = await prisma.ga4Connection.findUnique({ where: { id: conn.id }, select: { id: true, status: true } });
    expect(stillThere?.id).toBe(conn.id);
    expect(stillThere?.status).toBe("ACTIVE");
  });
});

describe("restoreHotelCore", () => {
  test("restore clears deletedAt and the hotel is visible again", async () => {
    const h = await mkHotel(agencyA, `${PREFIX}restore-${uniq()}`);
    await softDeleteHotelCore(adminA, { hotelClientId: h.id, confirmationName: h.name });

    const restored = await restoreHotelCore(adminA, h.id);
    expect(restored.id).toBe(h.id);

    const row = await prisma.hotelClient.findUnique({
      where: { id: h.id },
      select: { deletedAt: true, deletedByAgencyMemberId: true },
    });
    expect(row?.deletedAt).toBeNull();
    expect(row?.deletedByAgencyMemberId).toBeNull();

    // Visible again through the default (active-only) scoped read.
    const active = await agencyScopedFor(agencyA, prisma.hotelClient).findMany({ where: { id: h.id } });
    expect(active).toHaveLength(1);
  });

  test("ANALYST cannot restore (UNAUTHORIZED)", async () => {
    const h = await mkHotel(agencyA, `${PREFIX}restore-auth-${uniq()}`);
    await softDeleteHotelCore(adminA, { hotelClientId: h.id, confirmationName: h.name });
    await expect(restoreHotelCore(analystA, h.id)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
