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
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
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
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    red: "bg-red-50 text-red-600 ring-red-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    slate: "bg-slate-50 text-slate-600 ring-slate-200",
  }[verdict.tone];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          What Meta claims vs what actually happened
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Platform-reported numbers next to the bookings HotelTrack verified on the hotel&apos;s own website.
        </p>
      </div>

      <div className="grid items-center gap-6 p-6 lg:grid-cols-[1fr_auto_1fr]">
        {/* Meta's view */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#1A56DB]/10 px-3 py-1 text-xs font-semibold text-[#1A56DB]">
            <span className="h-2 w-2 rounded-full bg-[#1A56DB]" /> Meta reports
          </div>
          <div className="space-y-4">
            <Stat label="Bookings claimed" value={formatNumber(metaBookings)} accent="text-slate-900" />
            <Stat label="Revenue claimed" value={formatCurrency(metaRevenue)} accent="text-slate-900" />
          </div>
        </div>

        {/* Verdict */}
        <div className="flex flex-col items-center justify-center text-center lg:px-2">
          <div className={`rounded-2xl px-5 py-4 ring-1 ${verdictCls}`}>
            <p className="text-lg font-bold leading-tight">{verdict.text}</p>
            <p className="mt-1 text-xs opacity-80">{verdict.sub}</p>
          </div>
          <p className="mt-3 hidden text-xs text-slate-400 lg:block">vs</p>
        </div>

        {/* HotelTrack verified */}
        <div className="rounded-2xl border-2 border-emerald-200 bg-white p-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-600" /> HotelTrack verified
          </div>
          <div className="space-y-4">
            <Stat label="Real bookings tracked" value={formatNumber(realBookings)} accent="text-emerald-700" />
            <Stat label="Real revenue" value={formatCurrency(realRevenue)} accent="text-emerald-700" />
          </div>
        </div>
      </div>
    </section>
  );
}
