"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  findInstagramAccounts,
  linkInstagramAccount,
  type FindAccountsState,
  type LinkState,
} from "./social-actions";

const findInitial: FindAccountsState = { error: null, accounts: [] };
const linkInitial: LinkState = { error: null, ok: false };

const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";

export function InstagramConnect({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [selected, setSelected] = useState("");

  const [findState, findAction, finding] = useActionState(findInstagramAccounts, findInitial);
  const [linkState, linkAction, linking] = useActionState(linkInstagramAccount, linkInitial);

  // On a successful link, reload so the page shows the connected state.
  useEffect(() => {
    if (linkState.ok) router.refresh();
  }, [linkState.ok, router]);

  const hasAccounts = findState.accounts.length > 0;
  // Derive the effective selection (defaults to the first account) rather than
  // syncing it into state from an effect.
  const effectiveSelected = selected || (findState.accounts[0]?.igUserId ?? "");

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Link this hotel&apos;s Instagram to bring organic reach, impressions,
        follower growth, and per-post engagement into HotelTrack. Paste a Meta
        access token with <code className="text-xs">instagram_basic</code>,{" "}
        <code className="text-xs">instagram_manage_insights</code>,{" "}
        <code className="text-xs">pages_show_list</code>, and{" "}
        <code className="text-xs">pages_read_engagement</code> permissions.
      </p>

      {/* Phase 1 — paste token, resolve accounts */}
      <form action={findAction} className="space-y-3">
        <input type="hidden" name="hotelId" value={hotelId} />
        <textarea
          name="token"
          rows={3}
          spellCheck={false}
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste the access token (begins with EAA…)"
          className={inputCls}
        />
        {findState.error && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
            {findState.error}
          </div>
        )}
        <button
          type="submit"
          disabled={finding || !token.trim()}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {finding ? "Checking…" : "Find Instagram accounts"}
        </button>
      </form>

      {/* Phase 2 — choose the account and connect */}
      {hasAccounts && (
        <form action={linkAction} className="space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <input type="hidden" name="hotelId" value={hotelId} />
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="igUserId" value={effectiveSelected} />
          <p className="text-sm font-medium">
            {findState.accounts.length === 1
              ? "Found this Instagram account:"
              : "Choose the Instagram account for this hotel:"}
          </p>
          <div className="space-y-2">
            {findState.accounts.map((a) => (
              <label
                key={a.igUserId}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${
                  effectiveSelected === a.igUserId
                    ? "border-black dark:border-white"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <input
                  type="radio"
                  name="igChoice"
                  checked={effectiveSelected === a.igUserId}
                  onChange={() => setSelected(a.igUserId)}
                />
                <span className="flex-1">
                  <span className="font-medium">@{a.username}</span>
                  <span className="block text-xs text-zinc-500">
                    {a.followersCount.toLocaleString()} followers · Page: {a.pageName}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {linkState.error && <p className="text-sm text-red-600">{linkState.error}</p>}
          <button
            type="submit"
            disabled={linking || !effectiveSelected}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {linking ? "Connecting…" : "Connect Instagram"}
          </button>
          <p className="text-xs text-zinc-500">
            The token is encrypted (AES-256-GCM) before storage, never shown again
            or sent to your browser.
          </p>
        </form>
      )}
    </div>
  );
}
