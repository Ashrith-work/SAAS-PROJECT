import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SnippetStatusBadge } from "@/components/ui/SnippetStatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { InstagramConnect } from "./InstagramConnect";
import { InstagramActions } from "./InstagramActions";

const DAY_MS = 86_400_000;

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

  // ── Instagram (organic social) connection + latest stored insights ──
  const social = await prisma.socialAccount.findFirst({
    where: { agencyId: member.agencyId, hotelClientId: hotel.id, platform: "instagram" },
    select: {
      status: true,
      username: true,
      tokenExpiresAt: true,
      lastSyncedAt: true,
    },
  });
  const igConnected = social?.status === "connected";

  const since30 = new Date(new Date().getTime() - 30 * DAY_MS);
  const [latestSnap, reachAgg, recentPosts] = igConnected
    ? await Promise.all([
        prisma.socialSnapshot.findFirst({
          where: { agencyId: member.agencyId, hotelClientId: hotel.id },
          orderBy: { date: "desc" },
          select: { followers: true, date: true },
        }),
        prisma.socialSnapshot.aggregate({
          where: { agencyId: member.agencyId, hotelClientId: hotel.id, date: { gte: since30 } },
          _sum: { reach: true, impressions: true, profileViews: true },
        }),
        prisma.postSnapshot.findMany({
          where: { agencyId: member.agencyId, hotelClientId: hotel.id },
          orderBy: { postedAt: "desc" },
          take: 8,
          select: {
            mediaId: true,
            caption: true,
            mediaType: true,
            permalink: true,
            postedAt: true,
            reach: true,
            engagement: true,
            saves: true,
            videoViews: true,
          },
        }),
      ])
    : [null, null, []];

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

      {/* ── Instagram (organic social) ──────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Instagram (organic social)</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Separate from Meta Ads — this tracks organic reach, followers, and
              post engagement.
            </p>
          </div>
          {igConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              Not connected
            </span>
          )}
        </div>

        <div className="mt-4">
          {igConnected ? (
            <div className="space-y-5">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                <span className="font-medium">@{social?.username}</span> connected
                {social?.lastSyncedAt
                  ? ` · last synced ${new Date(social.lastSyncedAt).toLocaleString()}`
                  : " · not synced yet — run a sync to pull insights"}
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Followers" value={(latestSnap?.followers ?? 0).toLocaleString()} />
                <Stat label="Reach · 30d" value={(reachAgg?._sum.reach ?? 0).toLocaleString()} />
                <Stat
                  label="Impressions · 30d"
                  value={(reachAgg?._sum.impressions ?? 0).toLocaleString()}
                />
                <Stat
                  label="Profile views · 30d"
                  value={(reachAgg?._sum.profileViews ?? 0).toLocaleString()}
                />
              </div>

              <InstagramActions hotelId={hotel.id} />

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Recent posts
                </p>
                {recentPosts.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No posts synced yet. Click “Sync insights now”.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                        <tr>
                          <th className="px-3 py-2 font-medium">Post</th>
                          <th className="px-3 py-2 text-right font-medium">Reach</th>
                          <th className="px-3 py-2 text-right font-medium">Engagement</th>
                          <th className="px-3 py-2 text-right font-medium">Saves</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentPosts.map((p) => (
                          <tr key={p.mediaId} className="border-t border-zinc-100 dark:border-zinc-800">
                            <td className="px-3 py-2">
                              {p.permalink ? (
                                <a
                                  href={p.permalink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium hover:underline"
                                >
                                  {p.caption ? p.caption.slice(0, 48) : p.mediaType ?? "Post"}
                                </a>
                              ) : (
                                <span className="font-medium">
                                  {p.caption ? p.caption.slice(0, 48) : p.mediaType ?? "Post"}
                                </span>
                              )}
                              {p.postedAt && (
                                <span className="block text-xs text-zinc-500">
                                  {new Date(p.postedAt).toLocaleDateString()}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {p.reach.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {p.engagement.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {p.saves.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <InstagramConnect hotelId={hotel.id} />
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
