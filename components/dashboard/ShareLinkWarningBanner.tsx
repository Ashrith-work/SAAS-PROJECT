"use client";

import { useEffect, useState } from "react";

// Top-of-page security notice for the PUBLIC share-link dashboard. Dismissible
// for the current browser SESSION only (sessionStorage) — so it reappears every
// new session/tab, which is what we want for an anonymous, forwardable link.
//
// State is per-tab (sessionStorage is not shared across tabs/windows), so two
// concurrent viewers never affect each other's banner. We render nothing until
// mounted to avoid a hydration mismatch and a dismissed-then-flash.

const DISMISS_KEY = "ht-share-warning-dismissed";

export function ShareLinkWarningBanner({ hotelName }: { hotelName: string }) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // sessionStorage may be unavailable (private mode/quotas) — show the banner.
    }
    setMounted(true);
  }, []);

  if (!mounted || dismissed) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore — dismissal just won't persist
    }
    setDismissed(true);
  }

  return (
    <div
      role="alert"
      className="border-b border-warning/40 bg-warning/10"
      data-testid="share-warning-banner"
    >
      <div className="mx-auto flex w-full max-w-5xl items-start gap-3 px-4 py-3 sm:px-6">
        <span aria-hidden className="mt-0.5 shrink-0 text-warning">
          ⚠
        </span>
        <p className="flex-1 text-sm text-ink-secondary">
          You&apos;re viewing <span className="font-medium text-ink">{hotelName}</span>&apos;s private
          dashboard via a share link. This link gives full access to ad spend, revenue, and
          performance data. Do not forward this link publicly. Contact your agency if you suspect the
          link has been compromised — they can revoke it instantly.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss warning"
          className="shrink-0 rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-elevated"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
