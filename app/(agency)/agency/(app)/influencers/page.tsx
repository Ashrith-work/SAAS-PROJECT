import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { InfluencersTab, type InfluencerRow } from "./InfluencersTab";
import { CouponCodesTab, type CouponRow } from "./CouponCodesTab";

// Influencers & Coupons (Phase R2) — agency admin for the first-class influencer
// coupon system. Two tabs (?tab=influencers | codes). Every read is agencyScoped.

export const dynamic = "force-dynamic";

export default async function InfluencersPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === "codes" ? "codes" : "influencers";

  const [influencers, codes, hotels, redByInfluencer, activeByInfluencer, redByCoupon] =
    await Promise.all([
      agencyScoped(prisma.influencer).findMany({
        orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          instagramHandle: true,
          notes: true,
          hotelClientId: true,
          archivedAt: true,
        },
      }),
      agencyScoped(prisma.couponCode).findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          status: true,
          discountType: true,
          discountValue: true,
          validFrom: true,
          validUntil: true,
          notes: true,
          influencerId: true,
          hotelClientId: true,
        },
      }),
      agencyScoped(prisma.hotelClient).findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      agencyScoped(prisma.influencerRedemption).groupBy({
        by: ["influencerId"],
        _count: { _all: true },
        _sum: { bookingValue: true },
      }),
      agencyScoped(prisma.couponCode).groupBy({
        by: ["influencerId"],
        where: { status: "ACTIVE" },
        _count: { _all: true },
      }),
      agencyScoped(prisma.influencerRedemption).groupBy({
        by: ["couponCodeId"],
        _count: { _all: true },
        _sum: { bookingValue: true },
      }),
    ]);

  const hotelName = new Map(hotels.map((h) => [h.id, h.name]));
  const influencerName = new Map(influencers.map((i) => [i.id, i.name]));
  const redCountByInf = new Map(redByInfluencer.map((g) => [g.influencerId, g._count._all]));
  const redRevByInf = new Map(redByInfluencer.map((g) => [g.influencerId, Number(g._sum.bookingValue ?? 0)]));
  const activeCodesByInf = new Map(activeByInfluencer.map((g) => [g.influencerId, g._count._all]));
  const redCountByCoupon = new Map(redByCoupon.map((g) => [g.couponCodeId, g._count._all]));
  const redRevByCoupon = new Map(redByCoupon.map((g) => [g.couponCodeId, Number(g._sum.bookingValue ?? 0)]));

  const influencerRows: InfluencerRow[] = influencers.map((i) => ({
    id: i.id,
    name: i.name,
    instagramHandle: i.instagramHandle,
    notes: i.notes,
    hotelClientId: i.hotelClientId,
    hotelName: i.hotelClientId ? (hotelName.get(i.hotelClientId) ?? null) : null,
    archived: i.archivedAt != null,
    activeCodes: activeCodesByInf.get(i.id) ?? 0,
    redemptions: redCountByInf.get(i.id) ?? 0,
    revenue: redRevByInf.get(i.id) ?? 0,
  }));

  const couponRows: CouponRow[] = codes.map((c) => ({
    id: c.id,
    code: c.code,
    status: c.status,
    discountType: c.discountType,
    discountValue: c.discountValue == null ? null : Number(c.discountValue),
    validFrom: c.validFrom ? c.validFrom.toISOString() : null,
    validUntil: c.validUntil ? c.validUntil.toISOString() : null,
    notes: c.notes,
    influencerId: c.influencerId,
    influencerName: influencerName.get(c.influencerId) ?? "—",
    hotelClientId: c.hotelClientId,
    hotelName: hotelName.get(c.hotelClientId) ?? "—",
    redemptions: redCountByCoupon.get(c.id) ?? 0,
    revenue: redRevByCoupon.get(c.id) ?? 0,
  }));

  const hotelOptions = hotels.map((h) => ({ id: h.id, name: h.name }));
  const influencerOptions = influencers
    .filter((i) => i.archivedAt == null)
    .map((i) => ({ id: i.id, name: i.name, hotelClientId: i.hotelClientId }));

  const tabCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-brand text-white" : "text-ink-secondary hover:bg-elevated"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Influencers &amp; Coupons</h1>
        <p className="text-ink-tertiary">
          Define influencers, give them coupon codes per hotel, and track the bookings those codes drive.
        </p>
      </div>

      <div className="inline-flex gap-1 rounded-xl border border-line bg-card p-1">
        <Link href="/agency/influencers?tab=influencers" className={tabCls(tab === "influencers")}>
          Influencers
        </Link>
        <Link href="/agency/influencers?tab=codes" className={tabCls(tab === "codes")}>
          Coupon Codes
        </Link>
      </div>

      {tab === "influencers" ? (
        <InfluencersTab influencers={influencerRows} hotels={hotelOptions} />
      ) : (
        <CouponCodesTab
          codes={couponRows}
          influencers={influencerOptions}
          hotels={hotelOptions}
        />
      )}
    </div>
  );
}
