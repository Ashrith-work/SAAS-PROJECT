import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { isPixelMode } from "@/lib/tracking-mode";
import { planHasGa4 } from "@/lib/plans";
import { getTokenForApiCall } from "@/lib/token-access";
import { getAdAccounts, MetaAuthError, type AdAccount } from "@/lib/meta";
import {
  snippetState,
  snippetTone,
  metaState,
  instagramState,
  gaState,
  tokenTone,
  gaTone,
  summarize,
  SNIPPET_LABELS,
  TOKEN_LABELS,
  GA_LABELS,
  type TokenState,
  type GaState,
} from "@/lib/integration-status";
import { CopyButton } from "@/components/ui/CopyButton";
import { IntegrationCard } from "@/components/ui/IntegrationCard";
import { IntegrationStatusBadge } from "@/components/ui/IntegrationStatusBadge";
import { TestConnection } from "../install/TestConnection";
import { HotelAdAccountSelect } from "./HotelAdAccountSelect";
import { InstagramConnect } from "./InstagramConnect";
import { InstagramActions } from "./InstagramActions";
import { GoogleAnalyticsConnect } from "./GoogleAnalyticsConnect";
import { GoogleAnalyticsActions } from "./GoogleAnalyticsActions";
import { getActiveBackfill } from "@/app/(agency)/agency/(app)/settings/backfill-actions";
import { BackfillProgress } from "@/app/(agency)/agency/(app)/settings/BackfillProgress";

const DAY_MS = 86_400_000;

function daysAgo(d: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY_MS));
}

function SyncFailureNotice({ failedAt, now }: { failedAt: Date; now: Date }) {
  const n = daysAgo(failedAt, now);
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300">
      Data sync failed {n} day{n === 1 ? "" : "s"} ago. Reconnect your token to
      restore data flow.
    </div>
  );
}

function fmtDate(d: Date | null | undefined): string {
  return d ? new Date(d).toLocaleString() : "—";
}

function fmtExpiry(d: Date | null | undefined): string {
  if (!d) return "—";
  if (d.getUTCFullYear() >= 2900) return "Does not expire";
  return new Date(d).toLocaleString();
}

// Small lettered/icon glyphs for each card (kept inline to avoid an icon dep).
const SnippetIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 text-zinc-600 dark:text-zinc-300"
  >
    <path d="m8 6-6 6 6 6" />
    <path d="m16 6 6 6-6 6" />
  </svg>
);

