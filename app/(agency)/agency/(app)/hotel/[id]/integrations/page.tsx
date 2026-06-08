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
import { InstagramActions } from "./InstagramActions";
import { SendGuideModal } from "./SendGuideModal";
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
      Data sync failed {n} day{n === 1 ? "" : "s"} ago. Reconnect to restore
      data flow.
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

// User-facing messages for the ?ig_error= codes set by the OAuth callback.
const IG_ERROR_MESSAGES: Record<string, string> = {
  personal_account_not_supported:
    "Personal Instagram accounts are not supported. Please switch to Business or Creator in the Instagram app (Settings → Account type), then try again.",
  access_denied:
    "Instagram access was declined. Click “Log in with Instagram” to try again.",
  exchange_failed:
    "Instagram sign-in didn't complete — the token exchange failed. Please try again in a moment.",
};

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
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

  // OAuth round-trip feedback (?ig_connected=success / ?ig_error=…).
  const igConnectedBanner = sp.ig_connected === "success";
  const igErrorCode = typeof sp.ig_error === "string" ? sp.ig_error : null;
  const igErrorBanner = igErrorCode
    ? IG_ERROR_MESSAGES[igErrorCode] ?? "Instagram connection failed. Please try again."
    : null;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com").replace(
    /\/$/,
    "",
  );
  const snippet = `<script src="${appUrl}/t.js?id=${hotel.siteId}" async></script>`;
  // Public URL for the setup-guide share modal (defaults to the prod domain so
  // the copied link is always shareable even if the env var isn't set locally).
  const guidePublicUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://www.hoteltrack.in"
  ).replace(/\/$/, "");

  // ── Meta Ads (agency-wide EAA token) ───────────────────────────────────────
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

  // ── Instagram (per-hotel IGAA connection) ──────────────────────────────────
  const ig = await agencyScoped(prisma.instagramConnection).findFirst({
    where: { hotelClientId: hotel.id, tokenType: "igaa_direct" },
    select: {
      status: true,
      username: true,
      igAccountType: true,
      profilePicUrl: true,
      tokenExpiresAt: true,
      lastSyncedAt: true,
      errorMessage: true,
    },
  });
  const igSt = instagramState(ig, now);
  const igConnected = ig?.status === "active";

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

      {/* Help — share the public setup guide with the hotel */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1A56DB]/10 text-[#1A56DB]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold">New to HotelTrack setup?</p>
            <p className="text-sm text-zinc-500">
              Send {hotel.name} a step-by-step guide for installing the snippet
              and connecting Instagram.
            </p>
          </div>
        </div>
        <SendGuideModal hotelId={hotel.id} publicUrl={guidePublicUrl} />
      </div>

      <BackfillProgress key={backfillJob?.id ?? "none"} initialJob={backfillJob} />

      {/* OAuth round-trip feedback */}
      {igConnectedBanner && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-300">
          Instagram connected successfully. Click <strong>Sync insights now</strong>{" "}
          on the Instagram card to pull the first data.
        </div>
      )}
      {igErrorBanner && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300">
          {igErrorBanner}
        </div>
      )}

      {/* ── Card 1 — Meta Ads (EAA token, agency-wide) ───────────────────── */}
      {(metaSt === "expiring" || metaSt === "expired") && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800/60 dark:bg-amber-900/20">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {metaSt === "expired"
              ? "Your Meta Ads connection expired or was revoked."
              : "Your Meta Ads token is expiring soon."}{" "}
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
        title="Meta Ads"
        subtitle="Paid ad performance, ROAS, campaign data"
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

      {/* ── Card 2 — Instagram (IGAA via Instagram Login) ────────────────── */}
      <IntegrationCard
        icon={<span className="text-xs font-bold text-pink-600">IG</span>}
        title="Instagram"
        subtitle="Organic reach, followers, post engagement"
        badge={<IntegrationStatusBadge tone={tokenTone(igSt)} label={TOKEN_LABELS[igSt]} />}
      >
        {igFailure && (
          <div className="mb-4">
            <SyncFailureNotice failedAt={igFailure.failedAt} now={now} />
          </div>
        )}
        {igConnected ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              {ig?.profilePicUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external IG CDN avatar
                <img
                  src={ig.profilePicUrl}
                  alt={`@${ig.username ?? "instagram"} profile picture`}
                  className="h-12 w-12 rounded-full border border-zinc-200 object-cover dark:border-zinc-800"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-600 dark:bg-pink-900/40">
                  IG
                </div>
              )}
              <div className="text-sm">
                <p className="font-medium">@{ig?.username}</p>
                <p className="text-zinc-500">
                  {ig?.igAccountType === "CREATOR" ? "Creator" : "Business"} account ·
                  Last synced: {fmtDate(ig?.lastSyncedAt)}
                </p>
              </div>
            </div>

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
          <div className="space-y-3">
            {ig?.status === "error" && ig.errorMessage && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
                The last sync failed: {ig.errorMessage} — reconnect below to
                resume.
              </div>
            )}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Bring organic reach, impressions, follower growth, and per-post
              engagement into HotelTrack.
            </p>
            <a
              href={`/api/auth/instagram/start?hotelClientId=${hotel.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
              </svg>
              Log in with Instagram
            </a>
            <p className="text-xs text-zinc-500">
              The hotel will be asked to log in with their Instagram Business or
              Creator account. No Facebook Page required.
            </p>
          </div>
        )}
      </IntegrationCard>

      {/* ── Card 3 — Website Tracking Snippet ─────────────────────────────── */}
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
