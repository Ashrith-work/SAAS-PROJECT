"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { createShareLink, revokeShareLink, type ShareState } from "./share-actions";

type ActiveLink = {
  id: string;
  token: string;
  hasPassword: boolean;
  expiresAt: string;
  expired: boolean;
  viewCount: number;
  lastViewedAt: string | null;
};

const initial: ShareState = { error: null, ok: false };

function CreateForm({
  hotelId,
  cta,
}: {
  hotelId: string;
  cta: string;
}) {
  const [state, action, pending] = useActionState(createShareLink, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="hotelId" value={hotelId} />
      <div>
        <label className="block text-sm font-medium" htmlFor="share-password">
          Password{" "}
          <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          id="share-password"
          name="password"
          type="text"
          autoComplete="off"
          placeholder="Leave blank for no password"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <p className="mt-1 text-xs text-zinc-500">
          The hotel owner enters this to view the report. Share it with them
          separately.
        </p>
      </div>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {pending ? "Generating…" : cta}
      </button>
    </form>
  );
}

export function ShareLinkManager({
  hotelId,
  shareBaseUrl,
  link,
}: {
  hotelId: string;
  shareBaseUrl: string;
  link: ActiveLink | null;
}) {
  if (!link) {
    return (
      <div className="p-4">
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Generate a private link to a read-only version of this dashboard. It
          works on any phone — no login needed — and expires in 30 days.
        </p>
        <CreateForm hotelId={hotelId} cta="Generate share link" />
      </div>
    );
  }

  const url = `${shareBaseUrl}/share/${link.token}`;
  const expires = new Date(link.expiresAt);
  const expired = link.expired;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full flex-1 truncate rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <CopyButton text={url} label="Copy link" />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
        <span>
          {link.hasPassword ? "🔒 Password protected" : "🔓 No password"}
        </span>
        <span className={expired ? "text-red-600 dark:text-red-400" : ""}>
          {expired ? "Expired " : "Expires "}
          {expires.toLocaleDateString()}
        </span>
        <span>
          {link.viewCount} view{link.viewCount === 1 ? "" : "s"}
          {link.lastViewedAt
            ? ` · last ${new Date(link.lastViewedAt).toLocaleDateString()}`
            : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action={revokeShareLink}>
          <input type="hidden" name="linkId" value={link.id} />
          <input type="hidden" name="hotelId" value={hotelId} />
          <button
            type="submit"
            className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Revoke link
          </button>
        </form>
      </div>

      <details className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <summary className="cursor-pointer text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">
          Replace with a new link
        </summary>
        <p className="mt-2 mb-3 text-xs text-zinc-500">
          Generating a new link revokes the current one immediately.
        </p>
        <CreateForm hotelId={hotelId} cta="Generate new link" />
      </details>
    </div>
  );
}
