import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { getCurrentMember } from "@/lib/auth";
import { isActiveStatus } from "@/lib/plans";

// Shell for the signed-in agency app (dashboard, hotel clients, …). Onboarding
// and billing live OUTSIDE this group so they aren't gated by the subscription
// check below (otherwise billing would redirect to itself).
export default async function AgencyAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  // Gate the whole agency dashboard behind an active subscription.
  if (!isActiveStatus(member.agency.subscriptionStatus)) {
    redirect("/agency/billing?inactive=1");
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/agency/dashboard" className="font-semibold">
              HotelTrack
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/agency/dashboard"
                className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Dashboard
              </Link>
              <Link
                href="/agency/hotels"
                className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Hotel Clients
              </Link>
              <Link
                href="/agency/content"
                className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Content
              </Link>
              <Link
                href="/agency/settings"
                className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Settings
              </Link>
              <Link
                href="/agency/billing"
                className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Billing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-zinc-500 sm:inline">
              {member.agency.name}
            </span>
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
