"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { mapAdAccount, type MapAccountState } from "./actions";
import type { AdAccount } from "@/lib/meta";

const initialState: MapAccountState = { error: null, ok: false };

const selectCls =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950";

type Hotel = { id: string; name: string; metaAdAccountId: string | null };

function MappingRow({
  hotel,
  accounts,
}: {
  hotel: Hotel;
  accounts: AdAccount[];
}) {
  const [state, action, pending] = useActionState(mapAdAccount, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state.ok) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex items-center justify-between gap-4 px-4 py-3"
    >
      <span className="text-sm font-medium">{hotel.name}</span>
      <input type="hidden" name="hotelId" value={hotel.id} />
      <div className="flex items-center gap-3">
        <span className="min-w-16 text-right text-xs text-zinc-500">
          {pending
            ? "Saving…"
            : state.error
              ? <span className="text-red-600">{state.error}</span>
              : saved
                ? "Saved ✓"
                : ""}
        </span>
        <select
          name="adAccountId"
          defaultValue={hotel.metaAdAccountId ?? ""}
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
      </div>
    </form>
  );
}

export function AdAccountMapping({
  hotels,
  accounts,
}: {
  hotels: Hotel[];
  accounts: AdAccount[];
}) {
  if (hotels.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-zinc-500">
        Add a hotel client first, then come back to map an ad account to it.
      </p>
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-zinc-500">
        This token can&apos;t access any ad accounts. Connect a token with ads
        permissions to map accounts to your hotels.
      </p>
    );
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {hotels.map((h) => (
        <MappingRow key={h.id} hotel={h} accounts={accounts} />
      ))}
    </div>
  );
}
