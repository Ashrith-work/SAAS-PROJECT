import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { getCurrentMember } from "@/lib/auth";

export default async function AgencyDashboardPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <span className="font-semibold">HotelTrack</span>
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col gap-2 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {member.name}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Agency: <span className="font-medium">{member.agency.name}</span>
        </p>
        <p className="text-sm text-zinc-500">
          Agency role: {member.role} · platform role: agency_admin
        </p>
        <p className="mt-6 max-w-prose text-sm text-zinc-400">
          This is a placeholder dashboard. Hotel clients, content tracking, and
          analytics arrive in later steps.
        </p>
      </main>
    </div>
  );
}
