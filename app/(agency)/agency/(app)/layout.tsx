import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { UserButton } from "@clerk/nextjs";
import { getCurrentMember } from "@/lib/auth";
import { isActiveStatus } from "@/lib/plans";
import { mustCompleteContactInfo } from "@/lib/agency-contact";

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

  // A super admin can suspend an agency independently of billing — block here.
  if (member.agency.suspendedAt) {
    redirect("/agency/suspended");
  }

  // New signups (created after this feature shipped) must provide contact info
  // before reaching the dashboard. The step lives outside this layout group, so
  // redirecting here can't loop. Existing agencies are never blocked (they get a
  // dismissible banner instead — see lib/agency-contact.ts).
  if (mustCompleteContactInfo(member.agency)) {
    redirect("/agency/onboarding/contact");
  }

  // Gate the whole agency dashboard behind an active subscription. While
  // inactive, the agency can still reach Billing (it lives outside this layout
  // group) and Settings, so they can pay or manage their account — everything
  // else bounces to Billing. The pathname is provided by proxy.ts.
  if (!isActiveStatus(member.agency.subscriptionStatus)) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (!pathname.startsWith("/agency/settings")) {
      redirect("/agency/billing?inactive=1");
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/agency/dashboard" className="font-semibold text-ink">
              HotelTrack
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {[
                { href: "/agency/dashboard", label: "Dashboard" },
                { href: "/agency/hotels", label: "Hotel Clients" },
                { href: "/agency/influencers", label: "Influencers" },
                { href: "/agency/alerts", label: "Alerts" },
                { href: "/agency/settings", label: "Settings" },
                { href: "/agency/billing", label: "Billing" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-ink-tertiary transition hover:bg-elevated hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-tertiary sm:inline">
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
