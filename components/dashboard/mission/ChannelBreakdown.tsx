import { formatCurrency, formatMultiple, formatNumber, formatPercent } from "@/lib/format";

// Channel performance — three horizontal cards, each tinted with its channel's
// brand color (subtle). Pure presentation over already-computed aggregates.

export type ChannelData = {
  paid: { spend: number; bookings: number; roas: number | null };
  instagram: { reach: number; engagementRate: number | null; bookings: number };
  direct: { bookings: number; revenue: number };
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</p>
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
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md`}>
      <div className="mb-4 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <h3 className="text-sm font-semibold text-slate-900">{name}</h3>
        <span className={`ml-auto h-1.5 w-10 rounded-full ${tint}`} />
      </div>
      <div className="grid grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

export function ChannelBreakdown({ data }: { data: ChannelData }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <ChannelCard name="Paid Ads" dot="bg-[#1A56DB]" tint="bg-[#1A56DB]/20">
        <Metric label="Spend" value={formatCurrency(data.paid.spend)} />
        <Metric label="Bookings" value={formatNumber(data.paid.bookings)} />
        <Metric label="True ROAS" value={formatMultiple(data.paid.roas)} />
      </ChannelCard>

      <ChannelCard name="Instagram Organic" dot="bg-pink-500" tint="bg-pink-500/20">
        <Metric label="Reach" value={formatNumber(data.instagram.reach)} />
        <Metric
          label="Engagement"
          value={data.instagram.engagementRate == null ? "—" : formatPercent(data.instagram.engagementRate)}
        />
        <Metric label="Bookings" value={formatNumber(data.instagram.bookings)} />
      </ChannelCard>

      <ChannelCard name="Direct / Website" dot="bg-slate-500" tint="bg-slate-400/30">
        <Metric label="Bookings" value={formatNumber(data.direct.bookings)} />
        <Metric label="Revenue" value={formatCurrency(data.direct.revenue)} />
        <Metric label="Share" value="—" />
      </ChannelCard>
    </div>
  );
}
