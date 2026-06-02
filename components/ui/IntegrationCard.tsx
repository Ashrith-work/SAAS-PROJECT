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
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            {icon}
          </div>
          <div>
            <h2 className="font-semibold leading-tight">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="shrink-0">{badge}</div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
