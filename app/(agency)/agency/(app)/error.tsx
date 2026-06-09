"use client";

// Per Next.js convention this catches uncaught errors inside any page within
// the (app) group — failed DB queries, Meta API timeouts, unhandled exceptions
// in server components. Friendly fallback with a retry button, and a developer
// digest hidden behind a <details> for debugging.

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the server log; in prod hook this into Sentry/Logtail.
    console.error("[agency app] page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-line p-6">
        <h1 className="text-lg font-semibold">Something went wrong loading this page</h1>
        <p className="mt-2 text-sm text-ink-tertiary">
          This usually means the database, Meta API, or another upstream service
          had a hiccup. Try again — if it keeps failing, contact support.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Try again
          </button>
          <a
            href="/agency/dashboard"
            className="text-sm text-ink-tertiary hover:underline"
          >
            Back to dashboard
          </a>
        </div>
        {error.digest && (
          <details className="mt-5 text-xs text-ink-tertiary">
            <summary className="cursor-pointer">Error reference</summary>
            <code className="mt-2 block break-all rounded bg-code px-2 py-1 text-codeink">
              {error.digest}
            </code>
          </details>
        )}
      </div>
    </div>
  );
}
