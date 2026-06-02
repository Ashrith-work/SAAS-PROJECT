import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { isPixelMode } from "@/lib/tracking-mode";
import { SnippetStatusBadge } from "@/components/ui/SnippetStatusBadge";
import { ExportMenu } from "@/components/ui/ExportMenu";
import {
  loadListStates,
  snippetTone,
  tokenTone,
  gaTone,
  SNIPPET_LABELS,
  TOKEN_LABELS,
  GA_LABELS,
  TONE_DOT,
  type HotelStatusSummary,
} from "@/lib/integration-status";

function formatLastEvent(d: Date | null): string {
  if (!d) return "No events yet";
  return new Date(d).toLocaleString();
}

// Three colored dots — snippet / Meta / GA4 — summarising this hotel's
// integration health. Links to the hotel's Integrations page.
function IntegrationDots({
  hotelId,
  summary,
  pixelMode,
}: {
  hotelId: string;
  summary: HotelStatusSummary;
  pixelMode: boolean;
}) {
  const dots: { tone: ReturnType<typeof tokenTone>; title: string }[] = [
    pixelMode
      ? { tone: "gray", title: "Snippet: Facebook Pixel mode" }
      : {
          tone: snippetTone(summary.snippet),
          title: `Snippet: ${SNIPPET_LABELS[summary.snippet]}`,
        },
    { tone: tokenTone(summary.meta), title: `Meta Ads: ${TOKEN_LABELS[summary.meta]}` },
    { tone: gaTone(summary.ga), title: `Google Analytics: ${GA_LABELS[summary.ga]}` },
  ];

  return (
    <Link
      href={`/agency/hotel/${hotelId}/integrations`}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
      title="Manage integrations"
    >
      {dots.map((d, i) => (
        <span
          key={i}
          title={d.title}
          className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[d.tone]}`}
        />
      ))}
    </Link>
  );
}

export default async function HotelsPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  // Multi-tenant: agencyScoped injects { agencyId } automatically.
  const hotels = await agencyScoped(prisma.hotelClient).findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      snippetStatus: true,
      lastEventAt: true,
    },
  });

  const pixelMode = isPixelMode();
  // Batched per-hotel integration states (no N+1).
  const states = await loadListStates(hotels, member.agency.plan, pixelMode);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Hotel Clients</h1>
        <div className="flex items-center gap-2">
          <ExportMenu basePath="/api/hotels/export" />
          <Link
            href="/agency/hotels/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Add Hotel Client
          </Link>
        </div>
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
                <th className="px-4 py-3 font-medium">
                  Integrations
                  <span className="ml-1 font-normal normal-case text-zinc-400">
                    (snippet · Meta · GA4)
                  </span>
                </th>
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
                      href={`/agency/hotel/${h.id}`}
                      className="font-medium hover:underline"
                    >
                      {h.name}
                    </Link>
                    <div className="text-xs text-zinc-500">{h.websiteUrl}</div>
                  </td>
                  <td className="px-4 py-3">
                    {states.get(h.id) && (
                      <IntegrationDots
                        hotelId={h.id}
                        summary={states.get(h.id)!}
                        pixelMode={pixelMode}
                      />
                    )}
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
