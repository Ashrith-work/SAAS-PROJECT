"use client";

import { useActionState } from "react";
import { unlockShare, type UnlockState } from "./actions";

const initial: UnlockState = { error: null };

export function PasswordGate({
  token,
  hotelName,
  agencyName,
}: {
  token: string;
  hotelName: string;
  agencyName: string;
}) {
  const [state, action, pending] = useActionState(unlockShare, initial);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-16">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          HotelTrack
        </p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">{hotelName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Performance report shared by {agencyName}
        </p>
      </div>

      <form action={action} className="mt-8 space-y-3">
        <input type="hidden" name="token" value={token} />
        <label htmlFor="password" className="block text-sm font-medium">
          Enter the password to view
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base dark:border-zinc-700 dark:bg-zinc-950"
        />
        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {pending ? "Checking…" : "View report"}
        </button>
      </form>
    </main>
  );
}
