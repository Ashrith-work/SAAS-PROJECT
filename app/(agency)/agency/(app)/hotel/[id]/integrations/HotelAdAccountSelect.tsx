"use client";

import { useActionState, useRef } from "react";
import {
  mapAdAccount,
  type MapAccountState,
} from "@/app/(agency)/agency/(app)/settings/actions";
import type { AdAccount } from "@/lib/meta";

const initialState: MapAccountState = { error: null, ok: false };

const selectCls =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950";

// Per-hotel ad-account picker on the Meta card. Maps one of the agency's Meta
// ad accounts to this hotel (HotelClient.metaAdAccountId) so the dashboard pulls
// the right spend/ROI. Reuses the shared `mapAdAccount` server action.
export function HotelAdAccountSelect({
  hotelId,
  accounts,
  currentAdAccountId,
}: {
  hotelId: string;
  accounts: AdAccount[];
  currentAdAccountId: string | null;
}) {
  const [state, action, pending] = useActionState(mapAdAccount, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        This Meta token can&apos;t access any ad accounts. Reconnect a token with
        ads permissions to map an account to this hotel.
      </p>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="hotelId" value={hotelId} />
      <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Ad account
      </label>
      <select
        name="adAccountId"
        defaultValue={currentAdAccountId ?? ""}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
        className={selectCls}
      >
        <option value="">— Not mapped —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.accountId})
          </option>
        ))}
      </select>
      <span className="min-w-16 text-xs text-zinc-500">
        {pending ? (
          "Saving…"
        ) : state.error ? (
          <span className="text-red-600">{state.error}</span>
        ) : state.ok ? (
          "Saved ✓"
        ) : (
          ""
        )}
      </span>
    </form>
  );
}
