"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Plan-limit upgrade prompt, shown as a modal with a direct button to Billing.
// Used when an agency hits a plan cap (e.g. adding a 4th hotel on Starter). Opens
// immediately; dismissing returns the user where they came from.
export function UpgradeModal({
  title,
  message,
  backHref,
}: {
  title: string;
  message: string;
  /** Where "Maybe later" sends the user (defaults to back). */
  backHref?: string;
}) {
  const [open, setOpen] = useState(true);
  const router = useRouter();

  if (!open) return null;

  function dismiss() {
    setOpen(false);
    if (backHref) router.push(backHref);
    else router.back();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            ↑
          </div>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={dismiss}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Maybe later
          </button>
          <Link
            href="/agency/billing"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            View plans →
          </Link>
        </div>
      </div>
    </div>
  );
}
