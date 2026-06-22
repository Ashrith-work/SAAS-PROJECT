import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import {
  AppSidebar,
  AppMobileNav,
  IconDashboard,
  type NavItem,
} from "@/components/nav/AppSidebar";
import { prisma } from "@/lib/prisma";

// Minimal shell for the hotel-owner area. No agency nav — hotel owners only ever
// see their own hotel's dashboard. Per-hotel access is enforced inside each page.
// The only nav is the logo, a "My Dashboard" link, and the Clerk account menu
// (profile / sign out). Nothing here exposes other hotels or agency operations.
export default async function HotelLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  const hotel = userId
    ? await prisma.hotelClient.findFirst({
        where: { createdByUserId: userId, deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      })
    : null;
  const dashboardHref = hotel ? `/hotel/${hotel.id}/dashboard` : "/";
  const navItems: NavItem[] = hotel
    ? [{ href: dashboardHref, label: "My Dashboard", icon: IconDashboard }]
    : [];

  return (
    <div className="flex min-h-full">
      <AppSidebar brand={{ href: dashboardHref, label: "HotelTrack" }} items={navItems} />
      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-page/80 px-4 backdrop-blur sm:px-6 lg:px-8">
          <p className="text-base font-semibold tracking-tight text-ink">Your dashboard</p>
          <UserButton />
        </header>
        <AppMobileNav items={navItems} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
