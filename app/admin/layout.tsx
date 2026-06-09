import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { getPlatformRole } from "@/lib/auth";

// Super-admin shell. The proxy already gates /admin to super_admin; this re-checks
// server-side as defense in depth (and to render an authoritative role-aware UI).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getPlatformRole();
  if (role !== "super_admin") redirect("/");

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-semibold text-ink">
              HotelTrack
            </Link>
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
              Admin
            </span>
            <nav className="ml-2 flex items-center gap-1 text-sm">
              <Link href="/admin" className="rounded-md px-3 py-1.5 text-ink-tertiary transition hover:bg-elevated hover:text-ink">
                Overview
              </Link>
              <Link href="/admin/billing" className="rounded-md px-3 py-1.5 text-ink-tertiary transition hover:bg-elevated hover:text-ink">
                Billing
              </Link>
              <Link href="/admin/audit" className="rounded-md px-3 py-1.5 text-ink-tertiary transition hover:bg-elevated hover:text-ink">
                Audit log
              </Link>
              <Link href="/admin/sync-now" className="rounded-md px-3 py-1.5 text-ink-tertiary transition hover:bg-elevated hover:text-ink">
                Sync now
              </Link>
            </nav>
          </div>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
