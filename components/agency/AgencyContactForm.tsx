"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContactFormState, ContactInput } from "@/lib/agency-validation";

// One form, two homes: the required signup step and the Agency Settings section.
// Fully controlled inputs (React 19 resets uncontrolled fields after a server
// action) so values survive a validation round-trip. The server action is passed
// in as a prop; it returns a ContactFormState (optionally with a redirectTo that
// the signup flow uses to continue to the dashboard).

const initialState: ContactFormState = { ok: false };

const inputCls =
  "w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-disabled outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const labelCls = "block text-sm font-medium text-ink-secondary";
const errCls = "mt-1 text-xs text-danger";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error && <p className={errCls}>{error}</p>}
    </div>
  );
}

export function AgencyContactForm({
  action,
  initial,
  submitLabel,
  footerNote,
}: {
  action: (prev: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  initial?: Partial<ContactInput>;
  submitLabel: string;
  footerNote?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  const [mobile, setMobile] = useState(initial?.mobile ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial?.websiteUrl ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(initial?.whatsappNumber ?? "");
  const [sameAsMobile, setSameAsMobile] = useState(
    Boolean(initial?.mobile && initial?.whatsappNumber && initial.mobile === initial.whatsappNumber),
  );

  // When "same as mobile" is on, the WhatsApp field mirrors mobile (readOnly so
  // it still submits its value, unlike a disabled input).
  const waValue = sameAsMobile ? mobile : whatsappNumber;

  useEffect(() => {
    if (state.redirectTo) {
      router.replace(state.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  const err = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <Field id="mobile" label="Mobile number" error={err.mobile}>
        <div className="flex items-stretch gap-2">
          <span className="inline-flex select-none items-center rounded-lg border border-line-strong bg-elevated px-3 text-sm text-ink-secondary">
            🇮🇳 +91
          </span>
          <input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="98765 43210"
            className={inputCls}
          />
        </div>
      </Field>

      <Field id="contactEmail" label="Agency contact email" error={err.contactEmail}>
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          autoComplete="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="hello@youragency.com"
          className={inputCls}
        />
      </Field>

      <Field id="whatsappNumber" label="WhatsApp number" error={err.whatsappNumber}>
        <div className="flex items-stretch gap-2">
          <span className="inline-flex select-none items-center rounded-lg border border-line-strong bg-elevated px-3 text-sm text-ink-secondary">
            🇮🇳 +91
          </span>
          <input
            id="whatsappNumber"
            name="whatsappNumber"
            type="tel"
            inputMode="tel"
            value={waValue}
            readOnly={sameAsMobile}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="98765 43210"
            className={`${inputCls} ${sameAsMobile ? "opacity-60" : ""}`}
          />
        </div>
        <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={sameAsMobile}
            onChange={(e) => setSameAsMobile(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong"
          />
          Same as mobile number
        </label>
      </Field>

      <Field id="address" label="Address" error={err.address}>
        <textarea
          id="address"
          name="address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={"123 MG Road\nBengaluru, Karnataka 560001"}
          className={`${inputCls} resize-y`}
        />
      </Field>

      <Field id="websiteUrl" label="Website URL" error={err.websiteUrl}>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="text"
          inputMode="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="youragency.com"
          className={inputCls}
        />
      </Field>

      {state.formError && <p className="text-sm text-danger">{state.formError}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {state.ok && !state.redirectTo && <span className="text-xs text-success">Saved ✓</span>}
      </div>

      {footerNote && <p className="text-xs text-ink-tertiary">{footerNote}</p>}
    </form>
  );
}
