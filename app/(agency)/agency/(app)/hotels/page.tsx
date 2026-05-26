import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SnippetStatusBadge } from "@/components/ui/SnippetStatusBadge";

function formatLastEvent(d: Date | null): string {
  if (!d) return "No events yet";
  return new Date(d).toLocaleString();
}

export default async function HotelsPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  // Multi-tenant: only this agency's hotels.
  const hotels = await prisma.hotelClient.findMany({
    where: { agencyId: member.agencyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      snippetStatus: true,
      lastEventAt: true,
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Hotel Clients</h1>
        <Link
          href="/agency/hotels/new"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Add Hotel Client
        </Link>
      </div>

      {hotels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">No hotel clients yet.</p>
          <Link
            href="/agency/hotels/new"
            className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Add your first hotel client
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-medium">Hotel</th>
                <th className="px-4 py-3 font-medium">Snippet</th>
                <th className="px-4 py-3 font-medium">Last event</th>
              </tr>
            </thead>
            <tbody>
              {hotels.map((h) => (
                <tr
                  key={h.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/agency/hotels/${h.id}/setup`}
                      className="font-medium hover:underline"
                    >
                      {h.name}
                    </Link>
                    <div className="text-xs text-zinc-500">{h.websiteUrl}</div>
                  </td>
                  <td className="px-4 py-3">
                    <SnippetStatusBadge status={h.snippetStatus} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatLastEvent(h.lastEventAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
