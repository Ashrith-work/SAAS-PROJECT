"use client";

import { useState } from "react";

// Code block with a per-block copy button. Near-black bg (bg-code) for max
// contrast, light-blue code text. Shared by the setup guide and in-app snippet
// UIs so every code sample looks identical.

export function CodeBlock({
  code,
  caption,
}: {
  code: string;
  caption?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
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
    <div className="sg-codeblock my-4 overflow-hidden rounded-card border border-line bg-code">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          {caption ?? "Code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded-button border border-white/15 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:bg-white/10 print:hidden"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-sm leading-relaxed">
        <code className="whitespace-pre font-mono text-codeink">{code}</code>
      </pre>
    </div>
  );
}
