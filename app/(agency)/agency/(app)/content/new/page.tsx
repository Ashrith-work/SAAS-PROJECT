import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ContentForm } from "./ContentForm";

export default async function NewContentPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  // Multi-tenant: only this agency's hotels can be picked.
  const hotels = await prisma.hotelClient.findMany({
    where: { agencyId: member.agencyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-xl">
      <Link href="/agency/content" className="text-sm text-zinc-500 hover:underline">
        ← Content
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">New Content Piece</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500">
        We&apos;ll generate a UTM-tagged link so visits and bookings from this
        content are attributed back to it.
      </p>

      {hotels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">
            Add a hotel client before creating content.
          </p>
          <Link
            href="/agency/hotels/new"
            className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Add a hotel client
          </Link>
        </div>
      ) : (
        <ContentForm hotels={hotels} />
      )}
    </div>
  );
}
