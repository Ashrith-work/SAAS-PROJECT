import type { ReactNode } from "react";

// Shared shell for the integration cards on /agency/hotel/[id]/integrations.
// Consistent layout: icon/logo top-left, title + subtitle, status badge top
// right, content below. Full-width so cards stack on mobile.
export function IntegrationCard({
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-elevated">
            {icon}
          </div>
          <div>
            <h2 className="font-semibold leading-tight text-ink">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-ink-tertiary">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="shrink-0">{badge}</div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
