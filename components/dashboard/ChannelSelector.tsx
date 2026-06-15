"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CHANNEL_KEYS, type ChannelKey } from "@/lib/channel-view-types";

// Top-level channel selector for the hotel dashboard. Pills on desktop, a native
// dropdown on mobile. Selection lives in the ?channel= URL param (bookmarkable /
// shareable); switching is a soft navigation (no full reload) that preserves the
// date-range params, and integrates with browser back/forward.

type Meta = { label: string; color: string; icon: string };

// Colors mirror the Bookings-by-Source chart (components/dashboard/PerformanceOverview).
export const CHANNEL_META: Record<ChannelKey, Meta> = {
  all: { label: "All Channels", color: "#9ca3af", icon: "📊" },
  meta_ads: { label: "Meta Ads", color: "#3b82f6", icon: "📘" },
  google_ads: { label: "Google Ads", color: "#ef4444", icon: "🔍" },
  instagram_organic: { label: "Instagram Content", color: "#ec4899", icon: "📷" },
  facebook_organic: { label: "Facebook Organic", color: "#6366f1", icon: "👍" },
  influencer: { label: "Influencer", color: "#f59e0b", icon: "⭐" },
  direct: { label: "Direct", color: "#9ca3af", icon: "🔗" },
  other: { label: "Other", color: "#8b5cf6", icon: "❓" },
};

export function ChannelSelector({ current }: { current: ChannelKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(channel: ChannelKey): string {
    const params = new URLSearchParams(searchParams.toString());
    if (channel === "all") params.delete("channel");
    else params.set("channel", channel);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function go(channel: ChannelKey) {
    router.push(hrefFor(channel));
  }

  return (
    <div className="w-full">
      {/* Mobile: dropdown */}
      <label className="sr-only" htmlFor="channel-select">Channel</label>
      <select
        id="channel-select"
        value={current}
        onChange={(e) => go(e.target.value as ChannelKey)}
        className="w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:hidden"
      >
        {CHANNEL_KEYS.map((k) => (
          <option key={k} value={k}>
            {CHANNEL_META[k].icon} {CHANNEL_META[k].label}
          </option>
        ))}
      </select>

      {/* Desktop: pills */}
      <div className="hidden flex-wrap gap-2 sm:flex">
        {CHANNEL_KEYS.map((k) => {
          const meta = CHANNEL_META[k];
          const active = k === current;
          return (
            <button
              key={k}
              type="button"
              onClick={() => go(k)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-transparent text-white"
                  : "border-line-strong text-ink-secondary hover:bg-elevated"
              }`}
              style={active ? { backgroundColor: meta.color } : undefined}
            >
              <span aria-hidden>{meta.icon}</span>
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
