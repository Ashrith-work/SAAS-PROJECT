import { formatCurrency, formatMultiple, formatNumber, formatNumberCompact, formatPercent } from "@/lib/format";

// Channel performance — three horizontal cards, each tinted with its channel's
// brand color (subtle). Pure presentation over already-computed aggregates.

export type ChannelData = {
  paid: { spend: number; bookings: number; roas: number | null };
  instagram: { reach: number; engagementRate: number | null; bookings: number };
  direct: { bookings: number; revenue: number };
};

// Narrower than the KPI cards (three to a sub-card), so the value scales down
// more aggressively to stay inside its column.
function metricSize(text: string): string {
  const n = text.length;
  if (n <= 6) return "text-xl";
  if (n <= 9) return "text-lg";
  return "text-base";
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p
        title={title ?? value}
        className={`mt-0.5 font-semibold leading-[1.1] tracking-tight tabular-nums break-words text-ink ${metricSize(
          value,
        )}`}
      >
        {value}
      </p>
    </div>
  );
}

function ChannelCard({
  name,
  dot,
  tint,
  children,
}: {
  name: string;
  dot: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-card border border-line bg-card p-5 shadow-card transition hover:border-line-strong`}>
      <div className="mb-4 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <h3 className="text-sm font-semibold text-ink">{name}</h3>
        <span className={`ml-auto h-1.5 w-10 rounded-full ${tint}`} />
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-3">{children}</div>
    </div>
  );
}

export function ChannelBreakdown({ data }: { data: ChannelData }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <ChannelCard name="Paid Ads" dot="bg-brand" tint="bg-brand/30">
        <Metric
          label="Spend"
          value={formatCurrency(data.paid.spend, { compact: true })}
          title={formatCurrency(data.paid.spend)}
        />
        <Metric label="Bookings" value={formatNumber(data.paid.bookings)} />
        <Metric label="True ROAS" value={formatMultiple(data.paid.roas)} />
      </ChannelCard>

      <ChannelCard name="Instagram Organic" dot="bg-pink-500" tint="bg-pink-500/20">
        <Metric
          label="Reach"
          value={formatNumberCompact(data.instagram.reach)}
          title={formatNumber(data.instagram.reach)}
        />
        <Metric
          label="Engagement"
          value={data.instagram.engagementRate == null ? "—" : formatPercent(data.instagram.engagementRate)}
        />
        <Metric label="Bookings" value={formatNumber(data.instagram.bookings)} />
      </ChannelCard>

      <ChannelCard name="Direct / Website" dot="bg-ink-tertiary" tint="bg-ink-tertiary/30">
        <Metric label="Bookings" value={formatNumber(data.direct.bookings)} />
        <Metric
          label="Revenue"
          value={formatCurrency(data.direct.revenue, { compact: true })}
          title={formatCurrency(data.direct.revenue)}
        />
        <Metric label="Share" value="—" />
      </ChannelCard>
    </div>
  );
}
