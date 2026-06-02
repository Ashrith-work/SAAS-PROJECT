import type { IntegrationTone } from "@/lib/integration-status";

// Status pill for an integration card. Full class literals per tone so
// Tailwind's compiler keeps them (it can't see interpolated class names).
const TONE: Record<IntegrationTone, { pill: string; dot: string }> = {
  gray: {
    pill: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    dot: "bg-zinc-400",
  },
  green: {
    pill: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    dot: "bg-green-500",
  },
  yellow: {
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  red: {
    pill: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    dot: "bg-red-500",
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
