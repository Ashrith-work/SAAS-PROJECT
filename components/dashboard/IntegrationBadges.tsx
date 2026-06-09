import Link from "next/link";

// Small connection-status indicators for the top of the hotel dashboard, plus a
// shared "not connected" empty state for the data sections. Clicking a badge or
// the empty-state button goes to that hotel's integrations page.

export type BadgeState = "connected" | "warning" | "disconnected";

const ICON: Record<BadgeState, string> = { connected: "✓", warning: "⚠", disconnected: "✗" };
const CLS: Record<BadgeState, string> = {
  connected: "bg-success/15 text-success ring-success/30",
  warning: "bg-warning/15 text-warning ring-warning/30",
  disconnected: "bg-danger/15 text-danger ring-danger/30",
};
const LABEL: Record<BadgeState, string> = {
  connected: "connected",
  warning: "needs attention",
  disconnected: "not connected",
};

export function IntegrationBadges({
  hotelId,
  items,
}: {
  hotelId: string;
  items: { name: string; state: BadgeState }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => (
        <Link
          key={it.name}
          href={`/agency/hotel/${hotelId}/integrations`}
          title={`${it.name} — ${LABEL[it.state]}. Manage on the integrations page.`}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition hover:opacity-80 ${CLS[it.state]}`}
        >
          <span aria-hidden>{ICON[it.state]}</span>
          {it.name}
        </Link>
      ))}
    </div>
  );
}

export function IntegrationEmptyState({
  hotelId,
  title,
  body,
  cta,
}: {
  hotelId: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-tertiary">{body}</p>
      <Link
        href={`/agency/hotel/${hotelId}/integrations`}
        className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        {cta}
      </Link>
    </div>
  );
}
