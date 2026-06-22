import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  AppSidebar,
  AppMobileNav,
  IconDashboard,
  IconBilling,
  IconAudit,
  IconSync,
  type NavItem,
} from "@/components/nav/AppSidebar";
import { getPlatformRole } from "@/lib/auth";

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: IconDashboard, exact: true },
  { href: "/admin/billing", label: "Billing", icon: IconBilling },
  { href: "/admin/audit", label: "Audit log", icon: IconAudit },
  { href: "/admin/sync-now", label: "Sync now", icon: IconSync },
];

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
    <div className="flex min-h-full">
      <AppSidebar
        brand={{
          href: "/admin",
          label: "HotelTrack",
          badge: (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
              Admin
            </span>
          ),
        }}
        items={ADMIN_NAV}
      />
      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-page/80 px-4 backdrop-blur sm:px-6 lg:px-8">
          <p className="text-base font-semibold tracking-tight text-ink">Super admin</p>
          <UserButton />
        </header>
        <AppMobileNav items={ADMIN_NAV} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
