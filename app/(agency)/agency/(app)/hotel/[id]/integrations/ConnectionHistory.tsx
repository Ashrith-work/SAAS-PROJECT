"use client";

import { useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  restorePreviousAccount,
  deletePreviousAccount,
} from "./connection-history-actions";

export type PreviousAccount = {
  accountId: string;
  name: string | null;
  rows: number;
  firstDate: string | null;
  lastDate: string | null;
  totalSpend: number;
};

// Connection History — the agency-only record of which Meta ad accounts have
// been mapped to this hotel. Lets the agency recover or purge the archived data
// from a previously-connected account after an account change. Never rendered on
// hotel-facing views.
export function ConnectionHistory({
  hotelId,
  currentAdAccountId,
  currentAccountName,
  previous,
}: {
  hotelId: string;
  currentAdAccountId: string | null;
  currentAccountName: string | null;
  previous: PreviousAccount[];
}) {
  const [confirmDelete, setConfirmDelete] = useState<PreviousAccount | null>(null);

  if (!currentAdAccountId && previous.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-page p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
        Connection history
      </p>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-ink-secondary">Currently connected</span>
        <span className="text-right font-medium text-ink">
          {currentAdAccountId ? (
            <>
              {currentAccountName ? `${currentAccountName} · ` : ""}
              <code className="font-mono text-xs">{currentAdAccountId}</code>
            </>
          ) : (
            "— none mapped —"
          )}
        </span>
      </div>

      {previous.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-ink-tertiary">
            Previously connected — their data is archived (hidden from the
            dashboard) and recoverable:
          </p>
          {previous.map((p) => (
            <div key={p.accountId} className="rounded-lg border border-line bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {p.name ?? "Unknown account"}
                  </p>
                  <code className="font-mono text-xs text-ink-tertiary">{p.accountId}</code>
                </div>
                <div className="text-right text-xs text-ink-tertiary">
                  <p className="tabular-nums">
                    {formatNumber(p.rows)} archived day{p.rows === 1 ? "" : "s"}
                  </p>
                  {p.firstDate && p.lastDate && (
                    <p className="tabular-nums">
                      {p.firstDate} → {p.lastDate}
                    </p>
                  )}
                  <p className="tabular-nums">
                    {formatCurrency(p.totalSpend)} archived spend
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <form action={restorePreviousAccount}>
                  <input type="hidden" name="hotelId" value={hotelId} />
                  <input type="hidden" name="accountId" value={p.accountId} />
                  <button
                    type="submit"
                    className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-line-strong"
                  >
                    Restore data from this account
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(p)}
                  className="rounded-lg border border-danger/60 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
                >
                  Permanently delete archived data
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <DeleteConfirm
          hotelId={hotelId}
          account={confirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function DeleteConfirm({
  hotelId,
  account,
  onClose,
}: {
  hotelId: string;
  account: PreviousAccount;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-ink">Permanently delete archived data?</h3>
        <p className="mt-2 text-sm text-ink-secondary">
          This will hard-delete{" "}
          <span className="font-medium text-ink">{formatNumber(account.rows)} day(s)</span> of
          archived data ({formatCurrency(account.totalSpend)} spend) from{" "}
          <span className="font-medium text-ink">{account.name ?? account.accountId}</span>. This
          cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
          >
            Cancel
          </button>
          <form action={deletePreviousAccount}>
            <input type="hidden" name="hotelId" value={hotelId} />
            <input type="hidden" name="accountId" value={account.accountId} />
            <button
              type="submit"
              onClick={onClose}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90"
            >
              Delete permanently
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
