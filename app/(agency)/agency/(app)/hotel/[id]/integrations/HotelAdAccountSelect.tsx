"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  // CONTROLLED select — React 19 resets uncontrolled form fields to their
  // mount-time defaultValue after a form action completes, which snapped this
  // select back to "— Not mapped —" right after every successful save (the
  // mapping DID persist; the UI lied). Controlled state survives that reset.
  const [selected, setSelected] = useState(currentAdAccountId ?? "");
  const selectRef = useRef<HTMLSelectElement>(null);

  // …but React 19's reset still desyncs the controlled <select>'s DOM (it
  // snaps to the first option while state keeps the choice), so the display
  // could still lie after a save. Re-assert the DOM value after every render.
  useEffect(() => {
    if (selectRef.current && selectRef.current.value !== selected) {
      selectRef.current.value = selected;
    }
  });

  if (accounts.length === 0) {
    // Don't hide an existing mapping just because the account list couldn't
    // load (no ads permission, transient Meta error) — the mapping is intact.
    return (
      <p className="text-sm text-zinc-500">
        {currentAdAccountId ? (
          <>
            Mapped to <code className="font-mono">{currentAdAccountId}</code> —
            unchanged, but this Meta token can&apos;t list ad accounts right
            now, so the mapping can&apos;t be edited here. Reconnect a token
            with ads permissions to change it.
          </>
        ) : (
          <>
            This Meta token can&apos;t access any ad accounts. Reconnect a token
            with ads permissions to map an account to this hotel.
          </>
        )}
      </p>
    );
  }

  // A mapped account the current token can't list would otherwise silently
  // render as "— Not mapped —". Surface it as an explicit option instead.
  const inList = accounts.some((a) => a.id === selected);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="hotelId" value={hotelId} />
      <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Ad account
      </label>
      <select
        ref={selectRef}
        name="adAccountId"
        value={selected}
        disabled={pending}
        onChange={(e) => {
          // The DOM already holds the new value when onChange fires, so the
          // synchronous requestSubmit serializes the right adAccountId.
          setSelected(e.target.value);
          formRef.current?.requestSubmit();
        }}
        className={selectCls}
      >
        <option value="">— Not mapped —</option>
        {selected && !inList && (
          <option value={selected}>{selected} (not visible to this token)</option>
        )}
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
