"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/format";

// Session cards + a drill-down vertical timeline of every PageView in a session.
// All data is assembled server-side (agency-scoped) and passed serialized; this
// component only renders + handles the open/close of the timeline modal.

export type JourneySession = {
  id: string;
  visitorId: string;
  startedAtLabel: string; // relative, e.g. "2 hours ago"
  startedAtISO: string; // absolute (tooltip)
  durationMs: number;
  pageViewCount: number;
  landingPath: string;
  exitPath: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  converted: boolean;
  pages: {
    pagePath: string;
    pageTitle: string | null;
    enteredAt: string; // ISO
    timeOnPageMs: number | null;
    exitReason: string | null;
  }[];
};

// A page is a "quick bounce" under 5s, "engaged" over 60s — drives the dot color.
const QUICK_MS = 5_000;
const LONG_MS = 60_000;

const EXIT_LABEL: Record<string, string> = {
  navigation: "navigated on",
  unload: "left the site",
  inactivity_timeout: "went idle",
};

function shortVisitor(v: string): string {
  return v.length > 14 ? `${v.slice(0, 14)}…` : v;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function JourneyList({ sessions }: { sessions: JourneySession[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = sessions.find((s) => s.id === openId) ?? null;

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-card px-4 py-10 text-center text-sm text-ink-tertiary">
        No visitor journeys in this range yet. Journeys appear once a hotel installs
        the v2 tracking snippet and visitors browse the site.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpenId(s.id)}
            className="rounded-xl border border-line bg-card p-4 text-left transition hover:border-line-strong hover:bg-elevated"
          >
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs text-ink-tertiary" title={s.visitorId}>
                {shortVisitor(s.visitorId)}
              </code>
              {s.converted && (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                  Converted
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-tertiary" title={new Date(s.startedAtISO).toLocaleString()}>
              {s.startedAtLabel}
            </p>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>
                <span className="text-ink-tertiary">Duration</span>{" "}
                <span className="font-medium tabular-nums">{formatDuration(s.durationMs)}</span>
              </span>
              <span>
                <span className="text-ink-tertiary">Pages</span>{" "}
                <span className="font-medium tabular-nums">{s.pageViewCount}</span>
              </span>
            </div>

            <dl className="mt-3 space-y-0.5 text-xs">
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-ink-tertiary">Landing</dt>
                <dd className="truncate font-medium text-ink-secondary">{s.landingPath}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-ink-tertiary">Exit</dt>
                <dd className="truncate font-medium text-ink-secondary">{s.exitPath ?? "—"}</dd>
              </div>
            </dl>

            {(s.utmSource || s.utmMedium || s.utmCampaign) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {s.utmSource && <Tag label={s.utmSource} />}
                {s.utmMedium && <Tag label={s.utmMedium} />}
                {s.utmCampaign && <Tag label={s.utmCampaign} />}
              </div>
            )}
          </button>
        ))}
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
              <div>
                <h3 className="text-lg font-semibold text-ink">Visitor journey</h3>
                <p className="mt-0.5 text-xs text-ink-tertiary">
                  <code title={open.visitorId}>{shortVisitor(open.visitorId)}</code> ·{" "}
                  {open.pageViewCount} page{open.pageViewCount === 1 ? "" : "s"} ·{" "}
                  {formatDuration(open.durationMs)}
                  {open.converted && <span className="ml-1 text-success">· Converted</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded p-1 text-ink-tertiary hover:bg-line-strong"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <ol className="mt-5 space-y-0">
              {open.pages.map((p, i) => {
                const last = i === open.pages.length - 1;
                const t = p.timeOnPageMs;
                const tone =
                  t == null ? "bg-ink-disabled" : t < QUICK_MS ? "bg-danger" : t >= LONG_MS ? "bg-success" : "bg-warning";
                return (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
                      {!last && <span className="w-px flex-1 bg-line-strong" />}
                    </div>
                    <div className={`min-w-0 ${last ? "" : "pb-5"}`}>
                      <p className="break-all text-sm font-medium text-ink">{p.pagePath}</p>
                      {p.pageTitle && (
                        <p className="truncate text-xs text-ink-tertiary">{p.pageTitle}</p>
                      )}
                      <p className="mt-0.5 text-xs text-ink-tertiary tabular-nums">
                        {fmtTime(p.enteredAt)}
                        {t != null && <> · {formatDuration(t)} on page</>}
                        {p.exitReason && <> · {EXIT_LABEL[p.exitReason] ?? p.exitReason}</>}
                        {t == null && p.exitReason == null && <> · still open</>}
                      </p>
                    </div>
                  </li>
                );
              })}
              {open.pages.length === 0 && (
                <li className="text-sm text-ink-tertiary">No page views recorded for this session.</li>
              )}
            </ol>

            <div className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-[11px] text-ink-tertiary">
              <Legend tone="bg-danger" label="quick bounce (<5s)" />
              <Legend tone="bg-warning" label="browsed" />
              <Legend tone="bg-success" label="engaged (>60s)" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded bg-card px-1.5 py-0.5 text-[11px] text-ink-secondary ring-1 ring-line">
      {label}
    </span>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      {label}
    </span>
  );
}
