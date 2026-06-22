"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Small "Export ▾" dropdown with Excel + CSV options. Builds the export URL
// from a base path (e.g. /api/content/export) and appends the current page's
// searchParams, so the export honors any filters the user has applied.
export function ExportMenu({
  basePath,
  hiddenParams,
  label = "Export",
}: {
  // API route the format=xlsx|csv lands on, e.g. "/api/content/export".
  basePath: string;
  // Extra query params to include (e.g. derived ids not in the URL).
  hiddenParams?: Record<string, string>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sp = useSearchParams();
  const pathname = usePathname(); // unused; included so the component re-renders on nav

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  function hrefFor(format: "xlsx" | "csv"): string {
    const u = new URLSearchParams();
    if (sp) sp.forEach((v, k) => u.set(k, v));
    if (hiddenParams) for (const [k, v] of Object.entries(hiddenParams)) u.set(k, v);
    u.set("format", format);
    return `${basePath}?${u.toString()}`;
  }

  void pathname;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-button border border-line-strong bg-elevated px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-button border border-line bg-elevated shadow-float">
          <a
            href={hrefFor("xlsx")}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-ink-secondary hover:bg-line-strong"
          >
            Excel (.xlsx)
          </a>
          <a
            href={hrefFor("csv")}
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-2.5 text-sm text-ink-secondary hover:bg-line-strong"
          >
            CSV (.csv)
          </a>
        </div>
      )}
    </div>
  );
}
