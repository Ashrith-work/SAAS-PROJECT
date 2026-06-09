"use client";

import { useState } from "react";

// ── Code block with a per-block copy button ──────────────────────────────────
// Dark background, monospace, blue accent text — matches the in-app snippet UI.
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
    <div className="sg-codeblock my-4 overflow-hidden rounded-xl border border-line bg-code print:border-line-strong">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          {caption ?? "Code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:bg-white/10 print:hidden"
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

type TocItem = { id: string; label: string; children?: TocItem[] };

// ── Table of contents ────────────────────────────────────────────────────────
// Desktop: a sticky sidebar (always visible). Mobile: a collapsible accordion
// that closes itself after a jump so the reader lands on the section.
export function Toc({ items }: { items: TocItem[] }) {
  const [open, setOpen] = useState(false);

  const list = (onClick?: () => void) => (
    <ul className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={onClick}
            className="block rounded-md px-3 py-1.5 font-medium text-ink-secondary transition hover:bg-brand/10 hover:text-brand"
          >
            {item.label}
          </a>
          {item.children && item.children.length > 0 && (
            <ul className="mt-1 space-y-1 border-l border-line pl-3">
              {item.children.map((child) => (
                <li key={child.id}>
                  <a
                    href={`#${child.id}`}
                    onClick={onClick}
                    className="block rounded-md px-3 py-1.5 text-ink-tertiary transition hover:bg-brand/10 hover:text-brand"
                  >
                    {child.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* Mobile: collapsible accordion */}
      <div className="mb-6 rounded-xl border border-line bg-card lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ink"
          aria-expanded={open}
        >
          On this page
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && <div className="border-t border-line p-2">{list(() => setOpen(false))}</div>}
      </div>

      {/* Desktop: sticky sidebar */}
      <nav className="sticky top-24 hidden lg:block print:hidden" aria-label="Table of contents">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          On this page
        </p>
        {list()}
      </nav>
    </>
  );
}
