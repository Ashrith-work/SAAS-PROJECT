"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  mapAdAccount,
  type MapAccountState,
} from "@/app/(agency)/agency/(app)/settings/actions";
import type { AdAccount } from "@/lib/meta";

const initialState: MapAccountState = { error: null, ok: false };

const selectCls =
  "rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60";

// Per-hotel ad-account picker on the Meta card. Maps one of the agency's Meta
// ad accounts to this hotel (HotelClient.metaAdAccountId) so the dashboard pulls
// the right spend/ROI. Reuses the shared `mapAdAccount` server action.
export function HotelAdAccountSelect({
  hotelId,
  hotelName,
  accounts,
  currentAdAccountId,
}: {
  hotelId: string;
  hotelName: string;
  accounts: AdAccount[];
  currentAdAccountId: string | null;
}) {
  const [state, action, pending] = useActionState(mapAdAccount, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // Holds a newly-picked account id awaiting reconnect confirmation (account switch).
  const [pendingId, setPendingId] = useState<string | null>(null);
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
      <p className="text-sm text-ink-tertiary">
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

  // Human label for an account id (falls back to the raw id).
  const labelFor = (id: string | null): string => {
    if (!id) return "— Not mapped —";
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.name} (${a.accountId})` : id;
  };

  // When switching from one REAL account to a different one, the old account's
  // data is archived — confirm before submitting so it's never accidental.
  // First-time mapping and un-mapping carry no archive risk, so they submit
  // immediately (the prior auto-submit behaviour).
  const submit = () => formRef.current?.requestSubmit();
  function onSelectChange(value: string) {
    setSelected(value);
    const switchingAccounts = !!currentAdAccountId && !!value && value !== currentAdAccountId;
    if (switchingAccounts) {
      setPendingId(value); // hold for confirmation
    } else {
      submit();
    }
  }

  return (
    <>
      <form ref={formRef} action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="hotelId" value={hotelId} />
        <label className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          Ad account
        </label>
        <select
          ref={selectRef}
          name="adAccountId"
          value={selected}
          disabled={pending}
          onChange={(e) => onSelectChange(e.target.value)}
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
        <span className="min-w-16 text-xs text-ink-tertiary">
          {pending ? (
            "Saving…"
          ) : state.error ? (
            <span className="text-danger">{state.error}</span>
          ) : state.ok ? (
            "Saved ✓"
          ) : (
            ""
          )}
        </span>
      </form>

      {pendingId && (
        <ReconnectConfirm
          hotelName={hotelName}
          currentLabel={labelFor(currentAdAccountId)}
          newLabel={labelFor(pendingId)}
          onCancel={() => {
            // Revert the picker to the still-current account.
            setSelected(currentAdAccountId ?? "");
            setPendingId(null);
          }}
          onConfirm={() => {
            setPendingId(null);
            submit(); // `selected` already holds the new id
          }}
        />
      )}
    </>
  );
}

function ReconnectConfirm({
  hotelName,
  currentLabel,
  newLabel,
  onCancel,
  onConfirm,
}: {
  hotelName: string;
  currentLabel: string;
  newLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-ink">
          Connect a different Meta ad account?
        </h3>
        <p className="mt-1 text-sm text-ink-secondary">
          You are about to connect a different Meta ad account to{" "}
          <span className="font-medium text-ink">{hotelName}</span>.
        </p>
        <dl className="mt-4 space-y-2 rounded-lg border border-line bg-page p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-tertiary">Current ad account</dt>
            <dd className="text-right font-medium text-ink">{currentLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-tertiary">New ad account</dt>
            <dd className="text-right font-medium text-ink">{newLabel}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-ink-secondary">
          The historical data from the previous account will be{" "}
          <span className="font-medium text-ink">archived</span> (hidden from the
          dashboard but recoverable). Your new ad account&apos;s data will start
          flowing in fresh.
        </p>
        <p className="mt-2 text-xs text-ink-tertiary">
          This is normal when correcting a misconfiguration.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Confirm reconnect
          </button>
        </div>
      </div>
    </div>
  );
}
