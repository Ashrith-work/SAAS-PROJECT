"use client";

import { useActionState, useState } from "react";
import { saveOtaRate, type OtaRateState } from "./ota-actions";

// "OTA Commission Tracking" settings (Part 4) — set the average commission % the
// hotel pays OTAs, used to compute direct-booking savings on the dashboards.

const initial: OtaRateState = { error: null, ok: false };

export function OtaCommissionSettings({ hotelId, currentRate }: { hotelId: string; currentRate: number }) {
  const [state, action, pending] = useActionState(saveOtaRate, initial);
  const [why, setWhy] = useState(false);

  return (
    <section className="overflow-hidden rounded-xl border border-line">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-medium">OTA Commission Tracking</h2>
        <p className="mt-0.5 text-sm text-ink-tertiary">
          Set the average commission rate this hotel pays online travel agencies (OTAs) like
          Booking.com, MakeMyTrip, and Agoda. HotelTrack uses this to calculate how much money your
          direct bookings saved compared to OTA bookings.
        </p>
      </div>

      <form action={action} className="space-y-4 p-4">
        <input type="hidden" name="hotelId" value={hotelId} />
        <div>
          <label htmlFor="otaCommissionRate" className="block text-sm font-medium text-ink-secondary">
            Average OTA commission rate
          </label>
          <div className="mt-1 flex max-w-[12rem] items-center rounded-lg border border-line-strong bg-page focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
            <input
              id="otaCommissionRate"
              name="otaCommissionRate"
              type="number"
              min={0}
              max={50}
              step={0.5}
              defaultValue={currentRate}
              className="w-full bg-transparent px-3 py-2 text-sm text-ink outline-none"
            />
            <span className="px-3 text-sm text-ink-tertiary">%</span>
          </div>
          <p className="mt-1 text-xs text-ink-tertiary">
            Typical range: 12–22%. Booking.com averages 15%, MakeMyTrip averages 20%.
          </p>
        </div>

        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        {state.ok && <p className="text-sm text-success">Saved.</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save rate"}
        </button>

        <div className="border-t border-line pt-3">
          <button type="button" onClick={() => setWhy((w) => !w)} className="text-sm font-medium text-brand">
            {why ? "▾" : "▸"} Why does this matter?
          </button>
          {why && (
            <p className="mt-2 text-sm text-ink-tertiary">
              OTAs charge hotels 15–22% commission on every booking they bring. Every direct booking
              your agency generates saves you that commission. This setting lets HotelTrack show you
              and the hotel owner exactly how much money is being saved.
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