export default async function HotelIntegrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  // Multi-tenant: scope by id AND agencyId so one agency can never open another
  // agency's hotel.
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      siteId: true,
      snippetStatus: true,
      lastEventAt: true,
      metaAdAccountId: true,
    },
  });
  if (!hotel) notFound();

  const pixelMode = isPixelMode();
  const planAllowsGa4 = planHasGa4(member.agency.plan);
  const now = new Date();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com").replace(
    /\/$/,
    "",
  );
  const snippet = `<script src="${appUrl}/t.js?id=${hotel.siteId}" async></script>`;

  // ── Meta (agency-wide token) ───────────────────────────────────────────────
  const token = await agencyScoped(prisma.metaToken).findFirst({
    orderBy: { createdAt: "desc" },
    // Ciphertext is never selected here — only read + decrypted via
    // getTokenForApiCall below, which audits the access.
    select: { id: true, status: true, tokenExpiresAt: true },
  });
  let metaSt: TokenState = metaState(token, now);
  let adAccounts: AdAccount[] = [];
  let metaLoadError: string | null = null;
  if (token && metaSt !== "not_connected" && metaSt !== "expired") {
    try {
      const secret = await getTokenForApiCall("meta_ads", token.id, {
        agencyId: member.agencyId,
        source: "page:integrations",
      });
      adAccounts = await getAdAccounts(secret.reveal());
    } catch (err) {
      if (err instanceof MetaAuthError) {
        // Token expired/revoked since stored — flip to disconnected so Settings
        // shows the reconnect prompt, and reflect it here.
        await agencyScoped(prisma.metaToken).update({
          where: { id: token.id },
          data: { status: "disconnected" },
        });
        metaSt = "expired";
      } else {
        metaLoadError =
          err instanceof Error
            ? err.message
            : "Couldn't load your Meta ad accounts.";
      }
    }
  }

  // ── Instagram (per-hotel) ──────────────────────────────────────────────────
  const social = await agencyScoped(prisma.socialAccount).findFirst({
    where: { hotelClientId: hotel.id, platform: "instagram" },
    select: { status: true, username: true, tokenExpiresAt: true, lastSyncedAt: true },
  });
  const igSt = instagramState(social, now);
  const igConnected = social?.status === "connected";

  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const [latestSnap, reachAgg, recentPosts] = igConnected
    ? await Promise.all([
        agencyScoped(prisma.socialSnapshot).findFirst({
          where: { hotelClientId: hotel.id },
          orderBy: { date: "desc" },
          select: { followers: true, date: true },
        }),
        agencyScoped(prisma.socialSnapshot).aggregate({
          where: { hotelClientId: hotel.id, date: { gte: since30 } },
          _sum: { reach: true, impressions: true, profileViews: true },
        }),
        agencyScoped(prisma.postSnapshot).findMany({
          where: { hotelClientId: hotel.id },
          orderBy: { postedAt: "desc" },
          take: 6,
          select: {
            mediaId: true,
            caption: true,
            mediaType: true,
            permalink: true,
            postedAt: true,
            reach: true,
            engagement: true,
            saves: true,
          },
        }),
      ])
    : [null, null, []];

  // ── Google Analytics 4 (per-hotel) ─────────────────────────────────────────
  const ga = await agencyScoped(prisma.googleAnalyticsConnection).findFirst({
    where: { hotelClientId: hotel.id },
    select: { status: true, propertyId: true, lastSyncedAt: true },
  });
  const gaSt: GaState = gaState(ga, planAllowsGa4);

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = summarize({
    snippet: snippetState(hotel.snippetStatus, hotel.lastEventAt),
    meta: metaSt,
    instagram: igSt,
    ga: gaSt,
    snippetApplies: !pixelMode,
    planAllowsGa4,
  });
  const snippetSt = summary.snippet;

  // ── Active sync failures (unresolved) + any running backfill ───────────────
  const syncFailures = await agencyScoped(prisma.syncFailure).findMany({
    where: { resolvedAt: null },
    select: { tokenType: true, hotelClientId: true, failedAt: true },
  });
  const metaFailure = syncFailures.find((f) => f.tokenType === "meta_ads") ?? null;
  const igFailure =
    syncFailures.find(
      (f) => f.tokenType === "instagram" && f.hotelClientId === hotel.id,
    ) ?? null;
  const backfillJob = await getActiveBackfill();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/agency/hotels" className="text-sm text-zinc-500 hover:underline">
          ← Hotel Clients
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{hotel.name}</h1>
            <p className="text-zinc-500">{hotel.websiteUrl}</p>
          </div>
          <p className="text-sm text-zinc-500">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {summary.connectedCount} of {summary.total}
            </span>{" "}
            integrations connected
          </p>
        </div>
      </div>

      <BackfillProgress key={backfillJob?.id ?? "none"} initialJob={backfillJob} />

      {/* ── Card 1 — Website Tracking Snippet ─────────────────────────────── */}
      <IntegrationCard
        icon={SnippetIcon}
        title="Website Tracking Snippet"
        subtitle="Captures which content sends visitors and records bookings."
        badge={
          pixelMode ? (
            <IntegrationStatusBadge tone="gray" label="Facebook Pixel mode" />
          ) : (
            <IntegrationStatusBadge
              tone={snippetTone(snippetSt)}
              label={SNIPPET_LABELS[snippetSt]}
            />
          )
        }
      >
        {pixelMode ? (
          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              This agency uses Meta&apos;s Pixel for website tracking, so the
              HotelTrack snippet isn&apos;t used here. Conversions and ROAS appear
              under <strong>Paid ads performance</strong> on the dashboard.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <code className="block flex-1 overflow-x-auto rounded-lg bg-zinc-950 px-4 py-3 text-sm text-zinc-100">
                {snippet}
              </code>
              <CopyButton text={snippet} />
            </div>
            <p className="text-xs text-zinc-500">
              Site ID: <code>{hotel.siteId}</code>
            </p>
            {snippetSt === "live" && (
              <p className="text-xs text-zinc-500">
                Last event received: {fmtDate(hotel.lastEventAt)}
              </p>
            )}

            <TestConnection hotelId={hotel.id} />

            <p className="text-sm">
              <Link
                href={`/agency/hotel/${hotel.id}/install`}
                className="font-medium underline"
              >
                View install guide →
              </Link>{" "}
              <span className="text-zinc-500">
                — step-by-step for WordPress, Shopify, or any site.
              </span>
            </p>
          </div>
        )}
      </IntegrationCard>

      {/* ── Card 2 — Meta Ads ─────────────────────────────────────────────── */}
      {(metaSt === "expiring" || metaSt === "expired") && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800/60 dark:bg-amber-900/20">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {metaSt === "expired"
              ? "Your Meta connection expired or was revoked."
              : "Your Meta connection token is expiring soon."}{" "}
            Ad spend &amp; ROI syncing is at risk for all your hotels.
          </p>
          <Link
            href="/agency/settings"
            className="mt-3 inline-block rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Reconnect now →
          </Link>
        </div>
      )}
      <IntegrationCard
        icon={<span className="text-base font-bold text-blue-600">f</span>}
        title="Meta Ads & Instagram Connection"
        subtitle="Agency-wide Meta token — powers ad spend & ROI for every hotel."
        badge={<IntegrationStatusBadge tone={tokenTone(metaSt)} label={TOKEN_LABELS[metaSt]} />}
      >
        {metaFailure && (
          <div className="mb-4">
            <SyncFailureNotice failedAt={metaFailure.failedAt} now={now} />
          </div>
        )}
        {metaSt === "not_connected" ? (
          <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              Connect Meta (Facebook) Ads once for your whole agency to bring ad
              spend and ROI into each hotel&apos;s dashboard. Then map the ad
              account for this hotel below.
            </p>
            <Link
              href="/agency/settings"
              className="inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Connect Meta in Settings →
            </Link>
          </div>
        ) : metaSt === "expired" ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Reconnect your Meta token on{" "}
            <Link href="/agency/settings" className="underline">
              Settings
            </Link>{" "}
            to restore ad spend &amp; ROI syncing, then map this hotel&apos;s ad
            account here.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Token active · expires:{" "}
              <span className="font-medium">{fmtExpiry(token?.tokenExpiresAt)}</span>{" "}
              · <span className="text-zinc-500">applies to all your hotels</span>
            </p>
            <HotelAdAccountSelect
              hotelId={hotel.id}
              accounts={adAccounts}
              currentAdAccountId={hotel.metaAdAccountId}
            />
            {metaLoadError && <p className="text-sm text-red-600">{metaLoadError}</p>}
            <p className="text-xs text-zinc-500">
              Manage the Meta token (replace / disconnect) on{" "}
              <Link href="/agency/settings" className="underline">
                Settings
              </Link>
              .
            </p>
          </div>
        )}
      </IntegrationCard>

      {/* ── Card 3 — Instagram (Organic Social) ───────────────────────────── */}
      <IntegrationCard
        icon={<span className="text-xs font-bold text-pink-600">IG</span>}
        title="Instagram (Organic Social)"
        subtitle="Per-hotel — organic reach, followers, and post engagement."
        badge={<IntegrationStatusBadge tone={tokenTone(igSt)} label={TOKEN_LABELS[igSt]} />}
      >
        {igFailure && (
          <div className="mb-4">
            <SyncFailureNotice failedAt={igFailure.failedAt} now={now} />
          </div>
        )}
        {igConnected ? (
          <div className="space-y-5">
            {igSt !== "connected" && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
                {igSt === "expired"
                  ? "This Instagram token has expired — reconnect to resume syncing."
                  : "This Instagram token is expiring soon — reconnect to avoid an interruption."}
              </div>
            )}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium">@{social?.username}</span> connected
              {social?.lastSyncedAt
                ? ` · last synced ${fmtDate(social.lastSyncedAt)}`
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
      </IntegrationCard>

      {/* ── Card 4 — Google Analytics 4 ───────────────────────────────────── */}
      <IntegrationCard
        icon={<span className="text-xs font-bold text-amber-600">GA</span>}
        title="Google Analytics 4"
        subtitle="Total website performance and source-by-source traffic mix."
        badge={<IntegrationStatusBadge tone={gaTone(gaSt)} label={GA_LABELS[gaSt]} />}
      >
        {gaSt === "gated" ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium">GA4 is a Growth feature</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
              Connect Google Analytics 4 to see every visit (not just UTM-tagged
              ones) and a full source breakdown. Upgrade your plan to enable it.
            </p>
            <Link
              href="/agency/billing"
              className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Upgrade to Growth to enable GA4 →
            </Link>
          </div>
        ) : gaSt === "connected" ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Property <code>{ga?.propertyId}</code>
              {ga?.lastSyncedAt
                ? ` · last synced ${fmtDate(ga.lastSyncedAt)}`
                : " · not synced yet — run a sync to pull metrics"}
            </p>
            <GoogleAnalyticsActions hotelId={hotel.id} />
          </div>
        ) : gaSt === "broken" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
              Service account no longer has access to property{" "}
              <code>{ga?.propertyId}</code>. Re-share the property with the service
              account (Viewer role) in GA Admin, or upload a fresh key below.
            </div>
            <GoogleAnalyticsConnect hotelId={hotel.id} />
          </div>
        ) : (
          <GoogleAnalyticsConnect hotelId={hotel.id} />
        )}
      </IntegrationCard>
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
