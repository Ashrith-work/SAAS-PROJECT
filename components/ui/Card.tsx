import type { ReactNode } from "react";

// Standard surface card — bg-card on the page, subtle border, soft dark shadow.
// Use `elevated` for modals/popovers that should sit a step above normal cards.

export function Card({
  children,
  className = "",
  elevated = false,
  padding = "p-5",
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  padding?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line ${
        elevated ? "bg-elevated" : "bg-card"
      } ${padding} shadow-[0_1px_3px_rgba(0,0,0,0.3)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight text-ink">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-sm text-ink-tertiary">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-line px-5 py-3 text-sm text-ink-tertiary">
      {children}
    </div>
  );
}
