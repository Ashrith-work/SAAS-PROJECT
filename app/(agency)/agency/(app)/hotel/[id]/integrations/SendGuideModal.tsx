"use client";

import { useState } from "react";

// Help panel + modal for sharing the public setup guide with a hotel client.
// Each share action also pings /api/guide so the download/share is logged to the
// GuideDownload table (attributed to this agency + hotel) for usage analytics.
export function SendGuideModal({
  hotelId,
  publicUrl,
}: {
  hotelId: string;
  publicUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const guideUrl = `${publicUrl}/setup-guide`;
  const downloadHref = `/api/guide?method=direct&hotelClientId=${encodeURIComponent(hotelId)}`;
  const mailtoHref =
    `mailto:?subject=${encodeURIComponent("Your HotelTrack setup guide")}` +
    `&body=${encodeURIComponent(
      `Hi,\n\nHere is the HotelTrack setup guide — it walks you through installing the website snippet and connecting Instagram:\n\n${guideUrl}\n\nMost hotels complete setup in under 20 minutes.\n`,
    )}`;

  // Fire-and-forget tracking for the link/email shares (the file download is
  // tracked server-side by the route the browser navigates to).
  function track(method: "link" | "email") {
    fetch(
      `/api/guide?method=${method}&hotelClientId=${encodeURIComponent(hotelId)}`,
      { method: "GET", keepalive: true },
    ).catch(() => {});
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(guideUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = guideUrl;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    track("link");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M4 4h16v12H5.17L4 17.17V4z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Send setup guide to hotel
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Send setup guide to hotel"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-elevated p-6 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-ink">Send setup guide to hotel</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-ink-disabled hover:bg-line-strong hover:text-ink-secondary"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <p className="mt-2 text-sm text-ink-tertiary">
              Share the public guide — no login needed to read it.
            </p>

            {/* Copy URL */}
            <div className="mt-4 space-y-3">
              <div className="flex items-stretch gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg border border-line bg-code px-3 py-2 text-sm text-codeink">
                  {guideUrl}
                </code>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="shrink-0 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
                >
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={downloadHref}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Download PDF
                </a>
                <a
                  href={mailtoHref}
                  onClick={() => track("email")}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-elevated px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M4 6h16v12H4zM4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Email link
                </a>
              </div>
            </div>

            <p className="mt-4 rounded-lg bg-card p-3 text-sm text-ink-secondary">
              Share this guide with your hotel&apos;s web/marketing person — it
              walks them through installing the snippet and connecting Instagram.
              Most hotels complete setup in under 20 minutes.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
