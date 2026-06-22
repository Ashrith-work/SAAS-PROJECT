"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Top-nav link with an active-state treatment (blue-tinted rounded pill).
// Purely presentational: it does not change any destination — it only reflects
// which nav item matches the current path. Used by the agency, hotel and admin
// header chrome so the active section reads consistently everywhere.
//
// `exact` is for section-index routes (e.g. "/admin") that would otherwise match
// every nested page via the startsWith check below.
export function NavLink({
  href,
  children,
  exact = false,
}: {
  href: string;
  children: ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-button px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
        active
          ? "bg-brand/10 text-brand"
          : "text-ink-tertiary hover:bg-elevated hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
