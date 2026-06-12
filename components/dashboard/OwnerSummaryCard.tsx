"use client";

import { useEffect, useRef, useState } from "react";

// Owner Summary card (Part 5) — a calm, glanceable plain-English read of recent
// performance at the very top of the hotel dashboard. Period toggle (default 7d),
// fade between summaries, skeleton while loading, "last updated" stamp. Built to
// be read on a phone.

type Period = "1d" | "7d" | "30d";
type Summary = { summary: string; periodLabel: string; pattern: string; generatedAt: string };

const TABS: { key: Period; label: string }[] = [
  { key: "1d", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.floor(mins / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

export function OwnerSummaryCard({ hotelId }: { hotelId: string }) {
  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setShown(false);
    setError(false);
    fetch(`/api/agency/hotels/${hotelId}/summary?period=${period}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (abort.current === ctrl) { setData(d as Summary); requestAnimationFrame(() => setShown(true)); } })
      .catch((e) => { if ((e as Error).name !== "AbortError" && abort.current === ctrl) setError(true); })
      .finally(() => { if (abort.current === ctrl) setLoading(false); });
    return () => ctrl.abort();
  }, [hotelId, period]);

  return (
    <section className="rounded-xl border border-brand/30 bg-brand/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Performance summary</p>
        <div className="inline-flex overflow-hidden rounded-lg border border-line-strong bg-page/60">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPeriod(t.key)}
              aria-pressed={period === t.key}
              className={`px-2.5 py-1 text-xs font-medium sm:px-3 sm:text-sm ${period === t.key ? "bg-brand text-white" : "text-ink-secondary hover:bg-elevated"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-h-[4.5rem]">
        {loading && !data ? (
          <Skeleton />
        ) : error ? (
          <p className="text-sm text-ink-tertiary">Couldn&apos;t load the summary right now.</p>
        ) : data ? (
          <p className={`text-base leading-relaxed text-ink transition-opacity duration-300 sm:text-lg ${shown ? "opacity-100" : "opacity-0"}`}>
            {data.summary}
          </p>
        ) : null}
      </div>

      {data && !loading && (
        <p className="mt-3 text-xs text-ink-tertiary">Last updated: {agoLabel(data.generatedAt)}</p>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="h-4 w-11/12 animate-pulse rounded bg-line-strong/60" />
      <div className="h-4 w-10/12 animate-pulse rounded bg-line-strong/60" />
      <div className="h-4 w-7/12 animate-pulse rounded bg-line-strong/60" />
    </div>
  );
}
