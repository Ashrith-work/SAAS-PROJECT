import type { IntegrationTone } from "@/lib/integration-status";

// Status pill for an integration card. Full class literals per tone so
// Tailwind's compiler keeps them (it can't see interpolated class names).
const TONE: Record<IntegrationTone, { pill: string; dot: string }> = {
  gray: {
    pill: "bg-elevated text-ink-tertiary",
    dot: "bg-ink-disabled",
  },
  green: {
    pill: "bg-success/15 text-success",
    dot: "bg-success",
  },
  yellow: {
    pill: "bg-warning/15 text-warning",
    dot: "bg-warning",
  },
  red: {
    pill: "bg-danger/15 text-danger",
    dot: "bg-danger",
  },
};

export function IntegrationStatusBadge({
  tone,
  label,
}: {
  tone: IntegrationTone;
  label: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${t.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {label}
    </span>
  );
}
