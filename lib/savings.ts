import "server-only";

import { prisma } from "@/lib/prisma";
import { agencyScoped, agencyScopedFor } from "@/lib/tenant";

// OTA commission savings — read-only calculations on top of existing conversion
// TrackingEvents. "Savings" = booking revenue × the hotel's OTA commission rate,
// i.e. what the hotel would have paid an OTA had the (snippet-tracked) direct
// booking gone through one instead. Manual influencer redemptions (off-snippet)
// are NOT included — only snippet-tracked conversions. Multi-tenant: reads are
// agency-scoped; each hotel uses its OWN rate (fallback DEFAULT_OTA_RATE).

export const DEFAULT_OTA_RATE = 18;
export const MAX_OTA_RATE = 50;

/** revenue × rate/100. Null / zero / negative / non-finite inputs → 0. */
export function calculateSavings(revenue: number | null | undefined, rate: number | null | undefined): number {
  const r = Number(revenue);
  const p = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return 0;
  if (!Number.isFinite(p) || p <= 0) return 0;
  return r * (p / 100);
}

/** Validate an OTA rate from settings: a number in [0, MAX_OTA_RATE], else null. */
export function parseOtaRate(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_OTA_RATE) return null;
  return Math.round(n * 100) / 100;
}

const rateOf = (raw: { toString(): string } | null | undefined): number =>
  raw == null ? DEFAULT_OTA_RATE : Number(raw);

// ── Month helpers (UTC) ──────────────────────────────────────────────────────

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The N month keys (YYYY-MM) ending at `end`'s month, oldest first. */
export function lastNMonths(end: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

/** First-of-month UTC for the oldest of `lastNMonths(end, n)` — the trend window start. */
export function trendWindowStart(end: Date, n: number): Date {
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (n - 1), 1));
}

export type MonthPoint = { month: string; revenue: number; savings: number; bookings: number };

// ── Spec-named calculators ───────────────────────────────────────────────────

export type HotelSavings = {
  hotelName: string;
  totalBookingRevenue: number;
  totalSavings: number;
  bookingCount: number;
  otaRateUsed: number;
};

/** Period savings for one hotel. Null when the hotel isn't the caller's agency's. */
export async function calculateHotelSavings(
  hotelClientId: string,
  startDate: Date,
  endDate: Date,
): Promise<HotelSavings | null> {
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelClientId },
    select: { name: true, otaCommissionRate: true },
  });
  if (!hotel) return null;
  const rate = rateOf(hotel.otaCommissionRate);
  const agg = await agencyScoped(prisma.trackingEvent).aggregate({
    where: { hotelClientId, eventType: "conversion", createdAt: { gte: startDate, lte: endDate } },
    _sum: { conversionValue: true },
    _count: { _all: true },
  });
  const revenue = Number(agg._sum.conversionValue ?? 0);
  return {
    hotelName: hotel.name,
    totalBookingRevenue: revenue,
    totalSavings: calculateSavings(revenue, rate),
    bookingCount: agg._count._all,
    otaRateUsed: rate,
  };
}

export type AgencyHotelSaving = {
  hotelId: string;
  hotelName: string;
  revenue: number;
  savings: number;
  bookings: number;
  otaRateUsed: number;
};
export type AgencySavings = {
  totalBookingRevenue: number;
  totalSavings: number;
  bookingCount: number;
  activeHotelsCount: number;
  hotelBreakdown: AgencyHotelSaving[];
};

/** Period savings across all the agency's hotels — each at its OWN rate. */
export async function calculateAgencySavings(
  agencyId: string,
  startDate: Date,
  endDate: Date,
  hotelFilter?: string[],
): Promise<AgencySavings> {
  const hotels = await agencyScopedFor(agencyId, prisma.hotelClient).findMany({
    where: { deletedAt: null, ...(hotelFilter && hotelFilter.length ? { id: { in: hotelFilter } } : {}) },
    select: { id: true, name: true, otaCommissionRate: true },
  });
  const meta = new Map(hotels.map((h) => [h.id, { name: h.name, rate: rateOf(h.otaCommissionRate) }]));
  const hotelIds = hotels.map((h) => h.id);
  if (hotelIds.length === 0) {
    return { totalBookingRevenue: 0, totalSavings: 0, bookingCount: 0, activeHotelsCount: 0, hotelBreakdown: [] };
  }

  const groups = await agencyScopedFor(agencyId, prisma.trackingEvent).groupBy({
    by: ["hotelClientId"],
    where: { eventType: "conversion", hotelClientId: { in: hotelIds }, createdAt: { gte: startDate, lte: endDate } },
    _sum: { conversionValue: true },
    _count: { _all: true },
  });

  let totalBookingRevenue = 0;
  let totalSavings = 0;
  let bookingCount = 0;
  const hotelBreakdown: AgencyHotelSaving[] = [];
  for (const g of groups) {
    const m = meta.get(g.hotelClientId);
    if (!m) continue;
    const revenue = Number(g._sum.conversionValue ?? 0);
    const savings = calculateSavings(revenue, m.rate);
    totalBookingRevenue += revenue;
    totalSavings += savings;
    bookingCount += g._count._all;
    hotelBreakdown.push({ hotelId: g.hotelClientId, hotelName: m.name, revenue, savings, bookings: g._count._all, otaRateUsed: m.rate });
  }
  hotelBreakdown.sort((a, b) => b.savings - a.savings || a.hotelName.localeCompare(b.hotelName));

  return {
    totalBookingRevenue,
    totalSavings,
    bookingCount,
    activeHotelsCount: hotelBreakdown.filter((h) => h.bookings > 0).length,
    hotelBreakdown,
  };
}

