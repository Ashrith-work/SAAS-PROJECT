"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  syncGaInsights,
  disconnectGoogleAnalytics,
  testGaConnectionAction,
  type GaSyncState,
  type GaTestState,
} from "./ga-actions";

const syncInitial: GaSyncState = { error: null, ok: false, message: null };
const testInitial: GaTestState = { error: null, ok: false };

export function GoogleAnalyticsActions({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const [syncState, syncAction, syncing] = useActionState(syncGaInsights, syncInitial);
  const [testState, testAction, testing] = useActionState(
    testGaConnectionAction,
    testInitial,
  );

  useEffect(() => {
    if (syncState.ok || (!testState.ok && testState.error)) router.refresh();
  }, [syncState.ok, testState.ok, testState.error, router]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <form action={syncAction}>
          <input type="hidden" name="hotelId" value={hotelId} />
          <button
            type="submit"
            disabled={syncing}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {syncing ? "Syncing…" : "Sync GA data now"}
          </button>
        </form>
        <form action={testAction}>
          <input type="hidden" name="hotelId" value={hotelId} />
          <button
            type="submit"
            disabled={testing}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </form>
        <form action={disconnectGoogleAnalytics}>
          <input type="hidden" name="hotelId" value={hotelId} />
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Disconnect
          </button>
        </form>
      </div>
      {syncState.error && <p className="text-sm text-red-600">{syncState.error}</p>}
      {syncState.ok && syncState.message && (
        <p className="text-sm text-green-600 dark:text-green-400">{syncState.message}</p>
      )}
      {testState.error && <p className="text-sm text-red-600">{testState.error}</p>}
      {testState.ok && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Connection OK — service account can read this property.
        </p>
      )}
    </div>
  );
}
