"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatNumber } from "@/lib/format";
import { createCoupon, updateCoupon, setCouponStatus, deleteCoupon } from "./actions";
import { Modal, Field } from "./InfluencersTab";

export type CouponRow = {
  id: string;
  code: string;
  status: string;
  discountType: string | null;
  discountValue: number | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  influencerId: string;
  influencerName: string;
  hotelClientId: string;
  hotelName: string;
  redemptions: number;
  revenue: number;
};

type Opt = { id: string; name: string };
type InfluencerOpt = { id: string; name: string; hotelClientId: string | null };

const inputCls =
  "w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand";

function discountLabel(c: CouponRow): string {
  if (c.discountValue == null || !c.discountType) return "—";
  return c.discountType === "percentage" ? `${c.discountValue}%` : formatCurrency(c.discountValue);
}
function fmtDay(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
}
const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-success/15 text-success",
  DISABLED: "bg-line/50 text-ink-tertiary",
  EXPIRED: "bg-warning/15 text-warning",
};

export function CouponCodesTab({
  codes,
  influencers,
  hotels,
}: {
  codes: CouponRow[];
  influencers: InfluencerOpt[];
  hotels: Opt[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CouponRow | "new" | null>(null);
  const [redeeming, setRedeeming] = useState<CouponRow | null>(null);
  const [pending, startTransition] = useTransition();

  const [fHotel, setFHotel] = useState("");
  const [fInfluencer, setFInfluencer] = useState("");
  const [fStatus, setFStatus] = useState("");

  const filtered = useMemo(
    () =>
      codes.filter(
        (c) =>
          (!fHotel || c.hotelClientId === fHotel) &&
          (!fInfluencer || c.influencerId === fInfluencer) &&
          (!fStatus || c.status === fStatus),
      ),
    [codes, fHotel, fInfluencer, fStatus],
  );

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className={inputCls + " w-auto"} value={fHotel} onChange={(e) => setFHotel(e.target.value)} aria-label="Filter by hotel">
            <option value="">All hotels</option>
            {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select className={inputCls + " w-auto"} value={fInfluencer} onChange={(e) => setFInfluencer(e.target.value)} aria-label="Filter by influencer">
            <option value="">All influencers</option>
            {influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select className={inputCls + " w-auto"} value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
        <button type="button" onClick={() => setEditing("new")} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
          + Add code
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-line bg-card px-4 py-10 text-center text-sm text-ink-tertiary">
          No coupon codes{codes.length > 0 ? " match these filters" : " yet"}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="ht-table w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-tertiary">
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Influencer</th>
                <th className="px-4 py-2 font-medium">Hotel</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Discount</th>
                <th className="px-4 py-2 font-medium">Valid</th>
                <th className="px-4 py-2 text-right font-medium">Redemptions</th>
                <th className="px-4 py-2 text-right font-medium">Revenue</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5"><code className="font-medium text-ink">{c.code}</code></td>
                  <td className="px-4 py-2.5 text-ink-secondary">{c.influencerName}</td>
                  <td className="px-4 py-2.5 text-ink-tertiary">{c.hotelName}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[c.status] ?? "bg-line/50 text-ink-tertiary"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">{discountLabel(c)}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-tertiary">{fmtDay(c.validFrom)} – {fmtDay(c.validUntil)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.redemptions)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(c.revenue, { compact: true })}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-2 text-xs">
                      {c.status === "ACTIVE" && (
                        <button type="button" onClick={() => setRedeeming(c)} className="text-brand hover:underline">Log redemption</button>
                      )}
                      <button type="button" onClick={() => setEditing(c)} className="text-brand hover:underline">Edit</button>
                      <button type="button" disabled={pending} onClick={() => act(() => setCouponStatus(c.id, c.status === "ACTIVE" ? "DISABLED" : "ACTIVE"))} className="text-ink-tertiary hover:underline">
                        {c.status === "ACTIVE" ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => { if (confirm(`Delete code ${c.code}? Its redemptions are removed too.`)) act(() => deleteCoupon(c.id)); }}
                        className="text-danger hover:underline"
                      >
                        Delete
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
        <CouponModal
          row={editing === "new" ? null : editing}
          influencers={influencers}
          hotels={hotels}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
      {redeeming && (
        <RedemptionModal coupon={redeeming} onClose={() => setRedeeming(null)} onSaved={() => { setRedeeming(null); router.refresh(); }} />
      )}
    </div>
  );
}

function CouponModal({
  row,
  influencers,
  hotels,
  onClose,
  onSaved,
}: {
  row: CouponRow | null;
  influencers: InfluencerOpt[];
  hotels: Opt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(row?.code ?? "");
  const [influencerId, setInfluencerId] = useState(row?.influencerId ?? "");
  const [hotelClientId, setHotelClientId] = useState(row?.hotelClientId ?? "");
  const [discountType, setDiscountType] = useState(row?.discountType ?? "");
  const [discountValue, setDiscountValue] = useState(row?.discountValue != null ? String(row.discountValue) : "");
  const [validFrom, setValidFrom] = useState(row?.validFrom ? row.validFrom.slice(0, 10) : "");
  const [validUntil, setValidUntil] = useState(row?.validUntil ? row.validUntil.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const input = {
        code, influencerId, hotelClientId,
        discountType: discountType || null,
        discountValue: discountValue || null,
        validFrom: validFrom || null,
        validUntil: validUntil || null,
      };
      const res = row ? await updateCoupon(row.id, input) : await createCoupon(input);
      if (res.ok) onSaved();
      else setError(res.error ?? "Something went wrong.");
    });

  return (
    <Modal title={row ? "Edit coupon code" : "Add coupon code"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Code * (uppercased)">
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={50} autoFocus placeholder="PRIYA10" />
        </Field>
        <Field label="Influencer *">
          <select className={inputCls} value={influencerId} onChange={(e) => setInfluencerId(e.target.value)}>
            <option value="">Choose…</option>
            {influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Hotel *">
          <select className={inputCls} value={hotelClientId} onChange={(e) => setHotelClientId(e.target.value)}>
            <option value="">Choose…</option>
            {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Discount type">
            <select className={inputCls} value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
              <option value="">None</option>
              <option value="percentage">Percentage</option>
              <option value="flat">Flat ₹</option>
            </select>
          </Field>
          <Field label="Discount value">
            <input className={inputCls} type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="10" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valid from"><input className={inputCls} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></Field>
          <Field label="Valid until"><input className={inputCls} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-line-strong px-4 py-2 text-sm text-ink-secondary">Cancel</button>
          <button type="button" disabled={pending} onClick={submit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RedemptionModal({ coupon, onClose, onSaved }: { coupon: CouponRow; onClose: () => void; onSaved: () => void }) {
  const [bookingValue, setBookingValue] = useState("");
  const [bookingReference, setBookingReference] = useState("");
  const [guestName, setGuestName] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/agency/hotels/${coupon.hotelClientId}/redemptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponCodeId: coupon.id, bookingValue, bookingReference, guestName, bookingDate, notes }),
      });
      if (res.ok) onSaved();
      else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Could not log redemption (${res.status}).`);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal title={`Log redemption · ${coupon.code}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-ink-tertiary">
          {coupon.influencerName} · {coupon.hotelName}. This records an off-snippet booking — no tracking event is created.
        </p>
        <Field label="Booking value ₹ *">
          <input className={inputCls} type="number" value={bookingValue} onChange={(e) => setBookingValue(e.target.value)} autoFocus placeholder="15000" />
        </Field>
        <Field label="Guest name (shown only to your team)">
          <input className={inputCls} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Booking reference"><input className={inputCls} value={bookingReference} onChange={(e) => setBookingReference(e.target.value)} /></Field>
          <Field label="Booking date"><input className={inputCls} type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} /></Field>
        </div>
        <Field label="Notes"><textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-line-strong px-4 py-2 text-sm text-ink-secondary">Cancel</button>
          <button type="button" disabled={pending} onClick={submit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Saving…" : "Log redemption"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
