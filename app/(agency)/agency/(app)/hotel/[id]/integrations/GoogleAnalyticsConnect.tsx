"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { connectGoogleAnalytics, type ConnectGaState } from "./ga-actions";

const initial: ConnectGaState = { error: null, ok: false };

const inputCls =
  "w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-disabled outline-none focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export function GoogleAnalyticsConnect({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(connectGoogleAnalytics, initial);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-secondary">
        Pull this hotel&apos;s total website performance from Google Analytics 4
        so the dashboard can show <strong>every</strong> visit (not just the ones
        with HotelTrack&apos;s UTM tags) and break down traffic by source.
      </p>

      <details
        className="rounded-lg border border-line p-3 text-sm"
        open
      >
        <summary className="cursor-pointer select-none font-medium text-ink">
          How to create the service account
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-secondary">
          <li>
            Go to{" "}
            <a
              href="https://console.cloud.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              console.cloud.google.com
            </a>{" "}
            and create (or pick) a project.
          </li>
          <li>
            <strong>APIs &amp; Services → Library</strong>, search for{" "}
            <em>Google Analytics Data API</em> and click <strong>Enable</strong>.
          </li>
          <li>
            <strong>IAM &amp; Admin → Service Accounts → Create service account</strong>.
            Give it any name (e.g. <em>hoteltrack-ga</em>); no project roles are
            needed.
          </li>
          <li>
            Open the new service account → <strong>Keys → Add Key → Create new
            key → JSON</strong>. Save the file that downloads.
          </li>
          <li>
            Copy the service account&apos;s email (looks like{" "}
            <code className="text-xs">name@project.iam.gserviceaccount.com</code>).
          </li>
          <li>
            In{" "}
            <a
              href="https://analytics.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Google Analytics
            </a>{" "}
            → <strong>Admin → Property → Property Access Management →
            Add user</strong>, paste the service account email and grant{" "}
            <strong>Viewer</strong> on the GA4 property for this hotel.
          </li>
          <li>
            Grab the <strong>Property ID</strong> from{" "}
            <strong>Admin → Property settings</strong> (numeric, e.g.{" "}
            <code className="text-xs">123456789</code>).
          </li>
          <li>Upload the .json file + paste the Property ID below.</li>
        </ol>
      </details>

      <form action={action} className="space-y-3">
        <input type="hidden" name="hotelId" value={hotelId} />

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
            GA4 Property ID
          </span>
          <input
            name="propertyId"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 123456789"
            className={`mt-1 ${inputCls}`}
            required
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
            Service-account JSON key
          </span>
          <input
            name="credentialsFile"
            type="file"
            accept="application/json,.json"
            className="mt-1 block w-full text-sm text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-secondary hover:file:bg-line-strong"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          {fileName && (
            <span className="mt-1 block text-xs text-ink-tertiary">
              Selected: <code>{fileName}</code>
            </span>
          )}
        </label>

        <details className="text-xs text-ink-tertiary">
          <summary className="cursor-pointer select-none">
            Or paste the JSON contents instead
          </summary>
          <textarea
            name="credentialsJson"
            rows={6}
            spellCheck={false}
            autoComplete="off"
            placeholder='{"type":"service_account", …}'
            className={`mt-2 ${inputCls} font-mono text-xs`}
          />
        </details>

        {state.error && (
          <div className="rounded-lg border-l-4 border-warning bg-warning/10 p-3 text-sm text-ink-secondary">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Testing & saving…" : "Test connection & save"}
        </button>
        <p className="text-xs text-ink-tertiary">
          We test against your property before saving. Credentials are encrypted
          (AES-256-GCM) at rest and never shown again or sent to your browser.
        </p>
      </form>
    </div>
  );
}
