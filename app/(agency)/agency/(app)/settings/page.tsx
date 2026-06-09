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

function formatExpiry(d: Date): string {
  // The save action stores a year-2999 sentinel for non-expiring tokens.
  if (d.getUTCFullYear() >= 2900) return "Does not expire";
  return new Date(d).toLocaleString();
}

export default async function SettingsPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const backfillJob = await getActiveBackfill();

  // Multi-tenant: agencyScoped restricts to this agency's Meta connection.
  const token = await agencyScoped(prisma.metaToken).findFirst({
    orderBy: { createdAt: "desc" },
    // The ciphertext is never selected here — it's read + decrypted only through
    // getTokenForApiCall below, which audits the access.
    select: { id: true, status: true, tokenExpiresAt: true },
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

  // disconnected-but-present row means a previously connected token expired.
  const expired = Boolean(token) && !connected;

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

      {/* ── Meta connection ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Meta Ads connection</h2>
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Connected
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
            <p className="text-sm text-ink-tertiary">
              Token active · expires:{" "}
              <span className="font-medium">
                {formatExpiry(token.tokenExpiresAt)}
              </span>
            </p>
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
                Replace token
              </summary>
              <div className="mt-3">
                <MetaTokenForm submitLabel="Replace token" />
              </div>
            </details>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {expired && (
              <div className="rounded-lg border-l-4 border-warning bg-warning/10 p-3 text-sm text-ink-secondary">
                Your Meta connection expired or was revoked. Paste a fresh access
                token below to reconnect.
              </div>
            )}
            <p className="text-sm text-ink-tertiary">
              Paste a Meta access token with ads read permissions
              (<code className="text-xs">ads_read</code>). Generate one from the
              Meta for Developers Graph API Explorer or your app&apos;s system
              user.
            </p>
            <MetaTokenForm submitLabel={expired ? "Reconnect Meta" : "Connect Meta"} />
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
    </div>
  );
}
