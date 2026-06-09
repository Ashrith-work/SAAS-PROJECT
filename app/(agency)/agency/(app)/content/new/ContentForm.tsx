"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createContentPiece, type CreateContentState } from "../actions";
import { CopyButton } from "@/components/ui/CopyButton";

const initialState: CreateContentState = { error: null, result: null };

const CONTENT_TYPES = [
  { value: "organic", label: "Organic post" },
  { value: "paid_ad", label: "Paid ad" },
  { value: "influencer", label: "Influencer collab" },
  { value: "story", label: "Story" },
] as const;

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
] as const;

const inputCls =
  "w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-disabled outline-none focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export function ContentForm({
  hotels,
}: {
  hotels: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createContentPiece, initialState);
  // Controlled so the influencer-only fields can appear/disappear live.
  const [contentType, setContentType] = useState<string>("organic");
  const isInfluencer = contentType === "influencer";

  return (
    <div className="space-y-6">
      {state.result && (
        <div className="rounded-xl border-l-4 border-success bg-success/10 p-4">
          <p className="text-sm font-medium text-success">
            Tracked link generated for “{state.result.title}”
          </p>
          <div className="mt-3 flex items-start gap-2">
            <code className="block flex-1 overflow-x-auto break-all rounded-lg border border-line bg-code px-4 py-3 text-sm text-codeink">
              {state.result.utmLink}
            </code>
            <CopyButton text={state.result.utmLink} />
          </div>
          <p className="mt-2 text-xs text-ink-tertiary">
            Use this link in the content. Every visit and booking it drives will
            show up against this piece.
          </p>
          <Link
            href="/agency/content"
            className="mt-3 inline-block text-sm font-medium underline"
          >
            View Content Library →
          </Link>
        </div>
      )}

      <form action={action} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="hotelClientId" className="text-sm font-medium text-ink-secondary">
            Hotel client
          </label>
          <select id="hotelClientId" name="hotelClientId" className={inputCls} defaultValue="">
            <option value="" disabled>
              Select a hotel client…
            </option>
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="title" className="text-sm font-medium text-ink-secondary">
            Title
          </label>
          <input
            id="title"
            name="title"
            className={inputCls}
            placeholder="Summer rooftop reel"
          />
          <p className="text-xs text-ink-tertiary">
            Becomes the campaign name in the link (e.g. “summer-rooftop-reel”).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="contentType" className="text-sm font-medium text-ink-secondary">
              Content type
            </label>
            <select
              id="contentType"
              name="contentType"
              className={inputCls}
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            >
              {CONTENT_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="platform" className="text-sm font-medium text-ink-secondary">
              Platform
            </label>
            <select id="platform" name="platform" className={inputCls} defaultValue="instagram">
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="destinationUrl" className="text-sm font-medium text-ink-secondary">
            Destination URL
          </label>
          <input
            id="destinationUrl"
            name="destinationUrl"
            type="url"
            className={inputCls}
            placeholder="https://seasideresort.com/rooms"
          />
          <p className="text-xs text-ink-tertiary">
            The page on the hotel’s site this content sends people to.
          </p>
        </div>

        {isInfluencer && (
          <div className="space-y-4 rounded-lg border border-line p-4">
            <div className="space-y-1.5">
              <label htmlFor="influencerName" className="text-sm font-medium text-ink-secondary">
                Influencer name
              </label>
              <input
                id="influencerName"
                name="influencerName"
                className={inputCls}
                placeholder="@traveljane"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="couponCode" className="text-sm font-medium text-ink-secondary">
                Coupon code
              </label>
              <input
                id="couponCode"
                name="couponCode"
                className={inputCls}
                placeholder="JANE10"
              />
              <p className="text-xs text-ink-tertiary">
                Guests who redeem this code can be matched back to this collab.
              </p>
            </div>
          </div>
        )}

        {state.error && <p className="text-sm text-danger">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Generating…" : "Generate tracked link"}
        </button>
      </form>
    </div>
  );
}
