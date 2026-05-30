import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { getPlan, hotelLimit } from "@/lib/plans";
import { HotelForm } from "./HotelForm";

export default async function NewHotelPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const limit = hotelLimit(member.agency.plan);
  const count = Number.isFinite(limit)
    ? await agencyScoped(prisma.hotelClient).count()
    : 0;
  const atLimit = Number.isFinite(limit) && count >= limit;

  return (
    <div className="max-w-xl">
      <Link href="/agency/hotels" className="text-sm text-zinc-500 hover:underline">
        ← Hotel Clients
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Add Hotel Client
      </h1>

      {atLimit ? (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-800/60 dark:bg-amber-900/20">
          <h2 className="font-medium text-amber-900 dark:text-amber-200">
            You&apos;ve reached your plan limit
          </h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Your {getPlan(member.agency.plan).name} plan includes up to {limit}{" "}
            hotel clients ({count}/{limit} used). Upgrade to add more.
          </p>
          <Link
            href="/agency/billing"
            className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            View plans →
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-1 mb-6 text-sm text-zinc-500">
            We&apos;ll generate a unique tracking snippet for this hotel after
            you save.
            {Number.isFinite(limit) && ` (${count}/${limit} hotels used)`}
          </p>
          <HotelForm />
        </>
      )}
    </div>
  );
}
