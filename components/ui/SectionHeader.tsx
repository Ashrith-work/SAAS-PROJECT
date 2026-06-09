import type { ReactNode } from "react";

// Page / section heading with optional eyebrow label and right-aligned action.

export function SectionHeader({
  title,
  subtitle,
  eyebrow,
  action,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-wide text-brand">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-ink-tertiary">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
