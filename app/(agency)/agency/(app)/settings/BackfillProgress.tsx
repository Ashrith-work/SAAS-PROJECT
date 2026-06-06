"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveBackfill, type BackfillJobView } from "./backfill-actions";

const POLL_MS = 3000;

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// Polls the agency's latest backfill job and renders a live banner. Triggers the
// run (POST /api/meta/backfill) once for a pending job. Rendered on Settings and
// the integrations page; self-hides when there's nothing to show.
//
// The parent passes `key={job?.id ?? "none"}` so a new server-provided job
// remounts this component fresh (no prop→state syncing effect needed).
export function BackfillProgress({ initialJob }: { initialJob: BackfillJobView | null }) {
  const router = useRouter();
  const [job, setJob] = useState<BackfillJobView | null>(initialJob);
  const [dismissed, setDismissed] = useState(false);
  const triggeredRef = useRef<string | null>(null);
  const refreshedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!job) return;
    const active = job.status === "pending" || job.status === "running";

    if (!active) {
      // Finished — refresh the page once so the restored data shows, then stop.
      if (refreshedRef.current !== job.id) {
        refreshedRef.current = job.id;
        router.refresh();
      }
      return;
    }

    // Kick off the run exactly once per mount for an active job. For "pending"
    // this starts the work; for "running" it lets the server resume a job whose
    // previous runner timed out (the claim is atomic server-side, so a healthy
    // running job is left untouched).
    if (triggeredRef.current !== job.id) {
      triggeredRef.current = job.id;
      void fetch("/api/meta/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      }).catch(() => {});
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      const next = await getActiveBackfill();
      if (!cancelled) setJob(next);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [job, router]);

  if (!job || dismissed) return null;

  const active = job.status === "pending" || job.status === "running";

  if (active) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
        <Spinner />
        <span>
          Pulling missing data from <strong>{job.rangeStart}</strong> to{" "}
          <strong>{job.rangeEnd}</strong>… this may take a few minutes.
          {job.daysRestored > 0 && (
            <span className="text-amber-700/80 dark:text-amber-300/80">
              {" "}
              ({job.daysRestored} day{job.daysRestored === 1 ? "" : "s"} so far)
            </span>
          )}
        </span>
      </div>
    );
  }

  const tone =
    job.status === "completed"
      ? "border-green-300 bg-green-50 text-green-800 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-300"
      : job.status === "partial"
        ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300"
        : "border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300";

  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <span>{job.message ?? "Backfill finished."}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 font-medium opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
