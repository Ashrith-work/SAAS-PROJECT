import Link from "next/link";
import { redirect } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getPlatformRole } from "@/lib/auth";

// Landing page. Hotel owners (hotel_client) who reach here — directly or after
// being bounced off an agency-only route by the proxy — are forwarded to their
// own hotel dashboard, carrying any "agency-restricted" notice so the dashboard
// can explain why they were redirected. Everyone else sees the marketing page.

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { userId } = await auth();
  if (userId) {
    const role = await getPlatformRole();
    if (role === "hotel_client") {
      const hotel = await prisma.hotelClient.findFirst({
        where: { createdByUserId: userId, deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (hotel) {
        const sp = await searchParams;
        const notice = sp.notice === "agency-restricted" ? "?notice=agency-restricted" : "";
        redirect(`/hotel/${hotel.id}/dashboard${notice}`);
      }
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">HotelTrack</h1>
        <p className="mt-2 text-ink-tertiary">
          Prove your content drives real hotel bookings.
        </p>
      </div>

      <Show when="signed-out">
        <div className="flex gap-3">
          <Link
            href="/sign-up"
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-elevated"
          >
            Sign in
          </Link>
        </div>
      </Show>

      <Show when="signed-in">
        <div className="flex items-center gap-4">
          <Link
            href="/agency/dashboard"
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover"
          >
            Go to dashboard
          </Link>
          <UserButton />
        </div>
      </Show>
    </main>
  );
}
