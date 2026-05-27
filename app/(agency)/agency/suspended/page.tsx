import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { getCurrentMember } from "@/lib/auth";

// Shown when a super admin has suspended the agency. Lives OUTSIDE the (app)
// route group so it isn't caught by that group's own suspension redirect.

export const dynamic = "force-dynamic";

export default async function SuspendedPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");
  // Not actually suspended → send them back to the dashboard.
  if (!member.agency.suspendedAt) redirect("/agency/dashboard");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        HotelTrack
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Your account is suspended
      </h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Access to {member.agency.name}&apos;s dashboard has been paused by the
        HotelTrack team. If you think this is a mistake, please contact support to
        get it reactivated.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <UserButton />
        <span className="text-sm text-zinc-500">{member.email}</span>
      </div>
    </main>
  );
}
