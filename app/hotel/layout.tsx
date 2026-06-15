import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
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

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href={dashboardHref} className="font-semibold text-ink">HotelTrack</Link>
            {hotel && (
              <Link href={dashboardHref} className="text-sm font-medium text-ink-secondary hover:text-ink">
                My Dashboard
              </Link>
            )}
          </div>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
