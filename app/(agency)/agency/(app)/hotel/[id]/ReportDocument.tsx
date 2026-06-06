"use client";

import {
  formatCurrency,
  formatMultiple,
  formatNumber,
  formatPercent,
} from "@/lib/format";

// The printable report. Rendered off-screen and rasterised by html2canvas, so
// every style here is INLINE with literal hex colors — Tailwind v4 emits oklch()
// colors which html2canvas can't parse, and inline hex sidesteps that entirely.

export type ReportData = {
  hotelName: string;
  websiteUrl: string;
  agencyName: string;
  rangeLabel: string;
  from: string;
  to: string;
  generatedAt: string;
  kpis: {
    visits: number;
    bookings: number;
    revenue: number;
    spend: number;
    costPerBooking: number | null;
    roas: number | null;
  };
  topContent: {
    title: string;
    contentType: string;
    clicks: number;
    sessions: number;
    bookings: number;
    revenue: number;
    conversionRate: number;
  }[];
  ads: {
    spend: number;
    bookingsFromAds: number;
    metaRoas: number | null;
    trueRoi: number | null;
    campaigns: { title: string; sessions: number; bookings: number; revenue: number }[];
  };
  /** Meta campaign ↔ real-booking attribution (the claims-vs-reality table). */
  campaignPerformance: {
    campaignName: string;
    unattributed: boolean;
    spend: number;
    realBookings: number;
    realRevenue: number;
    realRoas: number | null;
    metaConversions: number;
  }[];
  influencers: {
    influencerName: string;
    couponCode: string | null;
    redemptions: number;
    revenue: number;
  }[];
  social: {
    handle: string | null;
    followers: number;
    followerGrowth: number;
    engagementRate: number | null;
    storyCompletionRate: number | null;
    topPosts: {
      caption: string | null;
      mediaType: string | null;
      postedAt: string | null;
      reach: number;
      likes: number;
      comments: number;
      engagement: number;
      saves: number;
    }[];
    stories: {
      postedAt: string | null;
      mediaType: string | null;
      reach: number;
      impressions: number;
      tapsForward: number;
      exits: number;
      replies: number;
    }[];
  };
  ga: {
    connected: boolean;
    propertyId: string | null;
    totalUsers: number;
    newUsers: number;
    sessions: number;
    bounceRate: number;
    avgSessionDuration: number;
    conversions: number;
    contentSessions: number;
    contentSharePct: number | null;
    sources: { source: string; sessions: number; pct: number }[];
  };
};

const BRAND = "#7c3aed";
const INK = "#18181b";
const MUTE = "#52525b";
const LINE = "#e4e4e7";

const TYPE_LABELS: Record<string, string> = {
  organic: "Organic",
  paid_ad: "Paid ad",
  influencer: "Influencer",
  story: "Story",
};

/** Plain-English narrative of the period for hotel owners. */
export function execSummary(d: ReportData): string {
  const { visits, bookings, revenue, spend, roas } = d.kpis;
  const parts: string[] = [];
  parts.push(
    `Between ${d.from} and ${d.to}, marketing activity drove ${formatNumber(visits)} ` +
      `tracked visits to ${d.hotelName}'s website, resulting in ${formatNumber(bookings)} ` +
      `${bookings === 1 ? "booking" : "bookings"} and ${formatCurrency(revenue)} in attributed revenue.`,
  );
  if (spend > 0) {
    parts.push(
      `Across paid Meta ads, ${formatCurrency(spend)} was spent` +
        (roas != null ? `, returning ${formatMultiple(roas)} in attributed revenue per rupee` : "") +
        ".",
    );
  } else {
    parts.push("No paid ad spend was recorded for this period.");
  }
  const top = d.topContent[0];
  if (top && top.revenue > 0) {
    parts.push(
      `The top-performing content was “${top.title}”, generating ${formatCurrency(top.revenue)} ` +
        `from ${formatNumber(top.bookings)} ${top.bookings === 1 ? "booking" : "bookings"}.`,
    );
  }
  return parts.join(" ");
}

