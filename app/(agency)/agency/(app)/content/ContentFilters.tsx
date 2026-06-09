import Link from "next/link";

// Server-rendered filter bar. A plain GET form so it works without JS: submitting
// reloads /agency/content with the chosen filters in the query string, which the
// page reads from searchParams.
const TYPE_OPTIONS = [
  { value: "organic", label: "Organic post" },
  { value: "paid_ad", label: "Paid ad" },
  { value: "influencer", label: "Influencer collab" },
  { value: "story", label: "Story" },
];
const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
];

const fieldCls =
  "w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-disabled outline-none focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export function ContentFilters({
  hotels,
  current,
}: {
  hotels: { id: string; name: string }[];
  current: { hotel: string; type: string; platform: string; from: string; to: string };
}) {
  return (
    <form
      method="get"
      className="grid grid-cols-1 gap-3 rounded-xl border border-line p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <label className="space-y-1 lg:col-span-2">
        <span className="text-xs font-medium text-ink-tertiary">Hotel</span>
        <select name="hotel" defaultValue={current.hotel} className={fieldCls}>
          <option value="">All hotels</option>
          {hotels.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-ink-tertiary">Type</span>
        <select name="type" defaultValue={current.type} className={fieldCls}>
          <option value="">All types</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-ink-tertiary">Platform</span>
        <select name="platform" defaultValue={current.platform} className={fieldCls}>
          <option value="">All platforms</option>
          {PLATFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-ink-tertiary">From</span>
        <input type="date" name="from" defaultValue={current.from} className={fieldCls} />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-ink-tertiary">To</span>
        <input type="date" name="to" defaultValue={current.to} className={fieldCls} />
      </label>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Apply filters
        </button>
        <Link
          href="/agency/content"
          className="rounded-lg border border-line-strong bg-elevated px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}
