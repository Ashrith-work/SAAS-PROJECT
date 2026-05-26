import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SnippetStatusBadge } from "@/components/ui/SnippetStatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";

export default async function HotelSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  // Multi-tenant: scope the lookup by both id AND agencyId so one agency can
  // never open another agency's hotel.
  const hotel = await prisma.hotelClient.findFirst({
    where: { id, agencyId: member.agencyId },
  });
  if (!hotel) notFound();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com").replace(
    /\/$/,
    "",
  );
  const snippet = `<script src="${appUrl}/t.js?id=${hotel.siteId}" async></script>`;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/agency/hotels" className="text-sm text-zinc-500 hover:underline">
          ← Hotel Clients
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{hotel.name}</h1>
        <p className="text-zinc-500">{hotel.websiteUrl}</p>
        <div className="mt-2">
          <SnippetStatusBadge status={hotel.snippetStatus} />
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="font-semibold">Install the tracking snippet</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Add this one line to every page of {hotel.websiteUrl}.
        </p>
        <div className="mt-4 flex items-start gap-2">
          <code className="block flex-1 overflow-x-auto rounded-lg bg-zinc-950 px-4 py-3 text-sm text-zinc-100">
            {snippet}
          </code>
          <CopyButton text={snippet} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Site ID: <code>{hotel.siteId}</code>
        </p>
      </section>

      <section>
        <h2 className="font-semibold">Step-by-step for the hotel&apos;s developer</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Copy the snippet above.</li>
          <li>
            Paste it just before the closing <code>&lt;/head&gt;</code> tag on{" "}
            <strong>every page</strong> of the website — the homepage, room
            pages, and the whole booking flow.
          </li>
          <li>
            Deploy the change. The <code>async</code> attribute means it never
            blocks or slows down the page.
          </li>
          <li>
            Make a test booking. Within a few seconds the status above flips to{" "}
            <strong>Live</strong>.
          </li>
          <li>
            That&apos;s it — no other configuration needed. We only collect
            campaign (UTM) and page data, never personal information.
          </li>
        </ol>
      </section>
    </div>
  );
}
