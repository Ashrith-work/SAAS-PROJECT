// Generic loading skeleton for every page under the (app) group — Next.js
// renders this while the page's server component is fetching. Mirrors the
// typical page shape (header + KPI cards + a wide content block) so the layout
// doesn't shift when real data arrives.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-elevated ${className}`} />;
}

function Card() {
  return (
    <div className="rounded-xl border border-line p-4">
      <Bar className="h-3 w-16" />
      <Bar className="mt-2 h-7 w-24" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Bar className="h-7 w-56" />
          <Bar className="h-4 w-40" />
        </div>
        <Bar className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} />
        ))}
      </div>
      <div className="rounded-xl border border-line p-6">
        <Bar className="h-4 w-48" />
        <Bar className="mt-4 h-56 w-full" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
