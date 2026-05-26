"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { createAgencyForCurrentUser } from "./actions";

export function OnboardingClient({
  alreadyMember,
  suggestedName,
}: {
  alreadyMember: boolean;
  suggestedName: string;
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(alreadyMember);
  const [error, setError] = useState<string | null>(null);

  // Refresh the Clerk session token so the new `role` claim is visible to Proxy
  // immediately, then continue to the dashboard.
  const finish = useCallback(async () => {
    try {
      await user?.reload();
      await getToken({ skipCache: true });
    } catch {
      // best-effort; navigation will still trigger a fresh token fetch
    }
    router.replace("/agency/dashboard");
    router.refresh();
  }, [user, getToken, router]);

  useEffect(() => {
    if (alreadyMember) void finish();
  }, [alreadyMember, finish]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const result = await createAgencyForCurrentUser(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    await finish();
  }

  if (alreadyMember) {
    return <p className="text-zinc-500">Setting up your workspace…</p>;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <div>
        <h1 className="text-xl font-semibold">Create your agency</h1>
        <p className="mt-1 text-sm text-zinc-500">
          This is the workspace your hotel clients will live under.
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="agencyName" className="text-sm font-medium">
          Agency name
        </label>
        <input
          id="agencyName"
          name="agencyName"
          defaultValue={suggestedName}
          required
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {loading ? "Creating…" : "Create agency"}
      </button>
    </form>
  );
}
