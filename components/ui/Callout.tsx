import type { ReactNode } from "react";

// Callout box — translucent tint + matching left border, dark theme.
// tone drives both. Used across the setup guide, dashboards and forms.

export type CalloutTone = "info" | "warn" | "success" | "danger";

const TONE: Record<
  CalloutTone,
  { wrap: string; badge: string; label: string; icon: string }
> = {
  info: {
    wrap: "bg-info/10 border-info",
    badge: "bg-info text-white",
    label: "text-info",
    icon: "i",
  },
  warn: {
    wrap: "bg-warning/10 border-warning",
    badge: "bg-warning text-[#0a0e1a]",
    label: "text-warning",
    icon: "!",
  },
  success: {
    wrap: "bg-success/10 border-success",
    badge: "bg-success text-[#0a0e1a]",
    label: "text-success",
    icon: "✓",
  },
  danger: {
    wrap: "bg-danger/10 border-danger",
    badge: "bg-danger text-white",
    label: "text-danger",
    icon: "×",
  },
};

export function Callout({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      data-callout
      className={`my-4 flex gap-3 rounded-r-xl border-l-4 ${t.wrap} p-4 text-sm leading-relaxed text-ink-secondary ${className}`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.badge}`}
        aria-hidden
      >
        {t.icon}
      </span>
      <div className="min-w-0">
        {title && <p className={`mb-1 font-semibold ${t.label}`}>{title}</p>}
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}
