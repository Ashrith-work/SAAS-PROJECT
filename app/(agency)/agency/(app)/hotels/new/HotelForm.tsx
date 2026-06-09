"use client";

import { useActionState, useState } from "react";
import { createHotel } from "../actions";
import { SITE_PLATFORMS, SITE_PLATFORM_LABELS } from "@/lib/site-platform";

type Method = "url_change" | "same_page" | "both";
const initialState: { error: string | null } = { error: null };

const inputCls =
  "w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-disabled outline-none focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

function Field({
  label,
  name,
  type = "text",
  placeholder,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink-secondary">
        {label}
      </label>
      <input id={name} name={name} type={type} placeholder={placeholder} className={inputCls} />
      {help && <p className="text-xs text-ink-tertiary">{help}</p>}
    </div>
  );
}

export function HotelForm() {
  const [state, action, pending] = useActionState(createHotel, initialState);
  const [method, setMethod] = useState<Method>("url_change");
  const showUrl = method === "url_change" || method === "both";
  const showSame = method === "same_page" || method === "both";

  const options: { value: Method; title: string; desc: string }[] = [
    {
      value: "url_change",
      title: "Redirects to a new page",
      desc: "e.g. the site sends guests to a /thank-you or /confirmation page after booking.",
    },
    {
      value: "same_page",
      title: "Shows a confirmation on the same page",
      desc: "e.g. a success message appears without the URL changing.",
    },
    {
      value: "both",
      title: "Both / not sure",
      desc: "Watch for a URL change first, then fall back to watching the page.",
    },
  ];

  return (
    <form action={action} className="space-y-5">
      <Field label="Hotel name" name="name" placeholder="Seaside Resort" />
      <Field label="Website URL" name="websiteUrl" type="url" placeholder="https://seasideresort.com" />

      <div className="space-y-1.5">
        <label htmlFor="sitePlatform" className="text-sm font-medium text-ink-secondary">
          Website platform
        </label>
        <select id="sitePlatform" name="sitePlatform" defaultValue="wordpress" className={inputCls}>
          {SITE_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {SITE_PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-tertiary">
          We&apos;ll show the matching step-by-step snippet install guide.
        </p>
      </div>

      <Field label="Contact name" name="contactName" placeholder="Jane Doe" />
      <Field label="Contact email" name="contactEmail" type="email" placeholder="jane@seasideresort.com" />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink-secondary">How is a booking confirmed?</legend>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
              method === o.value
                ? "border-brand"
                : "border-line-strong"
            }`}
          >
            <input
              type="radio"
              name="conversionMethod"
              value={o.value}
              checked={method === o.value}
              onChange={() => setMethod(o.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-ink">{o.title}</span>
              <span className="block text-xs text-ink-tertiary">{o.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {showUrl && (
        <Field
          label="Thank-you URL pattern"
          name="thankYouUrlPattern"
          placeholder="/thank-you"
          help="The path (or part of it) shown after a booking. Wildcards (*) are allowed."
        />
      )}

      {showSame && (
        <div className="space-y-4 rounded-lg border border-line p-4">
          <Field
            label="Success phrase (text on the page)"
            name="successPhrase"
            placeholder="Booking confirmed"
          />
          <Field
            label="…or success CSS selector"
            name="successSelector"
            placeholder="#booking-confirmation"
          />
          <p className="text-xs text-ink-tertiary">Provide at least one of the two above.</p>
        </div>
      )}

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create hotel client"}
      </button>
    </form>
  );
}
