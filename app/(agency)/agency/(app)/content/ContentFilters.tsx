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
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";

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
      className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-2 lg:grid-cols-6 dark:border-zinc-800"
    >
      <label className="space-y-1 lg:col-span-2">
        <span className="text-xs font-medium text-zinc-500">Hotel</span>
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
        <span className="text-xs font-medium text-zinc-500">Type</span>
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
        <span className="text-xs font-medium text-zinc-500">Platform</span>
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
        <span className="text-xs font-medium text-zinc-500">From</span>
        <input type="date" name="from" defaultValue={current.from} className={fieldCls} />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-zinc-500">To</span>
        <input type="date" name="to" defaultValue={current.to} className={fieldCls} />
      </label>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Apply filters
        </button>
        <Link
          href="/agency/content"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}
