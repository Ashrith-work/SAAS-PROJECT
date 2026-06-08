"use client";

import { useState } from "react";
import { formatCurrency, formatMultiple, formatNumber, formatPercent } from "@/lib/format";
import { Sparkline } from "./Sparkline";

// Campaign performance as a card grid (3-up on desktop) replacing the old table.
// Each card leads with True ROAS, carries a status badge + 7-day sparkline, and
// opens a detail modal. Client component for the modal interaction.

export type CampaignCard = {
  campaignKey: string;
  campaignName: string;
  spend: number;
  realBookings: number;
  realRevenue: number;
  realRoas: number | null;
  metaBookings: number;
  metaRevenue: number;
  impressions: number;
  clicks: number;
  /** clicks / impressions */
  ctr: number;
  /** Meta-vs-real booking variance %, null when Meta reported 0. */
  variancePct: number | null;
  /** Last-7-days spend (or chosen metric) for the sparkline. */
  spark: number[];
};

type Status = { label: string; cls: string };
function statusOf(c: CampaignCard): Status {
  if (c.realRoas != null && c.realRoas > 4) return { label: "Winning ★", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (c.realRoas != null && c.realRoas < 2 && c.spend > 0) return { label: "Losing", cls: "bg-red-50 text-red-600 ring-red-200" };
  return { label: "Test", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
}
function roasColor(roas: number | null): string {
  if (roas == null) return "text-slate-400";
  if (roas > 4) return "text-emerald-600";
  if (roas >= 2) return "text-amber-600";
  return "text-red-600";
}

export function CampaignGrid({ cards }: { cards: CampaignCard[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = cards.find((c) => c.campaignKey === openKey) ?? null;

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#1A56DB]/10 text-2xl">📈</div>
        <p className="text-sm font-semibold text-slate-900">No campaign attribution yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Add <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">utm_campaign</code> tags to your Meta
          ads to start matching real bookings to the campaigns that drove them.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const st = statusOf(c);
          return (
            <button
              key={c.campaignKey}
              type="button"
              onClick={() => setOpenKey(c.campaignKey)}
              className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{c.campaignName}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${st.cls}`}>
                  {st.label}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">True ROAS</p>
                  <p className={`text-4xl font-semibold tracking-tight tabular-nums ${roasColor(c.realRoas)}`}>
                    {formatMultiple(c.realRoas)}
                  </p>
                </div>
                <Sparkline values={c.spark} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Spend</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(c.spend)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Real bookings</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900">{formatNumber(c.realBookings)}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpenKey(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{open.campaignName}</h3>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusOf(open).cls}`}>
                  {statusOf(open).label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpenKey(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">True ROAS</p>
              <p className={`text-5xl font-semibold tracking-tight tabular-nums ${roasColor(open.realRoas)}`}>
                {formatMultiple(open.realRoas)}
              </p>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <Detail label="Spend" value={formatCurrency(open.spend)} />
              <Detail label="Real revenue" value={formatCurrency(open.realRevenue)} />
              <Detail label="Real bookings" value={formatNumber(open.realBookings)} />
              <Detail label="Meta-claimed bookings" value={formatNumber(open.metaBookings)} />
              <Detail label="Impressions" value={formatNumber(open.impressions)} />
              <Detail label="Clicks" value={formatNumber(open.clicks)} />
              <Detail label="CTR" value={formatPercent(open.ctr)} />
              <Detail
                label="Meta vs real"
                value={
                  open.variancePct == null
                    ? "—"
                    : `${open.variancePct > 0 ? "+" : ""}${Math.round(open.variancePct)}%`
                }
                valueClass={
                  open.variancePct != null && open.variancePct > 50 ? "text-red-600" : "text-slate-900"
                }
              />
            </dl>

            <div className="mt-5">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Last 7 days spend</p>
              <Sparkline values={open.spark} width={300} height={48} className="h-12" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Detail({ label, value, valueClass = "text-slate-900" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-base font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}
