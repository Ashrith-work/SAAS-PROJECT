import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";

export default async function AgencyDashboardPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {member.name}
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Agency: <span className="font-medium">{member.agency.name}</span> ·
          role: {member.role}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="font-medium">Get started</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Add a hotel client, then install its tracking snippet to start
          attributing visits and bookings.
        </p>
        <Link
          href="/agency/hotels"
          className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Manage Hotel Clients →
        </Link>
      </div>
    </div>
  );
}
