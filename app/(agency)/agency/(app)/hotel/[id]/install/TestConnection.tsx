"use client";

import { useActionState } from "react";
import { testSnippetConnection, type TestConnectionState } from "./actions";
import type { TestLevel } from "@/lib/snippet-test";

const initialState: TestConnectionState = { error: null, result: null };

// Tailwind classes per traffic-light level. Kept as full literals (not built by
// string interpolation) so Tailwind's compiler keeps them.
const LEVEL_STYLES: Record<
  TestLevel,
  { card: string; dot: string; heading: string }
> = {
  green: {
    card: "border-green-300 bg-green-50 dark:border-green-800/60 dark:bg-green-900/20",
    dot: "bg-green-500",
    heading: "text-green-800 dark:text-green-300",
  },
  yellow: {
    card: "border-amber-300 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-900/20",
    dot: "bg-amber-500",
    heading: "text-amber-800 dark:text-amber-300",
  },
  red: {
    card: "border-red-300 bg-red-50 dark:border-red-800/60 dark:bg-red-900/20",
    dot: "bg-red-500",
    heading: "text-red-800 dark:text-red-300",
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function TestConnection({ hotelId }: { hotelId: string }) {
  const [state, action, pending] = useActionState(testSnippetConnection, initialState);
  const result = state.result;
  const styles = result ? LEVEL_STYLES[result.level] : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-zinc-500">
          Checks two things at once: whether the snippet is on your homepage, and
          whether we&apos;ve actually received events from it.
        </p>
        <form action={action} className="mt-3">
          <input type="hidden" name="hotelId" value={hotelId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {pending ? "Testing…" : "Test connection"}
          </button>
        </form>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {result && styles && (
        <div className={`rounded-xl border p-4 ${styles.card}`}>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
            <p className={`text-sm font-semibold ${styles.heading}`}>{result.title}</p>
          </div>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{result.detail}</p>

          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
            <Row
              label="Snippet on homepage"
              value={
                result.fetchError
                  ? "Couldn't check"
                  : result.snippetDetected
                    ? "Found"
                    : "Not found"
              }
            />
            <Row label="Events received (all time)" value={result.eventsEver.toLocaleString()} />
            <Row label="Events in last 30 min" value={result.recentEvents.toLocaleString()} />
            <Row
              label="Last event"
              value={result.lastEventAt ? timeAgo(result.lastEventAt) : "never"}
            />
            <Row
              label="Last conversion"
              value={result.lastConversionAt ? timeAgo(result.lastConversionAt) : "never"}
            />
            <Row label="Checked" value={result.checkedUrl} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-black/5 py-1 dark:border-white/5">
      <dt>{label}</dt>
      <dd className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
        {value}
      </dd>
    </div>
  );
}
