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
        <label className="block text-sm font-medium text-ink-secondary" htmlFor="share-password">
          Password{" "}
          <span className="font-normal text-ink-tertiary">(optional)</span>
        </label>
        <input
          id="share-password"
          name="password"
          type="text"
          autoComplete="off"
          placeholder="Leave blank for no password"
          className="mt-1 w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-disabled focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <p className="mt-1 text-xs text-ink-tertiary">
          The hotel owner enters this to view the report. Share it with them
          separately.
        </p>
      </div>
      {state.error && (
        <p className="text-sm text-danger">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
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
        <p className="mb-3 text-sm text-ink-secondary">
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
          className="w-full flex-1 truncate rounded-lg border border-line-strong bg-card px-3 py-2 text-sm text-ink"
        />
        <CopyButton text={url} label="Copy link" />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-tertiary">
        <span>
          {link.hasPassword ? "🔒 Password protected" : "🔓 No password"}
        </span>
        <span className={expired ? "text-danger" : ""}>
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
            className="rounded-lg border border-danger/60 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
          >
            Revoke link
          </button>
        </form>
      </div>

      <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-secondary hover:text-ink">
          Replace with a new link
        </summary>
        <p className="mt-2 mb-3 text-xs text-ink-tertiary">
          Generating a new link revokes the current one immediately.
        </p>
        <CreateForm hotelId={hotelId} cta="Generate new link" />
      </details>
    </div>
  );
}
