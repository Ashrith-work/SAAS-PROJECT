"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { normalizeCode, COUPON_STATUSES, type CouponStatus } from "@/lib/coupon";

// Server actions for the Influencers & Coupons admin (Phase R2). Every write is
// agencyScoped + ownership-checked. Manual redemption logging is a separate API
// route (it needs an HTTP 404 for cross-agency). Results are a simple
// { ok, error?, id? } so the client components can show inline errors.

export type ActionResult = { ok: boolean; error?: string; id?: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const REVALIDATE = "/agency/influencers";

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}

// ── Influencers ───────────────────────────────────────────────────────────────

export type InfluencerInput = {
  name: string;
  instagramHandle?: string | null;
  notes?: string | null;
  hotelClientId?: string | null; // null = agency-wide
};

async function assertHotel(hotelClientId: string | null | undefined): Promise<boolean> {
  if (!hotelClientId) return true; // agency-wide is allowed
  const h = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelClientId },
    select: { id: true },
  });
  return !!h;
}

export async function createInfluencer(input: InfluencerInput): Promise<ActionResult> {
  const member = await getCurrentMember();
  if (!member) return fail("Your session has expired — please sign in again.");
  const name = (input.name ?? "").trim();
  if (!name) return fail("Influencer name is required.");
  if (!(await assertHotel(input.hotelClientId))) return fail("That hotel wasn't found for your agency.");

  const created = await agencyScoped(prisma.influencer).create({
    data: {
      agencyId: member.agencyId, // re-stamped by agencyScoped; satisfies the type
      name,
      instagramHandle: input.instagramHandle?.trim() || null,
      notes: input.notes?.trim() || null,
      hotelClientId: input.hotelClientId || null,
    },
    select: { id: true },
  });
  revalidatePath(REVALIDATE);
  return { ok: true, id: created.id };
}

export async function updateInfluencer(id: string, input: InfluencerInput): Promise<ActionResult> {
  const member = await getCurrentMember();
  if (!member) return fail("Your session has expired — please sign in again.");
  const name = (input.name ?? "").trim();
  if (!name) return fail("Influencer name is required.");
  if (!(await assertHotel(input.hotelClientId))) return fail("That hotel wasn't found for your agency.");

  // agencyScoped update applies agencyId as an extra filter → cross-tenant id throws.
  try {
    await agencyScoped(prisma.influencer).update({
      where: { id },
      data: {
        name,
        instagramHandle: input.instagramHandle?.trim() || null,
        notes: input.notes?.trim() || null,
        hotelClientId: input.hotelClientId || null,
      },
    });
  } catch {
    return fail("Influencer not found.");
  }
  revalidatePath(REVALIDATE);
  return { ok: true, id };
}

export async function setInfluencerArchived(id: string, archived: boolean): Promise<ActionResult> {
  const member = await getCurrentMember();
  if (!member) return fail("Your session has expired — please sign in again.");
  try {
    await agencyScoped(prisma.influencer).update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
  } catch {
    return fail("Influencer not found.");
  }
  revalidatePath(REVALIDATE);
  return { ok: true, id };
}

// ── Coupon codes ──────────────────────────────────────────────────────────────

export type CouponInput = {
  code: string;
  influencerId: string;
  hotelClientId: string;
  discountType?: string | null; // 'percentage' | 'flat' | null
  discountValue?: string | number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
};

const DISCOUNT_TYPES = new Set(["percentage", "flat"]);

async function validateCouponRefs(
  influencerId: string,
  hotelClientId: string,
): Promise<string | null> {
  const [inf, hotel] = await Promise.all([
    agencyScoped(prisma.influencer).findFirst({ where: { id: influencerId }, select: { id: true } }),
    agencyScoped(prisma.hotelClient).findFirst({ where: { id: hotelClientId }, select: { id: true } }),
  ]);
  if (!inf) return "Choose an influencer that belongs to your agency.";
  if (!hotel) return "Choose a hotel that belongs to your agency.";
  return null;
}

function couponData(input: CouponInput) {
  const discountType = input.discountType && DISCOUNT_TYPES.has(input.discountType) ? input.discountType : null;
  const dv = input.discountValue == null || input.discountValue === "" ? null : Number(input.discountValue);
  return {
    discountType,
    discountValue: dv != null && Number.isFinite(dv) ? dv.toFixed(2) : null,
    validFrom: parseDate(input.validFrom),
    validUntil: parseDate(input.validUntil),
    notes: input.notes?.trim() || null,
  };
}

export async function createCoupon(input: CouponInput): Promise<ActionResult> {
  const member = await getCurrentMember();
  if (!member) return fail("Your session has expired — please sign in again.");
  const code = normalizeCode(input.code);
  if (!code) return fail("Coupon code is required.");
  if (!input.influencerId) return fail("Choose an influencer.");
  if (!input.hotelClientId) return fail("Choose a hotel.");
  const refErr = await validateCouponRefs(input.influencerId, input.hotelClientId);
  if (refErr) return fail(refErr);

  try {
    const created = await agencyScoped(prisma.couponCode).create({
      data: {
        agencyId: member.agencyId, // re-stamped by agencyScoped; satisfies the type
        code,
        influencerId: input.influencerId,
        hotelClientId: input.hotelClientId,
        status: "ACTIVE",
        ...couponData(input),
      },
      select: { id: true },
    });
    revalidatePath(REVALIDATE);
    return { ok: true, id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail(`Code "${code}" already exists for this hotel.`);
    }
    return fail("Could not create the coupon code.");
  }
}

export async function updateCoupon(id: string, input: CouponInput): Promise<ActionResult> {
  const member = await getCurrentMember();
  if (!member) return fail("Your session has expired — please sign in again.");
  const code = normalizeCode(input.code);
  if (!code) return fail("Coupon code is required.");
  const refErr = await validateCouponRefs(input.influencerId, input.hotelClientId);
  if (refErr) return fail(refErr);

  try {
    await agencyScoped(prisma.couponCode).update({
      where: { id },
      data: {
        code,
        influencerId: input.influencerId,
        hotelClientId: input.hotelClientId,
        ...couponData(input),
      },
    });
    revalidatePath(REVALIDATE);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail(`Code "${code}" already exists for this hotel.`);
    }
    return fail("Coupon not found.");
  }
}

export async function setCouponStatus(id: string, status: CouponStatus): Promise<ActionResult> {
  const member = await getCurrentMember();
  if (!member) return fail("Your session has expired — please sign in again.");
  if (!COUPON_STATUSES.includes(status)) return fail("Invalid status.");
  try {
    await agencyScoped(prisma.couponCode).update({ where: { id }, data: { status } });
  } catch {
    return fail("Coupon not found.");
  }
  revalidatePath(REVALIDATE);
  return { ok: true, id };
}

export async function deleteCoupon(id: string): Promise<ActionResult> {
  const member = await getCurrentMember();
  if (!member) return fail("Your session has expired — please sign in again.");
  try {
    await agencyScoped(prisma.couponCode).delete({ where: { id } });
  } catch {
    return fail("Coupon not found (it may have redemptions).");
  }
  revalidatePath(REVALIDATE);
  return { ok: true, id };
}
