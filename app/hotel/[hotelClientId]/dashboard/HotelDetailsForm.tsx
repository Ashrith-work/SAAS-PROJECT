"use client";

import { useState, useTransition } from "react";
import { updateHotelDetails } from "./actions";

// Hotel-owner editable details (contact / OTA rate / channel manager). Everything
// else on the dashboard is read-only.

const CHANNEL_MANAGERS = ["None", "djubo", "eZee", "STAAH", "RateGain", "Other", "Custom"];
const inputCls =
  "w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-disabled outline-none focus:border-brand focus:ring-1 focus:ring-brand";

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-secondary">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function HotelDetailsForm({
  hotelClientId,
  initial,
  canEditOtaRate = true,
}: {
  hotelClientId: string;
  initial: {
    contactName: string; contactEmail: string; contactPhone: string;
    whatsappNumber: string; address: string; otaCommissionRate: string; channelManager: string;
  };
  /** When false, the OTA commission rate is agency-managed and shown read-only. */
  canEditOtaRate?: boolean;
}) {
  const [v, setV] = useState(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setErrs({}); setSaved(false);
    start(async () => {
      const r = await updateHotelDetails(hotelClientId, v);
      if (r.ok) setSaved(true);
      else { setError(r.error ?? "Couldn't save."); setErrs(r.fieldErrors ?? {}); }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="contactName" label="Contact name" error={errs.contactName}>
          <input id="contactName" value={v.contactName} onChange={set("contactName")} className={inputCls} />
        </Field>
        <Field id="contactEmail" label="Contact email" error={errs.contactEmail}>
          <input id="contactEmail" type="email" value={v.contactEmail} onChange={set("contactEmail")} className={inputCls} />
        </Field>
        <Field id="contactPhone" label="Phone" error={errs.contactPhone}>
          <input id="contactPhone" type="tel" value={v.contactPhone} onChange={set("contactPhone")} className={inputCls} />
        </Field>
        <Field id="whatsappNumber" label="WhatsApp" error={errs.whatsappNumber}>
          <input id="whatsappNumber" type="tel" value={v.whatsappNumber} onChange={set("whatsappNumber")} className={inputCls} />
        </Field>
        <Field id="otaCommissionRate" label="OTA commission rate (%)">
          <input
            id="otaCommissionRate"
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={v.otaCommissionRate}
            onChange={set("otaCommissionRate")}
            disabled={!canEditOtaRate}
            readOnly={!canEditOtaRate}
            className={`${inputCls} ${canEditOtaRate ? "" : "cursor-not-allowed opacity-60"}`}
          />
          {!canEditOtaRate && (
            <p className="mt-1 text-xs text-ink-tertiary">Managed by your agency. Contact them to change it.</p>
          )}
        </Field>
        <Field id="channelManager" label="Channel manager">
          <select id="channelManager" value={v.channelManager} onChange={set("channelManager")} className={inputCls}>
            {CHANNEL_MANAGERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Field id="address" label="Address" error={errs.address}>
        <textarea id="address" value={v.address} onChange={set("address")} rows={2} className={`${inputCls} resize-y`} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60">
          {pending ? "Saving…" : "Save details"}
        </button>
        {saved && <span className="text-xs text-success">Saved ✓</span>}
      </div>
    </form>
  );
}
