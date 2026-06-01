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
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-semibold">
              HotelTrack
            </Link>
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-black">
              Admin
            </span>
            <nav className="ml-2 flex items-center gap-3 text-sm text-zinc-500">
              <Link href="/admin" className="hover:text-black dark:hover:text-white">
                Overview
              </Link>
              <Link href="/admin/billing" className="hover:text-black dark:hover:text-white">
                Billing
              </Link>
              <Link href="/admin/audit" className="hover:text-black dark:hover:text-white">
                Audit log
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
