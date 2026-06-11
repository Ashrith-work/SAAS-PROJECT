import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { getTokenForApiCall } from "@/lib/token-access";
import { getAdAccounts, MetaAuthError, type AdAccount } from "@/lib/meta";
import { MetaTokenForm } from "./MetaTokenForm";
import { disconnectMetaToken } from "./actions";
import { getActiveBackfill } from "./backfill-actions";
import { BackfillProgress } from "./BackfillProgress";
import { NotificationSettings } from "./NotificationSettings";

const DAY_MS = 86_400_000;

// Server-side relative time (avoids Date.now() in a client render).
function relativeAgo(d: Date, now: Date): string {
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) === 1 ? "" : "s"} ago`;
}

function formatExpiry(d: Date): string {
  // The save action stores a year-2999 sentinel for non-expiring tokens.
  if (d.getUTCFullYear() >= 2900) return "Does not expire";
  return new Date(d).toLocaleString();
}

// "Connect with Facebook" — a plain link to the OAuth start route (a GET that
// redirects to Facebook), styled in Meta's brand blue. No client JS needed.
function ConnectWithFacebook({ label }: { label: string }) {
  return (
    <a
      href="/api/auth/meta/start"
      className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#166fe0]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
      </svg>
      {label}
    </a>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const sp = await searchParams;
  const metaConnectedBanner = sp.meta_connected === "success";
  const metaErrorBanner = typeof sp.meta_error === "string" ? sp.meta_error : null;

  const backfillJob = await getActiveBackfill();

  // Notification settings (budget alerts: email + Slack).
  const notif = await agencyScoped(prisma.agency).findFirst({
    select: {
      email: true,
      alertEmailAddress: true,
      emailAlertsEnabled: true,
      slackEnabled: true,
      slackWebhookUrl: true,
      slackLastTestAt: true,
      slackLastTestStatus: true,
    },
  });
  const now = new Date();
  const lastTest =
    notif?.slackLastTestAt && notif.slackLastTestStatus
      ? notif.slackLastTestStatus === "success"
        ? { ok: true, label: `Success — ${relativeAgo(notif.slackLastTestAt, now)}` }
        : { ok: false, label: `${notif.slackLastTestStatus} (${relativeAgo(notif.slackLastTestAt, now)})` }
      : null;

  // Multi-tenant: agencyScoped restricts to this agency's Meta connection.
  const token = await agencyScoped(prisma.metaToken).findFirst({
    orderBy: { createdAt: "desc" },
    // The ciphertext is never selected here — it's read + decrypted only through
    // getTokenForApiCall below, which audits the access.
    select: {
      id: true,
      status: true,
      tokenExpiresAt: true,
      tokenSource: true,
      refreshableViaOAuth: true,
      connectedFacebookUserName: true,
      disconnectedAt: true,
    },
  });

  let connected = token?.status === "connected";
  let accounts: AdAccount[] = [];
  let loadError: string | null = null;

  if (token && connected) {
    try {
      accounts = await getAdAccounts(
        (
          await getTokenForApiCall("meta_ads", token.id, {
            agencyId: member.agencyId,
            source: "page:settings",
          })
        ).reveal(),
      );
    } catch (err) {
      if (err instanceof MetaAuthError) {
        // The token expired or was revoked since we stored it. Mark the
        // connection disconnected so the UI shows a clear reconnect prompt
        // (CLAUDE.md: handle expired tokens gracefully).
        await agencyScoped(prisma.metaToken).update({
          where: { id: token.id },
          data: { status: "disconnected" },
        });
        connected = false;
      } else {
        loadError =
          err instanceof Error
            ? err.message
            : "Couldn't load your Meta ad accounts. Please try again.";
      }
    }
  }

  // Connection-method + expiry state for the card.
  const isOauth = token?.tokenSource === "OAUTH";
  // A user-initiated disconnect stamps disconnectedAt; a dead/revoked token
  // detected on load (or by the cron) does not — so we can word the two cases
  // differently.
  const userDisconnected =
    !!token && token.status === "disconnected" && !!token.disconnectedAt;
  const expiredOrRevoked = !!token && !connected && !userDisconnected;
  const nonExpiring = !!token && token.tokenExpiresAt.getUTCFullYear() >= 2900;
  const daysToExpiry =
    token && !nonExpiring
      ? Math.ceil((token.tokenExpiresAt.getTime() - now.getTime()) / DAY_MS)
      : null;
  // Manual tokens can't auto-refresh: nudge a Facebook reconnect inside 14 days.
  const manualExpiringSoon =
    connected && !isOauth && daysToExpiry !== null && daysToExpiry <= 14;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-ink-tertiary">
          Connect Meta (Facebook) Ads to bring ad spend and ROI into each
          hotel&apos;s dashboard.
        </p>
      </div>

      <BackfillProgress key={backfillJob?.id ?? "none"} initialJob={backfillJob} />

      {metaConnectedBanner && (
        <div className="rounded-lg border-l-4 border-success bg-success/10 p-3 text-sm text-ink-secondary">
          Meta connected with Facebook. Now map the right ad account to each hotel
          on its{" "}
          <Link href="/agency/hotels" className="underline">
            Integrations page
          </Link>
          .
        </div>
      )}
      {metaErrorBanner && (
        <div className="rounded-lg border-l-4 border-danger bg-danger/10 p-3 text-sm text-ink-secondary">
          {metaErrorBanner === "access_denied"
            ? "Facebook connection cancelled. You can try again whenever you're ready."
            : "We couldn't complete the Facebook connection. Please try again, or paste a long-lived token instead."}
        </div>
      )}

      {/* ── Meta connection ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Meta Ads connection</h2>
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {isOauth ? "Connected via Facebook" : "Connected via manual token"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-xs font-medium text-ink-tertiary">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-disabled" />
              Disconnected
            </span>
          )}
        </div>

        {connected && token ? (
          <div className="mt-4 space-y-4">
            {isOauth ? (
              <div className="space-y-1 text-sm text-ink-tertiary">
                {token.connectedFacebookUserName && (
                  <p>
                    Connected by{" "}
                    <span className="font-medium text-ink-secondary">
                      {token.connectedFacebookUserName}
                    </span>
                  </p>
                )}
                <p>
                  Token active · expires:{" "}
                  <span className="font-medium">{formatExpiry(token.tokenExpiresAt)}</span>
                </p>
                {token.refreshableViaOAuth && !nonExpiring && (
                  <p className="text-success">
                    Auto-refreshes before expiry — no manual renewal needed.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-tertiary">
                Token active · expires:{" "}
                <span className="font-medium">{formatExpiry(token.tokenExpiresAt)}</span>
                {daysToExpiry !== null && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium">
                      {daysToExpiry} day{daysToExpiry === 1 ? "" : "s"}
                    </span>{" "}
                    left
                  </>
                )}
              </p>
            )}

            {manualExpiringSoon && daysToExpiry !== null && (
              <div className="rounded-lg border-l-4 border-warning bg-warning/10 p-3 text-sm text-ink-secondary">
                This token expires in {daysToExpiry} day{daysToExpiry === 1 ? "" : "s"}.
                Reconnect via Facebook Login to enable automatic refresh and avoid
                downtime.
              </div>
            )}

            <form action={disconnectMetaToken}>
              <button
                type="submit"
                className="rounded-lg border border-line-strong bg-elevated px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-line-strong"
              >
                Disconnect
              </button>
            </form>

            <details className="text-sm">
              <summary className="cursor-pointer text-ink-tertiary hover:text-ink">
                Reconnect or replace connection
              </summary>
              <div className="mt-3 space-y-4">
                <ConnectWithFacebook label="Reconnect with Facebook" />
                <details className="text-sm">
                  <summary className="cursor-pointer text-ink-tertiary hover:text-ink">
                    Or paste a long-lived access token (advanced)
                  </summary>
                  <div className="mt-3">
                    <MetaTokenForm submitLabel="Replace token" />
                  </div>
                </details>
              </div>
            </details>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {expiredOrRevoked && (
              <div className="rounded-lg border-l-4 border-warning bg-warning/10 p-3 text-sm text-ink-secondary">
                Your Meta connection expired or was revoked. Reconnect below to
                restore ad-spend and ROI syncing.
              </div>
            )}
            {userDisconnected && (
              <div className="rounded-lg border-l-4 border-line-strong bg-elevated p-3 text-sm text-ink-secondary">
                Meta is disconnected. Reconnect any time below.
              </div>
            )}
            <p className="text-sm text-ink-tertiary">
              Connect Meta (Facebook) Ads to bring ad spend and ROI into each
              hotel&apos;s dashboard. <span className="font-medium">Connect with
              Facebook</span> is the recommended path — Meta handles the login and
              the token auto-refreshes.
            </p>
            <ConnectWithFacebook
              label={expiredOrRevoked ? "Reconnect with Facebook" : "Connect with Facebook"}
            />
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-tertiary hover:text-ink">
                Or paste a long-lived access token (advanced)
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-ink-tertiary">
                  Paste a Meta access token with{" "}
                  <code className="text-xs">ads_read</code> permission (from the
                  Graph API Explorer or your app&apos;s system user). Manual tokens
                  don&apos;t auto-refresh.
                </p>
                <MetaTokenForm
                  submitLabel={expiredOrRevoked ? "Reconnect Meta" : "Connect Meta"}
                />
              </div>
            </details>
          </div>
        )}

        {loadError && (
          <p className="mt-4 text-sm text-danger">{loadError}</p>
        )}
      </section>

      {/* Ad-account → hotel mapping now lives per hotel on each hotel's
          Integrations page, so the connection and its mapping sit together. */}
      {connected && (
        <section className="rounded-xl border border-line p-6">
          <h2 className="font-medium">Map ad accounts to hotels</h2>
          <p className="mt-1 text-sm text-ink-tertiary">
            {accounts.length === 0
              ? "This token can't access any ad accounts. Reconnect a token with ads permissions."
              : `${accounts.length} ad account${accounts.length === 1 ? "" : "s"} available.`}{" "}
            Map the right ad account to each hotel on its{" "}
            <Link href="/agency/hotels" className="underline">
              hotel&apos;s Integrations page
            </Link>
            .
          </p>
        </section>
      )}

      {/* ── Notifications (budget alerts via email + Slack) ───────────────── */}
      <section className="rounded-xl border border-line p-6">
        <h2 className="font-medium">Notifications</h2>
        <p className="mt-1 text-sm text-ink-tertiary">
          Where to send ad-budget alerts when a hotel crosses 80%, 90%, or 100% of
          its monthly budget. Set per-hotel budgets on each hotel&apos;s Integrations
          page.
        </p>
        <div className="mt-5">
          <NotificationSettings
            ownerEmail={notif?.email ?? ""}
            alertEmailAddress={notif?.alertEmailAddress ?? ""}
            emailAlertsEnabled={notif?.emailAlertsEnabled ?? false}
            slackEnabled={notif?.slackEnabled ?? false}
            slackWebhookUrl={notif?.slackWebhookUrl ?? ""}
            lastTest={lastTest}
          />
        </div>
      </section>
    </div>
  );
}
