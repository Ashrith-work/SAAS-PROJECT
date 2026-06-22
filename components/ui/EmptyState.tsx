import type { ReactNode } from "react";

// Empty / zero-data placeholder — dashed card, muted copy, optional CTA.

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-card/50 px-6 py-12 text-center ${className}`}
    >
      {icon && <div className="mb-3 text-ink-tertiary">{icon}</div>}
      <p className="text-sm font-semibold text-ink-secondary">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-tertiary">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
