"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/format";
import { hashEmailClient, hashPhoneClient } from "@/lib/pii-client";
import { lookupVisitorJourneys, type LookupResult } from "./actions";

// Customer Journey Lookup (Part 6) — the "VIP customer view". Search by name or
// email/phone; for email/phone we hash CLIENT-SIDE before calling the server, so
// the raw value never leaves the browser (the server only ever sees the hash).

function looksLikeEmail(q: string): boolean {
  return /\S+@\S+/.test(q);
}
function looksLikePhone(q: string): boolean {
  const digits = q.replace(/[^0-9]/g, "");
  return digits.length >= 7 && /^[\d\s+()-]+$/.test(q.trim());
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CustomerJourneyLookup({ hotelId }: { hotelId: string }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [mode, setMode] = useState<"name" | "email" | "phone" | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setResult(null);
    try {
      if (looksLikeEmail(query)) {
        setMode("email");
        const emailHash = await hashEmailClient(query); // hashed in the browser
        setResult(await lookupVisitorJourneys(hotelId, { emailHash }));
      } else if (looksLikePhone(query)) {
        setMode("phone");
        const phoneHash = await hashPhoneClient(query);
        setResult(await lookupVisitorJourneys(hotelId, { phoneHash }));
      } else {
        setMode("name");
        setResult(await lookupVisitorJourneys(hotelId, { name: query }));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="min-w-[16rem] flex-1 rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-brand focus:ring-1 focus:ring-brand"
          aria-label="Search visitors by name, email, or phone"
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <p className="text-xs text-ink-tertiary">
        Email &amp; phone are hashed in your browser before searching — we never send or
        store the raw value. Looking someone up matches the hashed identifier only.
      </p>

      {result && !result.found && (
        <div className="rounded-lg border border-line bg-card px-4 py-6 text-center text-sm text-ink-tertiary">
          No identified visitor matches{" "}
          <span className="text-ink-secondary">
            {mode === "email" ? "that email" : mode === "phone" ? "that phone" : `“${q.trim()}”`}
          </span>
          . They may not have identified themselves via a booking form yet.
        </div>
      )}

      {result && result.found && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {result.name ?? "Unnamed visitor"}
                {result.customerId && (
                  <span className="ml-2 text-xs font-normal text-ink-tertiary">
                    ID {result.customerId}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-tertiary">
                <code title={result.visitorId ?? undefined}>{result.visitorId}</code> ·{" "}
                {result.sessionCount} session{result.sessionCount === 1 ? "" : "s"}
                {result.matchCount > 1 && (
                  <span className="ml-1 text-warning">· {result.matchCount} people matched (showing latest)</span>
                )}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {result.sessions.map((s) => (
              <div key={s.id} className="rounded-lg border border-line bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{fmtDateTime(s.startedAtISO)}</p>
                  <div className="flex items-center gap-2 text-xs text-ink-tertiary">
                    <span>{s.pageViewCount} pages</span>
                    <span>· {formatDuration(s.durationMs)}</span>
                    {s.converted && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">
                        Converted
                      </span>
                    )}
                  </div>
                </div>

                {s.pages.length > 0 && (
                  <ol className="mt-3 space-y-1 text-xs text-ink-secondary">
                    {s.pages.map((p, i) => (
                      <li key={i} className="flex items-baseline gap-2">
                        <span className="text-ink-tertiary tabular-nums">{i + 1}.</span>
                        <span className="break-all">{p.pagePath}</span>
                        {p.timeOnPageMs != null && (
                          <span className="text-ink-tertiary">· {formatDuration(p.timeOnPageMs)}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}

                {(s.clicks.length > 0 || s.forms.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.clicks.map((c, i) => (
                      <span
                        key={`c${i}`}
                        className="rounded bg-brand/10 px-1.5 py-0.5 text-[11px] text-brand ring-1 ring-brand/20"
                        title={c.pagePath}
                      >
                        🖱 {c.clickTarget}
                      </span>
                    ))}
                    {s.forms.map((f, i) => (
                      <span
                        key={`f${i}`}
                        className={`rounded px-1.5 py-0.5 text-[11px] ring-1 ${
                          f.action === "blurred" && f.hasValue === false
                            ? "bg-danger/10 text-danger ring-danger/20"
                            : "bg-line/40 text-ink-secondary ring-line"
                        }`}
                      >
                        ⌨ {f.fieldName} {f.action === "focused" ? "focus" : f.hasValue ? "filled" : "empty"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
