import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { getTokenForApiCall } from "@/lib/token-access";
import { getAdAccounts, MetaAuthError, type AdAccount } from "@/lib/meta";
import { MetaTokenForm } from "./MetaTokenForm";
import { AdAccountMapping } from "./AdAccountMapping";
import { disconnectMetaToken } from "./actions";

function formatExpiry(d: Date): string {
  // The save action stores a year-2999 sentinel for non-expiring tokens.
  if (d.getUTCFullYear() >= 2900) return "Does not expire";
  return new Date(d).toLocaleString();
}

export default async function SettingsPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

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

  const hotels = connected
    ? await agencyScoped(prisma.hotelClient).findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, metaAdAccountId: true },
      })
    : [];

  // disconnected-but-present row means a previously connected token expired.
  const expired = Boolean(token) && !connected;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Connect Meta (Facebook) Ads to bring ad spend and ROI into each
          hotel&apos;s dashboard.
        </p>
      </div>

      {/* ── Meta connection ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Meta Ads connection</h2>
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              Disconnected
            </span>
          )}
        </div>

        {connected && token ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Token active · expires:{" "}
              <span className="font-medium">
                {formatExpiry(token.tokenExpiresAt)}
              </span>
            </p>
            <form action={disconnectMetaToken}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Disconnect
              </button>
            </form>
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-500 hover:text-black dark:hover:text-white">
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
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
                Your Meta connection expired or was revoked. Paste a fresh access
                token below to reconnect.
              </div>
            )}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Paste a Meta access token with ads read permissions
              (<code className="text-xs">ads_read</code>). Generate one from the
              Meta for Developers Graph API Explorer or your app&apos;s system
              user.
            </p>
            <MetaTokenForm submitLabel={expired ? "Reconnect Meta" : "Connect Meta"} />
          </div>
        )}

        {loadError && (
          <p className="mt-4 text-sm text-red-600">{loadError}</p>
        )}
      </section>

      {/* ── Ad account → hotel mapping ──────────────────────────────────── */}
      {connected && (
        <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="font-medium">Map ad accounts to hotels</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Each hotel&apos;s dashboard pulls ROI from its mapped ad account.
            </p>
          </div>
          <AdAccountMapping hotels={hotels} accounts={accounts} />
        </section>
      )}
    </div>
  );
}