// ── Monthly trends (zero-filled) ─────────────────────────────────────────────

/** 12-month (or `months`) savings trend for one hotel, zero-filled. */
export async function hotelMonthlyTrend(
  hotelClientId: string,
  months: string[],
  rate: number,
): Promise<MonthPoint[]> {
  const from = new Date(`${months[0]}-01T00:00:00.000Z`);
  const rows = await agencyScoped(prisma.trackingEvent).findMany({
    where: { hotelClientId, eventType: "conversion", createdAt: { gte: from } },
    select: { conversionValue: true, createdAt: true },
  });
  const byMonth = new Map<string, { revenue: number; bookings: number }>();
  for (const r of rows) {
    const k = monthKey(r.createdAt);
    const acc = byMonth.get(k) ?? { revenue: 0, bookings: 0 };
    acc.revenue += Number(r.conversionValue ?? 0);
    acc.bookings += 1;
    byMonth.set(k, acc);
  }
  return months.map((month) => {
    const a = byMonth.get(month) ?? { revenue: 0, bookings: 0 };
    return { month, revenue: a.revenue, savings: calculateSavings(a.revenue, rate), bookings: a.bookings };
  });
}

export type AgencyMonthlyTrend = {
  trend: MonthPoint[];
  /** Per-hotel savings per month, for the stacked chart: month → { hotelId: savings }. */
  byHotel: { month: string; hotels: Record<string, number> }[];
};

/** Agency-wide monthly trend (each hotel at its own rate), zero-filled, plus the
 *  per-hotel stacked breakdown. */
export async function agencyMonthlyTrend(
  agencyId: string,
  hotelMeta: Map<string, { name: string; rate: number }>,
  months: string[],
): Promise<AgencyMonthlyTrend> {
  const hotelIds = [...hotelMeta.keys()];
  if (hotelIds.length === 0 || months.length === 0) {
    return { trend: months.map((month) => ({ month, revenue: 0, savings: 0, bookings: 0 })), byHotel: months.map((month) => ({ month, hotels: {} })) };
  }
  const from = new Date(`${months[0]}-01T00:00:00.000Z`);
  const rows = await agencyScopedFor(agencyId, prisma.trackingEvent).findMany({
    where: { eventType: "conversion", hotelClientId: { in: hotelIds }, createdAt: { gte: from } },
    select: { conversionValue: true, createdAt: true, hotelClientId: true },
  });

  const totals = new Map<string, { revenue: number; savings: number; bookings: number }>();
  const perHotel = new Map<string, Map<string, number>>(); // month → hotelId → savings
  for (const r of rows) {
    const m = hotelMeta.get(r.hotelClientId);
    if (!m) continue;
    const k = monthKey(r.createdAt);
    const rev = Number(r.conversionValue ?? 0);
    const sav = calculateSavings(rev, m.rate);
    const t = totals.get(k) ?? { revenue: 0, savings: 0, bookings: 0 };
    t.revenue += rev; t.savings += sav; t.bookings += 1;
    totals.set(k, t);
    const hm = perHotel.get(k) ?? new Map<string, number>();
    hm.set(r.hotelClientId, (hm.get(r.hotelClientId) ?? 0) + sav);
    perHotel.set(k, hm);
  }
  return {
    trend: months.map((month) => {
      const t = totals.get(month) ?? { revenue: 0, savings: 0, bookings: 0 };
      return { month, revenue: t.revenue, savings: t.savings, bookings: t.bookings };
    }),
    byHotel: months.map((month) => ({ month, hotels: Object.fromEntries(perHotel.get(month) ?? new Map()) })),
  };
}
