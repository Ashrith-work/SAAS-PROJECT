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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-elevated p-6 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            ↑
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-sm text-ink-secondary">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={dismiss}
            className="rounded-lg border border-line-strong bg-elevated px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
          >
            Maybe later
          </button>
          <Link
            href="/agency/billing"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            View plans →
          </Link>
        </div>
      </div>
    </div>
  );
}
