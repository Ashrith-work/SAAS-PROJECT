"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { adminSyncNow, type SyncNowState } from "./actions";

const initialState: SyncNowState = { error: null, ok: false, message: null };

const fieldCls =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950";

export type SyncableHotel = {
  id: string;
  name: string;
  agencyName: string;
  mapped: boolean;
  lastSyncedAt: string | null;
};

// Manual per-hotel Meta sync trigger. All fields are CONTROLLED on purpose:
// React 19 resets uncontrolled form fields after a form action completes,
// which would wipe the password and selection after every run.
export function SyncNowForm({ hotels }: { hotels: SyncableHotel[] }) {
  const [state, action, pending] = useActionState(adminSyncNow, initialState);
  const firstMapped = hotels.find((h) => h.mapped);
  const [hotelId, setHotelId] = useState(firstMapped?.id ?? "");
  const [days, setDays] = useState("7");
  const [password, setPassword] = useState("");
  const hotelRef = useRef<HTMLSelectElement>(null);

  // React 19's automatic form reset after an action desyncs even a CONTROLLED
  // <select>: the DOM snaps to the first option while React state (and so the
  // next submission) keeps the user's choice — the display lies. Re-assert the
  // DOM value after every render so what the admin sees is what will sync.
  useEffect(() => {
    if (hotelRef.current && hotelRef.current.value !== hotelId) {
      hotelRef.current.value = hotelId;
    }
  });

  return (
    <form action={action} className="max-w-xl space-y-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="hotelId" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Hotel
        </label>
        <select
          ref={hotelRef}
          id="hotelId"
          name="hotelId"
          value={hotelId}
          disabled={pending}
          onChange={(e) => setHotelId(e.target.value)}
          className={fieldCls}
        >
          {hotels.map((h) => (
            <option key={h.id} value={h.id} disabled={!h.mapped}>
              {h.agencyName} / {h.name}
              {h.mapped ? "" : " — no ad account mapped"}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="days" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Trailing days to (re)sync (1–90)
        </label>
        <input
          id="days"
          name="days"
          type="number"
          min={1}
          max={90}
          value={days}
          disabled={pending}
          onChange={(e) => setDays(e.target.value)}
          className={fieldCls}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Admin password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="off"
          value={password}
          disabled={pending}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldCls}
        />
      </div>

      <button
        type="submit"
        disabled={pending || !hotelId}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>

      {state.error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-300">
          {state.message}
        </p>
      )}
    </form>
  );
}
