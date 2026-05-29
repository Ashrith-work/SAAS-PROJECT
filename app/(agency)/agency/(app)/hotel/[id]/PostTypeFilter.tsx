"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

// Filter for the Top Posts table on the hotel dashboard. Drives the
// `postType` URL search param so the SSR query in page.tsx picks it up. Keeping
// state in the URL lets the user share / bookmark a filtered view and survives
// hard reloads.

const TYPES = [
  { value: "all", label: "All" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "carousel", label: "Carousel" },
  { value: "reels", label: "Reels" },
] as const;

export function PostTypeFilter({ current }: { current: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(value: string) {
    const next = new URLSearchParams(params?.toString());
    if (value === "all") next.delete("postType");
    else next.set("postType", value);
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
      {TYPES.map((t) => {
        const active = t.value === current || (t.value === "all" && !current);
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => select(t.value)}
            disabled={pending}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            } disabled:opacity-60`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
