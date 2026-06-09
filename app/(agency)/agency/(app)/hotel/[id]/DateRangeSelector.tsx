"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PRESETS = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
] as const;

export function DateRangeSelector({
  current,
  fromInput,
  toInput,
}: {
  current: string;
  fromInput: string;
  toInput: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [from, setFrom] = useState(fromInput);
  const [to, setTo] = useState(toInput);

  function selectPreset(key: string) {
    setShowCustom(false);
    router.push(`${pathname}?range=${key}`);
  }

  function applyCustom() {
    if (!from || !to) return;
    router.push(`${pathname}?from=${from}&to=${to}`);
  }

  const baseCls =
    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors";
  const activeCls = "border-brand bg-brand text-white";
  const idleCls =
    "border-line-strong text-ink-secondary hover:bg-elevated";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => selectPreset(p.key)}
          className={`${baseCls} ${current === p.key ? activeCls : idleCls}`}
        >
          Last {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setShowCustom((v) => !v)}
        className={`${baseCls} ${current === "custom" ? activeCls : idleCls}`}
      >
        Custom
      </button>

      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-line-strong bg-page px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <span className="text-ink-disabled">→</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-line-strong bg-page px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <button
            type="button"
            onClick={applyCustom}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
