"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  syncInstagramNow,
  disconnectInstagram,
  testInstagramConnectionAction,
  type SyncState,
  type TestConnectionState,
} from "./social-actions";

const syncInitial: SyncState = { error: null, ok: false, message: null };
const testInitial: TestConnectionState = {
  error: null,
  ok: false,
  username: null,
  followersCount: null,
};

export function InstagramActions({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const [state, action, syncing] = useActionState(syncInstagramNow, syncInitial);
  const [testState, testAction, testing] = useActionState(
    testInstagramConnectionAction,
    testInitial,
  );

  // Refresh after a successful sync so the stored snapshots render.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <form action={action}>
          <input type="hidden" name="hotelId" value={hotelId} />
          <button
            type="submit"
            disabled={syncing}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {syncing ? "Syncing…" : "Sync insights now"}
          </button>
        </form>
        <form action={testAction}>
          <input type="hidden" name="hotelId" value={hotelId} />
          <button
            type="submit"
            disabled={testing}
            className="rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong disabled:opacity-60"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </form>
        <form action={disconnectInstagram}>
          <input type="hidden" name="hotelId" value={hotelId} />
          <button
            type="submit"
            className="rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
          >
            Disconnect
          </button>
        </form>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && state.message && (
        <p className="text-sm text-success">{state.message}</p>
      )}
      {testState.error && <p className="text-sm text-danger">{testState.error}</p>}
      {testState.ok && testState.followersCount !== null && (
        <p className="text-sm text-success">
          Connection OK — @{testState.username} ·{" "}
          {testState.followersCount.toLocaleString()} followers (live from
          graph.instagram.com).
        </p>
      )}
    </div>
  );
}
