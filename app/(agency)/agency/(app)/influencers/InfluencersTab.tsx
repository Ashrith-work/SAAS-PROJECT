"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatNumber } from "@/lib/format";
import { createInfluencer, updateInfluencer, setInfluencerArchived } from "./actions";

export type InfluencerRow = {
  id: string;
  name: string;
  instagramHandle: string | null;
  notes: string | null;
  hotelClientId: string | null;
  hotelName: string | null;
  archived: boolean;
  activeCodes: number;
  redemptions: number;
  revenue: number;
};

type Hotel = { id: string; name: string };
type Editing = InfluencerRow | "new" | null;

const inputCls =
  "w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export function InfluencersTab({ influencers, hotels }: { influencers: InfluencerRow[]; hotels: Hotel[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, startTransition] = useTransition();

  const archiveToggle = (row: InfluencerRow) =>
    startTransition(async () => {
      await setInfluencerArchived(row.id, !row.archived);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          + Add influencer
        </button>
      </div>

      {influencers.length === 0 ? (
        <div className="rounded-xl border border-line bg-card px-4 py-10 text-center text-sm text-ink-tertiary">
          No influencers yet. Add one to start issuing coupon codes.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="ht-table w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-tertiary">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Instagram</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 text-right font-medium">Active codes</th>
                <th className="px-4 py-2 text-right font-medium">Redemptions</th>
                <th className="px-4 py-2 text-right font-medium">Revenue</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {influencers.map((i) => (
                <tr key={i.id} className={`border-b border-line/60 last:border-0 ${i.archived ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {i.name}
                    {i.archived && (
                      <span className="ml-2 rounded-full bg-line/50 px-1.5 py-0.5 text-[10px] uppercase text-ink-tertiary">
                        Archived
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-tertiary">{i.instagramHandle ? `@${i.instagramHandle.replace(/^@/, "")}` : "—"}</td>
                  <td className="px-4 py-2.5 text-ink-tertiary">{i.hotelName ?? "Agency-wide"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(i.activeCodes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(i.redemptions)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(i.revenue, { compact: true })}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-2 text-xs">
                      <button type="button" onClick={() => setEditing(i)} className="text-brand hover:underline">Edit</button>
                      <button type="button" disabled={pending} onClick={() => archiveToggle(i)} className="text-ink-tertiary hover:underline">
                        {i.archived ? "Unarchive" : "Archive"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <InfluencerModal
          row={editing === "new" ? null : editing}
          hotels={hotels}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function InfluencerModal({
  row,
  hotels,
  onClose,
  onSaved,
}: {
  row: InfluencerRow | null;
  hotels: Hotel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [handle, setHandle] = useState(row?.instagramHandle ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [hotelClientId, setHotelClientId] = useState(row?.hotelClientId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      setWarning(null);
      const input = { name, instagramHandle: handle, notes, hotelClientId: hotelClientId || null };
      const res = row ? await updateInfluencer(row.id, input) : await createInfluencer(input);
      if (!res.ok) { setError(res.error ?? "Something went wrong."); return; }
      // Saved. If the handle couldn't be verified, keep the modal open to show
      // the warning (the row is already saved); the user dismisses with Done.
      if (res.warning) setWarning(res.warning);
      else onSaved();
    });

  return (
    <Modal title={row ? "Edit influencer" : "Add influencer"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Instagram @handle">
          <input className={inputCls} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g., priya_travels (no @ symbol)" />
          <p className="mt-1 text-xs text-ink-tertiary">
            Optional but recommended. We&apos;ll detect when this influencer posts about your hotel and credit their reach.
          </p>
        </Field>
        <Field label="Hotel (blank = agency-wide)">
          <select className={inputCls} value={hotelClientId} onChange={(e) => setHotelClientId(e.target.value)}>
            <option value="">Agency-wide</option>
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        {warning && (
          <p className="rounded-lg border border-warning bg-warning/10 p-2.5 text-xs text-ink-secondary">
            ⚠ {warning}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          {warning ? (
            <button type="button" onClick={onSaved} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Done</button>
          ) : (
            <>
              <button type="button" onClick={onClose} className="rounded-lg border border-line-strong px-4 py-2 text-sm text-ink-secondary">Cancel</button>
              <button type="button" disabled={pending} onClick={submit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-elevated p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-tertiary hover:bg-line-strong" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}
