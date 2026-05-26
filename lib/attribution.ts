// Attribution + aggregation helpers for the per-hotel dashboard.
//
// These are pure functions over data the caller has ALREADY scoped to one
// agency + hotel (the dashboard page filters every query by agencyId — see
// CLAUDE.md multi-tenancy rule). Keeping the math here makes it testable and
// keeps the page focused on data loading and layout.
//
// Attribution model (matches lib/utm.ts + the tracking snippet): the snippet
// stores first-touch UTM params in a cookie and sends the SAME utm_content on
// both the "visit" and the later "conversion" event. So a content piece's
// events are exactly those whose utm_content === `ht-<contentPieceId>`.

import { UTM_CONTENT_PREFIX } from "@/lib/utm";

const DAY_MS = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Date range
// ─────────────────────────────────────────────────────────────────────────────

export type ResolvedRange = {
  since: Date;
  until: Date;
  /** "7" | "30" | "90" | "custom" — drives the active state of the selector. */
  key: string;
  label: string;
  /** YYYY-MM-DD values to prefill the custom date inputs. */
  fromInput: string;
  toInput: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves the dashboard date range from URL search params. Supports the preset
 * windows (`range=7|30|90`) and a custom range (`from`/`to` as YYYY-MM-DD).
 * Defaults to the last 30 days.
 */
export function resolveRange(sp: {
  range?: string;
  from?: string;
  to?: string;
}): ResolvedRange {
  const now = new Date();
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : null;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : null;

  if (from || to) {
    const since = from
      ? new Date(`${from}T00:00:00.000Z`)
      : new Date(now.getTime() - 30 * DAY_MS);
    const until = to ? new Date(`${to}T23:59:59.999Z`) : now;
    return {
      since,
      until,
      key: "custom",
      label: "Custom range",
      fromInput: ymd(since),
      toInput: ymd(until),
    };
  }

  const days = sp.range === "7" ? 7 : sp.range === "90" ? 90 : 30;
  const since = new Date(now.getTime() - days * DAY_MS);
  return {
    since,
    until: now,
    key: String(days),
    label: `Last ${days} days`,
    fromInput: ymd(since),
    toInput: ymd(now),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

export type EventInput = {
  eventType: "visit" | "conversion";
  utmContent: string | null;
  utmCampaign: string | null;
  sessionId: string;
  conversionValue: number | null;
};

export type ContentInput = {
  id: string;
  title: string;
  contentType: string;
  platform: string;
  couponCode: string | null;
  influencerName: string | null;
};

export type AdSnapshotInput = {
  date: Date;
  spend: number;
  conversions: number;
  roas: number;
};

export type RedemptionInput = {
  contentPieceId: string;
  orderValue: number;
};

/** Extracts the content-piece id from a utm_content tag, if it's one of ours. */
export function contentIdFromUtmContent(
  utmContent: string | null | undefined,
  valid: Set<string>,
): string | null {
  if (!utmContent || !utmContent.startsWith(UTM_CONTENT_PREFIX)) return null;
  const id = utmContent.slice(UTM_CONTENT_PREFIX.length);
  return valid.has(id) ? id : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — KPIs
// ─────────────────────────────────────────────────────────────────────────────

export type Kpis = {
  visits: number;
  bookings: number;
  revenue: number;
  spend: number;
  /** Ad spend / bookings. Null when there are no bookings. */
  costPerBooking: number | null;
  /** Attributed revenue / ad spend. Null when there's no spend. */
  roas: number | null;
};

export function computeKpis(events: EventInput[], spend: number): Kpis {
  let visits = 0;
  let bookings = 0;
  let revenue = 0;
  for (const e of events) {
    if (e.eventType === "visit") {
      visits += 1;
    } else {
      bookings += 1;
      revenue += e.conversionValue ?? 0;
    }
  }
  return {
    visits,
    bookings,
    revenue,
    spend,
    costPerBooking: bookings > 0 ? spend / bookings : null,
    roas: spend > 0 ? revenue / spend : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Content performance
// ─────────────────────────────────────────────────────────────────────────────

export type ContentPerf = {
  id: string;
  title: string;
  contentType: string;
  platform: string;
  /** Visit events from this piece's link (every tracked arrival). */
  clicks: number;
  /** Distinct sessions among those visits (unique visitors). */
  sessions: number;
  bookings: number;
  revenue: number;
  /** bookings / sessions. */
  conversionRate: number;
};

export function computeContentPerformance(
  content: ContentInput[],
  events: EventInput[],
): ContentPerf[] {
  const valid = new Set(content.map((c) => c.id));
  const clicks = new Map<string, number>();
  const sessions = new Map<string, Set<string>>();
  const bookings = new Map<string, number>();
  const revenue = new Map<string, number>();
  for (const c of content) {
    clicks.set(c.id, 0);
    sessions.set(c.id, new Set());
    bookings.set(c.id, 0);
    revenue.set(c.id, 0);
  }

  for (const e of events) {
    const cid = contentIdFromUtmContent(e.utmContent, valid);
    if (!cid) continue;
    if (e.eventType === "visit") {
      clicks.set(cid, (clicks.get(cid) ?? 0) + 1);
      sessions.get(cid)!.add(e.sessionId);
    } else {
      bookings.set(cid, (bookings.get(cid) ?? 0) + 1);
      revenue.set(cid, (revenue.get(cid) ?? 0) + (e.conversionValue ?? 0));
    }
  }

  return content.map((c) => {
    const sessionCount = sessions.get(c.id)!.size;
    const bookingCount = bookings.get(c.id) ?? 0;
    return {
      id: c.id,
      title: c.title,
      contentType: c.contentType,
      platform: c.platform,
      clicks: clicks.get(c.id) ?? 0,
      sessions: sessionCount,
      bookings: bookingCount,
      revenue: revenue.get(c.id) ?? 0,
      conversionRate: sessionCount > 0 ? bookingCount / sessionCount : 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Paid ads
// ─────────────────────────────────────────────────────────────────────────────

export type AdsSummary = {
  spend: number;
  /** Meta-reported conversions from ad snapshots. */
  bookingsFromAds: number;
  /** Meta-reported ad revenue (Σ spend × roas). */
  metaReportedRevenue: number;
  metaRoas: number | null;
  /** Daily spend for the line chart, ascending by date. */
  spendOverTime: { date: string; spend: number }[];
};

export function computeAdsSummary(snapshots: AdSnapshotInput[]): AdsSummary {
  let spend = 0;
  let bookingsFromAds = 0;
  let metaReportedRevenue = 0;

  const byDate = new Map<string, number>();
  for (const s of snapshots) {
    spend += s.spend;
    bookingsFromAds += s.conversions;
    metaReportedRevenue += s.spend * s.roas;
    const key = ymd(s.date);
    byDate.set(key, (byDate.get(key) ?? 0) + s.spend);
  }

  const spendOverTime = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, spend: value }));

  return {
    spend,
    bookingsFromAds,
    metaReportedRevenue,
    metaRoas: spend > 0 ? metaReportedRevenue / spend : null,
    spendOverTime,
  };
}

/**
 * "True ROI" — our measured website-booking revenue from paid-ad content vs the
 * ad spend, as opposed to Meta's self-reported ROAS. This is HotelTrack's core
 * claim: real bookings, not platform-attributed ones.
 *   (real ad-driven revenue − spend) / spend
 */
export function trueRoi(realAdRevenue: number, spend: number): number | null {
  if (spend <= 0) return null;
  return (realAdRevenue - spend) / spend;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Influencer impact
// ─────────────────────────────────────────────────────────────────────────────

export type InfluencerRow = {
  id: string;
  title: string;
  influencerName: string;
  couponCode: string | null;
  redemptions: number;
  revenue: number;
  /** Influencer fees aren't tracked in the schema yet, so this is null. */
  costPerBooking: number | null;
};

export function computeInfluencerImpact(
  content: ContentInput[],
  redemptions: RedemptionInput[],
): InfluencerRow[] {
  const counts = new Map<string, number>();
  const revenue = new Map<string, number>();
  for (const r of redemptions) {
    counts.set(r.contentPieceId, (counts.get(r.contentPieceId) ?? 0) + 1);
    revenue.set(
      r.contentPieceId,
      (revenue.get(r.contentPieceId) ?? 0) + r.orderValue,
    );
  }

  return content
    .filter((c) => c.contentType === "influencer")
    .map((c) => ({
      id: c.id,
      title: c.title,
      influencerName: c.influencerName ?? "Influencer",
      couponCode: c.couponCode,
      redemptions: counts.get(c.id) ?? 0,
      revenue: revenue.get(c.id) ?? 0,
      costPerBooking: null,
    }));
}
