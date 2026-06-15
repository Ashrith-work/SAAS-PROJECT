import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Hotel self-signup. Invite-code generation/uniqueness/regenerate, the public
// signup action (create hotel under the right agency, disabled/invalid/expired
// codes, existing email, agency-member guard, validation), and the hotel-owner
// dashboard authorization (owner vs other hotel vs agency member vs foreign).
// Clerk's Backend SDK + auth() are mocked.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  userId: null as string | null,
  existingEmail: false,
  created: [] as { id: string; role: unknown }[],
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({
    users: {
      getUserList: async () => ({ totalCount: h.existingEmail ? 1 : 0, data: [] }),
      createUser: async (args: { publicMetadata?: { role?: unknown } }) => {
        const id = `user_${randomUUID()}`;
        h.created.push({ id, role: args.publicMetadata?.role });
        return { id };
      },
      updateUserMetadata: async () => ({}),
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/prisma";
import { ensureInviteCode, regenerateInviteCode, setInviteCodeStatus } from "@/lib/hotel-invite";
import { completeHotelSignup, type HotelSignupInput } from "@/app/join/[inviteCode]/actions";
import { resolveHotelForViewer } from "@/lib/hotel-auth";
import { updateHotelDetails } from "@/app/hotel/[hotelClientId]/dashboard/actions";

const PREFIX = "TEST_SS_";

function validInput(inviteCode: string, over: Partial<HotelSignupInput> = {}): HotelSignupInput {
  return {
    inviteCode,
    hotelName: "Test Hotel",
    websiteUrl: "testhotel.com",
    contactName: "Owner Name",
    ownerEmail: `owner-${randomUUID()}@hotel.test`,
    password: "supersecret123",
    ownerPhone: "9876543210",
    address: "123 MG Road, Bengaluru 560001",
    whatsappNumber: "9876543210",
    roomCount: "20",
    channelManager: "djubo",
    otaCommissionRate: "15",
    ...over,
  };
}

let agencyA: string, agencyB: string;
let memberAClerk: string, memberBClerk: string;

beforeAll(async () => {
  await prisma.agency.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const A = await prisma.agency.create({ data: { name: `${PREFIX}Social Hippi`, email: `${PREFIX}a@x.test`, subscriptionStatus: "active" } });
  const B = await prisma.agency.create({ data: { name: `${PREFIX}Other Agency`, email: `${PREFIX}b@x.test`, subscriptionStatus: "active" } });
  agencyA = A.id; agencyB = B.id;
  memberAClerk = `user_A_${randomUUID()}`;
  memberBClerk = `user_B_${randomUUID()}`;
  await prisma.agencyMember.create({ data: { agencyId: A.id, clerkId: memberAClerk, email: "a@m.test", name: "A", role: "admin" } });
  await prisma.agencyMember.create({ data: { agencyId: B.id, clerkId: memberBClerk, email: "b@m.test", name: "B", role: "admin" } });
});

afterAll(async () => {
  await prisma.agency.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

beforeEach(() => { h.userId = null; h.existingEmail = false; });

describe("invite codes", () => {
  test("ensureInviteCode generates SLUG-XXXXXXXX and is idempotent", async () => {
    const first = await ensureInviteCode(agencyA);
    expect(first.code).toMatch(/^[A-Z0-9-]+-[A-Z0-9]{8}$/);
    expect(first.code).toContain("SOCIAL-HIPPI");
    const second = await ensureInviteCode(agencyA);
    expect(second.code).toBe(first.code); // unchanged
  });

  test("codes are unique across agencies", async () => {
    const a = await ensureInviteCode(agencyA);
    const b = await ensureInviteCode(agencyB);
    expect(a.code).not.toBe(b.code);
  });
});

describe("signup", () => {
  test("valid signup creates the hotel under the inviting agency", async () => {
    const { code } = await ensureInviteCode(agencyA);
    const input = validInput(code);
    const res = await completeHotelSignup(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.needsSignIn).toBe(true); // server-created account → sign in next

    const hotel = await prisma.hotelClient.findUnique({ where: { id: res.hotelClientId } });
    expect(hotel?.agencyId).toBe(agencyA);
    expect(hotel?.createdByUserId).toBe(h.created.at(-1)!.id);
    expect(hotel?.channelManager).toBe("djubo");
    expect(Number(hotel?.otaCommissionRate)).toBe(15);
    expect(hotel?.contactEmail).toBe(input.ownerEmail.toLowerCase());
    // The new Clerk user was created with the hotel_client role.
    expect(h.created.at(-1)!.role).toBe("hotel_client");
    // Invite recorded as completed.
    const invite = await prisma.hotelInvite.findFirst({ where: { hotelClientId: res.hotelClientId } });
    expect(invite?.status).toBe("COMPLETED");
    expect(invite?.agencyId).toBe(agencyA);
  });

  test("disabled invite code is rejected (no hotel created)", async () => {
    const { code } = await ensureInviteCode(agencyA);
    await setInviteCodeStatus(agencyA, "DISABLED");
    const before = await prisma.hotelClient.count({ where: { agencyId: agencyA } });
    const res = await completeHotelSignup(validInput(code));
    expect(res.ok).toBe(false);
    const after = await prisma.hotelClient.count({ where: { agencyId: agencyA } });
    expect(after).toBe(before);
    await setInviteCodeStatus(agencyA, "ACTIVE");
  });

  test("unknown invite code is rejected", async () => {
    const res = await completeHotelSignup(validInput("NOPE-ZZZZZZZZ"));
    expect(res.ok).toBe(false);
  });

  test("existing email prompts sign-in instead", async () => {
    const { code } = await ensureInviteCode(agencyA);
    h.existingEmail = true;
    const res = await completeHotelSignup(validInput(code));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.existingEmail).toBe(true);
  });

  test("an agency member cannot convert their account into a hotel", async () => {
    const { code } = await ensureInviteCode(agencyA);
    h.userId = memberAClerk;
    const res = await completeHotelSignup(validInput(code));
    expect(res.ok).toBe(false);
  });

  test("invalid fields return field errors", async () => {
    const { code } = await ensureInviteCode(agencyA);
    const res = await completeHotelSignup(validInput(code, { ownerPhone: "123", websiteUrl: "not a url" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors?.ownerPhone).toBeTruthy();
      expect(res.fieldErrors?.websiteUrl).toBeTruthy();
    }
  });

  test("regenerating the code invalidates the old one", async () => {
    const before = await ensureInviteCode(agencyA);
    const next = await regenerateInviteCode(agencyA);
    expect(next).not.toBe(before.code);
    // Old code no longer resolves to an agency.
    const oldRes = await completeHotelSignup(validInput(before.code));
    expect(oldRes.ok).toBe(false);
    // New code works.
    const newRes = await completeHotelSignup(validInput(next));
    expect(newRes.ok).toBe(true);
  });
});

describe("hotel-owner dashboard authorization", () => {
  let hotelId: string;
  let ownerClerk: string;

  beforeAll(async () => {
    const { code } = await ensureInviteCode(agencyA);
    h.userId = null; h.existingEmail = false;
    const res = await completeHotelSignup(validInput(code, { hotelName: "Authz Hotel" }));
    if (!res.ok) throw new Error("setup signup failed");
    hotelId = res.hotelClientId;
    ownerClerk = h.created.at(-1)!.id;
  });

  test("the owner can view + edit their hotel", async () => {
    h.userId = ownerClerk;
    const viewer = await resolveHotelForViewer(hotelId);
    expect(viewer).not.toBeNull();
    expect(viewer!.isOwner).toBe(true);
    expect(viewer!.canEdit).toBe(true);
  });

  test("another hotel owner cannot view this hotel", async () => {
    h.userId = `user_other_${randomUUID()}`;
    expect(await resolveHotelForViewer(hotelId)).toBeNull();
  });

  test("an agency member of the owning agency can view (read-only)", async () => {
    h.userId = memberAClerk;
    const viewer = await resolveHotelForViewer(hotelId);
    expect(viewer).not.toBeNull();
    expect(viewer!.isOwner).toBe(false);
    expect(viewer!.canEdit).toBe(false);
  });

  test("a member of a DIFFERENT agency cannot view it", async () => {
    h.userId = memberBClerk;
    expect(await resolveHotelForViewer(hotelId)).toBeNull();
  });

  test("only the owner can edit details", async () => {
    h.userId = memberAClerk; // agency member — read-only
    const denied = await updateHotelDetails(hotelId, {
      contactName: "X", contactEmail: "x@x.com", contactPhone: "9876543210",
      whatsappNumber: "9876543210", address: "123 MG Road, City 560001", otaCommissionRate: "20", channelManager: "eZee",
    });
    expect(denied.ok).toBe(false);

    h.userId = ownerClerk;
    const ok = await updateHotelDetails(hotelId, {
      contactName: "Updated Owner", contactEmail: "updated@hotel.test", contactPhone: "9876543210",
      whatsappNumber: "9000000000", address: "456 New Road, City 560002", otaCommissionRate: "12", channelManager: "eZee",
    });
    expect(ok.ok).toBe(true);
    const hotel = await prisma.hotelClient.findUnique({ where: { id: hotelId } });
    expect(hotel?.contactName).toBe("Updated Owner");
    expect(hotel?.channelManager).toBe("eZee");
    // OTA commission rate is now AGENCY-managed: the owner edit must NOT change it
    // (it stays at the signup value of 15, never the submitted 12).
    expect(Number(hotel?.otaCommissionRate)).toBe(15);
  });
});
