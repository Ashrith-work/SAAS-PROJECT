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
  const activeCls = "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black";
  const idleCls =
    "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

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
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <span className="text-zinc-400">→</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            onClick={applyCustom}
            className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
