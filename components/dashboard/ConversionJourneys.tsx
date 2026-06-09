"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";

// "View journey" drill-down for tracked conversions — the proof artifact an
// agency shows the hotel owner. All data is assembled server-side (already
// agency-scoped) and passed down serialized; this component only renders.

export type ConversionJourney = {
  id: string;
  /** Booking */
  convertedAt: string; // ISO
  conversionValue: number | null;
  bookingPage: string;
  /** First touch (null when the session's first visit wasn't captured) */
  firstTouch: {
    campaign: string | null;
    adTag: string | null; // utm_content
    source: string | null; // utm_source
    date: string; // ISO
    landingPage: string;
  } | null;
  /** Distinct pages between first touch and conversion, in order */
  pagesVisited: string[];
  daysToConvert: number | null;
  /** Final attribution */
  attributedTo: string;
  attributionReason: string;
};

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? u.search : "") || "/";
  } catch {
    return url;
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const REASON_LABEL: Record<string, string> = {
  exact_utm_campaign: "utm_campaign matched the Meta campaign name exactly",
  utm_content_tag: "utm_content carried the campaign-identifying tag",
  first_touch_session:
    "first visit in this session carried the campaign tag (30-day first-touch)",
  unattributed: "no campaign tag or ad click id on any visit in this session",
};

export function ConversionJourneys({ journeys }: { journeys: ConversionJourney[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = journeys.find((j) => j.id === openId) ?? null;

  if (journeys.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-ink-tertiary">
        No conversions tracked in this range yet.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-tertiary">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 text-right font-medium">Value</th>
              <th className="px-4 py-2 font-medium">Attributed to</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {journeys.map((j) => (
              <tr key={j.id} className="border-t border-line">
                <td className="px-4 py-2 tabular-nums">{fmtDate(j.convertedAt)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {j.conversionValue == null ? "—" : formatCurrency(j.conversionValue)}
                </td>
                <td className="px-4 py-2">{j.attributedTo}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setOpenId(j.id)}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    View journey
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpenId(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-elevated p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold text-ink">Visitor journey</h3>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded p-1 text-ink-tertiary hover:bg-line-strong"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  First touch
                </dt>
                {open.firstTouch ? (
                  <dd className="mt-1 space-y-0.5">
                    <p>
                      <span className="font-medium">Campaign:</span>{" "}
                      {open.firstTouch.campaign ?? "— (untagged)"}
                    </p>
                    {open.firstTouch.adTag && (
                      <p>
                        <span className="font-medium">Ad / content tag:</span>{" "}
                        <code className="rounded bg-code px-1 py-0.5 text-xs text-codeink">
                          {open.firstTouch.adTag}
                        </code>
                      </p>
                    )}
                    {open.firstTouch.source && (
                      <p>
                        <span className="font-medium">Source:</span>{" "}
                        {open.firstTouch.source}
                      </p>
                    )}
                    <p>
                      <span className="font-medium">Date:</span>{" "}
                      {fmtDate(open.firstTouch.date)}
                    </p>
                    <p>
                      <span className="font-medium">Landing page:</span>{" "}
                      <span className="break-all">{pathOf(open.firstTouch.landingPage)}</span>
                    </p>
                  </dd>
                ) : (
                  <dd className="mt-1 text-ink-tertiary">
                    No earlier visit captured for this session.
                  </dd>
                )}
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Pages visited
                </dt>
                <dd className="mt-1">
                  {open.pagesVisited.length === 0 ? (
                    <span className="text-ink-tertiary">Converted on the landing page.</span>
                  ) : (
                    <ol className="list-inside list-decimal space-y-0.5">
                      {open.pagesVisited.map((p, i) => (
                        <li key={i} className="break-all">
                          {pathOf(p)}
                        </li>
                      ))}
                    </ol>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Time to convert
                </dt>
                <dd className="mt-1">
                  {open.daysToConvert == null
                    ? "—"
                    : open.daysToConvert === 0
                      ? "Same day as first touch"
                      : `${open.daysToConvert} day${open.daysToConvert === 1 ? "" : "s"} after first touch`}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Booking
                </dt>
                <dd className="mt-1 space-y-0.5">
                  <p>
                    <span className="font-medium">Date:</span> {fmtDate(open.convertedAt)}
                  </p>
                  <p>
                    <span className="font-medium">Value:</span>{" "}
                    {open.conversionValue == null
                      ? "not captured"
                      : formatCurrency(open.conversionValue)}
                  </p>
                  <p>
                    <span className="font-medium">Page:</span>{" "}
                    <span className="break-all">{pathOf(open.bookingPage)}</span>
                  </p>
                </dd>
              </div>

              <div className="rounded-lg bg-card p-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Final attribution
                </dt>
                <dd className="mt-1">
                  <p className="font-medium">{open.attributedTo}</p>
                  <p className="mt-0.5 text-xs text-ink-tertiary">
                    Why: {REASON_LABEL[open.attributionReason] ?? open.attributionReason}
                  </p>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