function th(text: string, align: "left" | "right" = "left"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "8px 10px",
    fontSize: 11,
    fontWeight: 600,
    color: MUTE,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    borderBottom: `2px solid ${LINE}`,
  };
}
function td(align: "left" | "right" = "left"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "8px 10px",
    fontSize: 13,
    color: INK,
    borderBottom: `1px solid ${LINE}`,
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 16,
        fontWeight: 700,
        color: INK,
        margin: "0 0 12px",
        paddingBottom: 6,
        borderBottom: `2px solid ${BRAND}`,
      }}
    >
      {children}
    </h2>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 10, color: MUTE, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export function ReportDocument({ data }: { data: ReportData }) {
  const k = data.kpis;
  return (
    <div
      id="report-root"
      style={{
        position: "fixed",
        left: -10000,
        top: 0,
        width: 794,
        background: "#ffffff",
        color: INK,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {/* ── Cover (one full A4 page) ── */}
      <div
        id="report-cover"
        style={{
          width: 794,
          height: 1123,
          background: "#ffffff",
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        <div style={{ background: BRAND, height: 200, padding: "48px 56px", boxSizing: "border-box" }}>
          <div style={{ color: "#ffffff", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            HotelTrack
          </div>
          <div style={{ color: "#ede9fe", fontSize: 13, marginTop: 6 }}>
            Content → visits → bookings → revenue
          </div>
        </div>
        <div style={{ padding: "64px 56px" }}>
          <div style={{ fontSize: 14, color: MUTE, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Performance report
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: INK, marginTop: 12, lineHeight: 1.1 }}>
            {data.hotelName}
          </div>
          <div style={{ fontSize: 15, color: MUTE, marginTop: 8 }}>{data.websiteUrl}</div>
          <div style={{ marginTop: 40, fontSize: 16, color: INK }}>
            {data.rangeLabel}
          </div>
          <div style={{ fontSize: 14, color: MUTE, marginTop: 4 }}>
            {data.from} — {data.to}
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 56, left: 56, right: 56 }}>
          <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 16, fontSize: 13, color: MUTE }}>
            Prepared by <span style={{ color: INK, fontWeight: 600 }}>{data.agencyName}</span>
            <span style={{ float: "right" }}>Generated {data.generatedAt}</span>
          </div>
        </div>
      </div>

      {/* ── Body (flows across the remaining pages) ── */}
      <div id="report-body" style={{ padding: "48px 56px", boxSizing: "border-box" }}>
        <section style={{ marginBottom: 32 }}>
          <SectionTitle>Executive summary</SectionTitle>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: INK, margin: "0 0 16px" }}>
            {execSummary(data)}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <KpiTile label="Visits" value={formatNumber(k.visits)} />
            <KpiTile label="Bookings" value={formatNumber(k.bookings)} />
            <KpiTile label="Revenue" value={formatCurrency(k.revenue)} />
            <KpiTile
              label="Cost / booking"
              value={k.costPerBooking == null ? "—" : formatCurrency(k.costPerBooking)}
            />
            <KpiTile label="ROAS" value={formatMultiple(k.roas)} />
          </div>
        </section>

        {/* Campaign performance — the claims-vs-reality table, the report's
            centerpiece: what Meta says each campaign did vs the bookings the
            snippet actually recorded on the hotel's own website. */}
        {data.campaignPerformance.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <SectionTitle>Campaign performance — Meta&apos;s claims vs reality</SectionTitle>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: MUTE, margin: "0 0 12px" }}>
              Bookings and revenue below are measured by HotelTrack on the hotel&apos;s own
              website — not platform-reported. &ldquo;Meta says&rdquo; shows the platform&apos;s
              claim for the same campaign.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", border: `2px solid ${BRAND}` }}>
              <thead>
                <tr style={{ background: "#f5f3ff" }}>
                  <th style={th("left")}>Campaign</th>
                  <th style={th("right")}>Spend</th>
                  <th style={th("right")}>Bookings (real)</th>
                  <th style={th("right")}>Revenue (real)</th>
                  <th style={th("right")}>True ROAS</th>
                  <th style={th("left")}>Meta says</th>
                </tr>
              </thead>
              <tbody>
                {data.campaignPerformance.map((c, i) => {
                  const roasColor =
                    c.unattributed || c.realRoas == null
                      ? MUTE
                      : c.realRoas > 4
                        ? "#16a34a"
                        : c.realRoas >= 2
                          ? "#d97706"
                          : "#dc2626";
                  let verdict = "—";
                  if (!c.unattributed) {
                    const claim = `"${formatNumber(c.metaConversions)} bookings"`;
                    if (c.realBookings === 0) {
                      verdict = c.metaConversions === 0 ? `✓ ${claim}` : `⚠ ${claim} — none tracked on-site`;
                    } else {
                      const diffPct = ((c.metaConversions - c.realBookings) / c.realBookings) * 100;
                      if (Math.abs(c.metaConversions - c.realBookings) <= 0.25 * c.realBookings) {
                        verdict = `✓ ${claim} (close match)`;
                      } else if (diffPct > 50) {
                        verdict = `⚠ ${claim} (${Math.round(diffPct)}% inflated)`;
                      } else {
                        verdict = `${claim} (${Math.round(Math.abs(diffPct))}% ${diffPct > 0 ? "higher" : "lower"})`;
                      }
                    }
                  }
                  return (
                    <tr key={i} style={c.unattributed ? { color: MUTE } : undefined}>
                      <td style={td("left")}>{c.campaignName}</td>
                      <td style={td("right")}>{c.unattributed ? "—" : formatCurrency(c.spend)}</td>
                      <td style={td("right")}>{formatNumber(c.realBookings)}</td>
                      <td style={td("right")}>{formatCurrency(c.realRevenue)}</td>
                      <td style={{ ...td("right"), color: roasColor, fontWeight: 700 }}>
                        {c.unattributed ? "—" : formatMultiple(c.realRoas)}
                      </td>
                      <td style={td("left")}>{verdict}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <section style={{ marginBottom: 32 }}>
          <SectionTitle>Top performing content</SectionTitle>
          {data.topContent.length === 0 ? (
            <p style={{ fontSize: 13, color: MUTE }}>No content activity in this period.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th("left")}>Content</th>
                  <th style={th("left")}>Type</th>
                  <th style={th("right")}>Clicks</th>
                  <th style={th("right")}>Bookings</th>
                  <th style={th("right")}>Revenue</th>
                  <th style={th("right")}>Conv. rate</th>
                </tr>
              </thead>
              <tbody>
                {data.topContent.map((c, i) => (
                  <tr key={i}>
                    <td style={td("left")}>{c.title}</td>
                    <td style={td("left")}>{TYPE_LABELS[c.contentType] ?? c.contentType}</td>
                    <td style={td("right")}>{formatNumber(c.clicks)}</td>
                    <td style={td("right")}>{formatNumber(c.bookings)}</td>
                    <td style={td("right")}>{formatCurrency(c.revenue)}</td>
                    <td style={td("right")}>{formatPercent(c.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section style={{ marginBottom: 32 }}>
          <SectionTitle>Paid ads ROI</SectionTitle>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <KpiTile label="Meta ad spend" value={formatCurrency(data.ads.spend)} />
            <KpiTile label="Bookings from ads" value={formatNumber(data.ads.bookingsFromAds)} />
            <KpiTile label="Meta ROAS" value={formatMultiple(data.ads.metaRoas)} />
            <KpiTile
              label="True ROI"
              value={data.ads.trueRoi == null ? "—" : formatPercent(data.ads.trueRoi)}
            />
          </div>
          {data.ads.campaigns.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th("left")}>Campaign</th>
                  <th style={th("right")}>Sessions</th>
                  <th style={th("right")}>Bookings</th>
                  <th style={th("right")}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.ads.campaigns.map((c, i) => (
                  <tr key={i}>
                    <td style={td("left")}>{c.title}</td>
                    <td style={td("right")}>{formatNumber(c.sessions)}</td>
                    <td style={td("right")}>{formatNumber(c.bookings)}</td>
                    <td style={td("right")}>{formatCurrency(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <SectionTitle>Influencer impact</SectionTitle>
          {data.influencers.length === 0 ? (
            <p style={{ fontSize: 13, color: MUTE }}>No influencer collaborations in this period.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th("left")}>Influencer</th>
                  <th style={th("left")}>Coupon</th>
                  <th style={th("right")}>Redemptions</th>
                  <th style={th("right")}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.influencers.map((r, i) => (
                  <tr key={i}>
                    <td style={td("left")}>{r.influencerName}</td>
                    <td style={td("left")}>{r.couponCode ?? "—"}</td>
                    <td style={td("right")}>{formatNumber(r.redemptions)}</td>
                    <td style={td("right")}>{formatCurrency(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section style={{ marginTop: 32 }}>
          <SectionTitle>
            Social performance{data.social.handle ? ` · @${data.social.handle}` : ""}
          </SectionTitle>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <KpiTile label="Followers" value={formatNumber(data.social.followers)} />
            <KpiTile
              label="Follower growth"
              value={`${data.social.followerGrowth >= 0 ? "+" : "−"}${formatNumber(
                Math.abs(data.social.followerGrowth),
              )}`}
            />
            <KpiTile
              label="Engagement rate"
              value={
                data.social.engagementRate == null
                  ? "—"
                  : formatPercent(data.social.engagementRate)
              }
            />
            <KpiTile
              label="Story completion"
              value={
                data.social.storyCompletionRate == null
                  ? "—"
                  : formatPercent(data.social.storyCompletionRate)
              }
            />
          </div>

          {data.social.topPosts.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: MUTE,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  margin: "4px 0 8px",
                }}
              >
                Top posts by reach
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 18 }}>
                <thead>
                  <tr>
                    <th style={th("left")}>Post</th>
                    <th style={th("left")}>Type</th>
                    <th style={th("right")}>Reach</th>
                    <th style={th("right")}>Likes</th>
                    <th style={th("right")}>Comments</th>
                    <th style={th("right")}>Engagement</th>
                    <th style={th("right")}>Saves</th>
                  </tr>
                </thead>
                <tbody>
                  {data.social.topPosts.map((p, i) => (
                    <tr key={i}>
                      <td style={td("left")}>
                        {p.caption ? p.caption.slice(0, 60) : p.mediaType ?? "Post"}
                        {p.postedAt && (
                          <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>
                            {p.postedAt}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td("left"), textTransform: "capitalize" }}>
                        {p.mediaType ?? "—"}
                      </td>
                      <td style={td("right")}>{formatNumber(p.reach)}</td>
                      <td style={td("right")}>{formatNumber(p.likes)}</td>
                      <td style={td("right")}>{formatNumber(p.comments)}</td>
                      <td style={td("right")}>{formatNumber(p.engagement)}</td>
                      <td style={td("right")}>{formatNumber(p.saves)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {data.social.stories.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: MUTE,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  margin: "4px 0 8px",
                }}
              >
                Stories · last 30 days
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th("left")}>Posted</th>
                    <th style={th("left")}>Type</th>
                    <th style={th("right")}>Reach</th>
                    <th style={th("right")}>Impressions</th>
                    <th style={th("right")}>Taps fwd</th>
                    <th style={th("right")}>Exits</th>
                    <th style={th("right")}>Replies</th>
                  </tr>
                </thead>
                <tbody>
                  {data.social.stories.map((s, i) => (
                    <tr key={i}>
                      <td style={td("left")}>{s.postedAt ?? "—"}</td>
                      <td style={{ ...td("left"), textTransform: "capitalize" }}>
                        {s.mediaType ?? "story"}
                      </td>
                      <td style={td("right")}>{formatNumber(s.reach)}</td>
                      <td style={td("right")}>{formatNumber(s.impressions)}</td>
                      <td style={td("right")}>{formatNumber(s.tapsForward)}</td>
                      <td style={td("right")}>{formatNumber(s.exits)}</td>
                      <td style={td("right")}>{formatNumber(s.replies)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        {data.ga.connected && data.ga.sessions > 0 && (
          <section style={{ marginTop: 32 }}>
            <SectionTitle>
              Total website performance · Google Analytics
              {data.ga.propertyId ? ` · ${data.ga.propertyId}` : ""}
            </SectionTitle>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <KpiTile label="Total users" value={formatNumber(data.ga.totalUsers)} />
              <KpiTile label="Sessions" value={formatNumber(data.ga.sessions)} />
              <KpiTile label="New users" value={formatNumber(data.ga.newUsers)} />
              <KpiTile label="Bounce rate" value={formatPercent(data.ga.bounceRate)} />
              <KpiTile
                label="Avg session"
                value={`${Math.round(data.ga.avgSessionDuration)}s`}
              />
              <KpiTile label="Conversions" value={formatNumber(data.ga.conversions)} />
            </div>

            {data.ga.contentSharePct != null && (
              <div
                style={{
                  border: `1px solid ${BRAND}`,
                  background: "#f5f3ff",
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 18,
                  fontSize: 13,
                  color: INK,
                }}
              >
                <strong>
                  Of {formatNumber(data.ga.sessions)} total visits,{" "}
                  {formatNumber(data.ga.contentSessions)} came from our content (
                  {formatPercent(data.ga.contentSharePct)}).
                </strong>
                <div style={{ fontSize: 11, color: MUTE, marginTop: 4 }}>
                  HotelTrack-tagged snippet visits ÷ GA total sessions for this
                  date range.
                </div>
              </div>
            )}

            {data.ga.sources.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: MUTE,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    margin: "4px 0 8px",
                  }}
                >
                  Traffic by source
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th("left")}>Source</th>
                      <th style={th("right")}>Sessions</th>
                      <th style={th("right")}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ga.sources.map((row, i) => (
                      <tr key={i}>
                        <td style={{ ...td("left"), textTransform: "capitalize" }}>
                          {row.source.replace(/_/g, " ")}
                        </td>
                        <td style={td("right")}>{formatNumber(row.sessions)}</td>
                        <td style={td("right")}>{formatPercent(row.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${LINE}`, fontSize: 11, color: MUTE, textAlign: "center" }}>
          {data.agencyName} · Powered by HotelTrack · {data.generatedAt}
        </div>
      </div>
    </div>
  );
}
