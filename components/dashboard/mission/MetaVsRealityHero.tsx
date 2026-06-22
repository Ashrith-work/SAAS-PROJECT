import { formatCurrency, formatNumber } from "@/lib/format";

// The hero: "What Meta claims vs what actually happened" — HotelTrack's core
// differentiator. Two columns (Meta's view vs HotelTrack verified) with a
// variance verdict in the middle. Built to be screenshot-worthy for sales.

export type MetaVsReality = {
  metaBookings: number;
  metaRevenue: number;
  realBookings: number;
  realRevenue: number;
};

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl ${accent}`}>{value}</p>
    </div>
  );
}

export function MetaVsRealityHero({ data }: { data: MetaVsReality }) {
  const { metaBookings, metaRevenue, realBookings, realRevenue } = data;

  // Variance on bookings — the headline number agencies show hotels.
  const hasComparison = metaBookings > 0 || realBookings > 0;
  const inflationPct = realBookings > 0 ? ((metaBookings - realBookings) / realBookings) * 100 : null;
  const accurate = inflationPct != null && Math.abs(inflationPct) <= 25;
  const inflated = inflationPct != null && inflationPct > 25;

  const verdict = !hasComparison
    ? { text: "Awaiting data", sub: "Connect ads + tracking to compare", tone: "slate" as const }
    : inflationPct == null
      ? { text: "No tracked bookings yet", sub: "Meta reports activity; on-site tracking pending", tone: "amber" as const }
      : accurate
        ? { text: "Meta accurate ✓", sub: "Within 25% of verified bookings", tone: "emerald" as const }
        : inflated
          ? { text: `Meta inflated by ${Math.round(inflationPct)}%`, sub: "Meta claims more than actually happened", tone: "red" as const }
          : { text: `Meta under-counts by ${Math.round(-inflationPct)}%`, sub: "Real bookings exceed Meta's count", tone: "emerald" as const };

  const verdictCls = {
    emerald: "bg-success/15 text-success ring-success/30",
    red: "bg-danger/15 text-danger ring-danger/30",
    amber: "bg-warning/15 text-warning ring-warning/30",
    slate: "bg-elevated text-ink-tertiary ring-line-strong",
  }[verdict.tone];

  return (
    <section className="overflow-hidden rounded-card border border-line bg-gradient-to-b from-elevated to-card shadow-card">
      <div className="border-b border-line px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-ink">
          What Meta claims vs what actually happened
        </h2>
        <p className="mt-0.5 text-sm text-ink-tertiary">
          Platform-reported numbers next to the bookings HotelTrack verified on the hotel&apos;s own website.
        </p>
      </div>

      <div className="grid items-center gap-6 p-6 lg:grid-cols-[1fr_auto_1fr]">
        {/* Meta's view */}
        <div className="rounded-card border border-line bg-card p-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
            <span className="h-2 w-2 rounded-full bg-brand" /> Meta reports
          </div>
          <div className="space-y-4">
            <Stat label="Bookings claimed" value={formatNumber(metaBookings)} accent="text-ink" />
            <Stat label="Revenue claimed" value={formatCurrency(metaRevenue)} accent="text-ink" />
          </div>
        </div>

        {/* Verdict */}
        <div className="flex flex-col items-center justify-center text-center lg:px-2">
          <div className={`rounded-card px-5 py-4 ring-1 ${verdictCls}`}>
            <p className="text-lg font-bold leading-tight">{verdict.text}</p>
            <p className="mt-1 text-xs opacity-80">{verdict.sub}</p>
          </div>
          <p className="mt-3 hidden text-xs text-ink-disabled lg:block">vs</p>
        </div>

        {/* HotelTrack verified */}
        <div className="rounded-card border-2 border-success/40 bg-card p-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
            <span className="h-2 w-2 rounded-full bg-success" /> HotelTrack verified
          </div>
          <div className="space-y-4">
            <Stat label="Real bookings tracked" value={formatNumber(realBookings)} accent="text-success" />
            <Stat label="Real revenue" value={formatCurrency(realRevenue)} accent="text-success" />
          </div>
        </div>
      </div>
    </section>
  );
}
