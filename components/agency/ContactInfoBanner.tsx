"use client";

import { useState } from "react";
import Link from "next/link";

// Non-blocking nudge for EXISTING agencies that haven't added contact info yet.
// The parent server component decides whether to render it (pre-deploy agency +
// any field missing — see lib/agency-contact.ts). Dismiss is session-scoped:
// it stays hidden for this browser session but returns next session until the
// info is filled in (at which point the parent stops rendering it entirely).

const DISMISS_KEY = "ht_contact_banner_dismissed";

export function ContactInfoBanner({
  settingsHref = "/agency/settings",
}: {
  settingsHref?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  // Read sessionStorage lazily on first paint; if already dismissed this session,
  // hide without a flash on subsequent navigations.
  if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1") {
    return null;
  }

  return (
    <div className="flex items-center gap-3 rounded-card border border-warning/40 bg-warning/10 px-4 py-3">
      <span aria-hidden className="text-lg leading-none">
        ⓘ
      </span>
      <p className="flex-1 text-sm text-ink-secondary">
        Add your agency contact info so hotels can reach you easily.
      </p>
      <Link
        href={settingsHref}
        className="shrink-0 rounded-lg border border-warning/50 bg-warning/15 px-3 py-1.5 text-sm font-medium text-ink hover:bg-warning/25"
      >
        Add Now
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // sessionStorage unavailable (private mode) — just hide for this render
          }
          setDismissed(true);
        }}
        className="shrink-0 rounded-md p-1 text-ink-tertiary hover:bg-warning/15 hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
