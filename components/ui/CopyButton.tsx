"use client";

import { useState } from "react";

// Shared copy-to-clipboard button. Falls back to execCommand for older browsers
// and insecure (non-HTTPS) contexts where the async Clipboard API is unavailable.
export function CopyButton({
  text,
  label = "Copy",
  className = "shrink-0 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className={className}>
      {copied ? "Copied!" : label}
    </button>
  );
}
