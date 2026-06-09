"use client";

import { useActionState, useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import {
  generateHotelShareLink,
  revokeHotelShareLink,
  setShowAdSpendToHotel,
  type HotelShareState,
} from "./hotel-share-actions";

type Access = {
  lastViewedAt: string | null; // ISO
  /** Whole days since the last view, computed server-side. null = never viewed. */
  daysSinceLastView: number | null;
  views30d: number;
  totalViews: number;
};

const initial: HotelShareState = { error: null, ok: false };

function GenerateButton({ hotelId, cta }: { hotelId: string; cta: string }) {
  const [state, action, pending] = useActionState(generateHotelShareLink, initial);
  return (
    <form action={action}>
      <input type="hidden" name="hotelId" value={hotelId} />
      {state.error && <p className="mb-2 text-sm text-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {pending ? "Generating…" : cta}
      </button>
    </form>
  );
}

function SendModal({
  url,
  hotelName,
  agencyName,
  contactEmail,
  onClose,
}: {
  url: string;
  hotelName: string;
  agencyName: string;
  contactEmail: string | null;
  onClose: () => void;
}) {
  const subject = `Your ${hotelName} performance dashboard`;
  const body =
    `Hi,\n\n${agencyName} has set up a live, read-only performance dashboard for ${hotelName}.\n` +
    `You can open it any time — on your phone or computer — here:\n\n${url}\n\n` +
    `No login needed. It shows your bookings, channel performance, Instagram and website traffic.\n\n` +
    `— ${agencyName}`;
  const mailto = `mailto:${contactEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${subject}\n${url}`)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-ink">Send to {hotelName}</h3>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-tertiary">
          Share this read-only dashboard link with the hotel.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <input
            readOnly
            value={url}
            onFocusCapture={(e) => e.currentTarget.select()}
            className="w-full flex-1 truncate rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink"
          />
          <CopyButton text={url} label="Copy" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <a
            href={mailto}
            className="flex items-center justify-center rounded-lg border border-line-strong bg-elevated px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
          >
            ✉️ Email
          </a>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-lg border border-line-strong bg-elevated px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
          >
            💬 WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

function AdSpendToggle({ hotelId, initialOn }: { hotelId: string; initialOn: boolean }) {
  const [on, setOn] = useState(initialOn);
  return (
    <form action={setShowAdSpendToHotel} className="flex items-start justify-between gap-3">
      <input type="hidden" name="hotelId" value={hotelId} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">Show ad spend amounts to hotel</p>
        <p className="mt-0.5 text-xs text-ink-tertiary">
          When OFF, the hotel sees bookings and channel performance but not how much
          was spent on ads.
        </p>
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center" title="When OFF, ad spend and True ROAS are hidden from the hotel.">
        <input
          type="checkbox"
          name="show"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            e.currentTarget.form?.requestSubmit();
          }}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-brand" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
      </label>
    </form>
  );
}

function AccessAnalytics({ access }: { access: Access }) {
  const last = access.lastViewedAt ? new Date(access.lastViewedAt) : null;
  const daysSince = access.daysSinceLastView;
  const stale = daysSince != null && daysSince >= 14;
  return (
    <div className="rounded-lg border border-line bg-page p-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-tertiary">
        <span>
          Last viewed:{" "}
          <span className="text-ink-secondary">
            {last ? last.toLocaleString() : "never opened yet"}
          </span>
        </span>
        <span>
          Views (30 days): <span className="text-ink-secondary tabular-nums">{access.views30d}</span>
        </span>
      </div>
      {last == null ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-xs text-ink-tertiary">
          The hotel hasn&apos;t opened this dashboard yet.
        </p>
      ) : stale ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning ring-1 ring-warning/30">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          Hotel hasn&apos;t viewed in {daysSince}+ days — a good moment to follow up.
        </p>
      ) : null}
    </div>
  );
}

export function HotelShareManager({
  hotelId,
  hotelName,
  agencyName,
  contactEmail,
  shareUrl,
  createdAt,
  revoked,
  showAdSpend,
  access,
}: {
  hotelId: string;
  hotelName: string;
  agencyName: string;
  contactEmail: string | null;
  /** Full /h/<token> URL, or null if no token has ever been generated. */
  shareUrl: string | null;
  createdAt: string | null; // ISO
  revoked: boolean;
  showAdSpend: boolean;
  access: Access;
}) {
  const [showSend, setShowSend] = useState(false);
  const active = shareUrl != null && !revoked;

  return (
    <div className="space-y-4 p-4">
      {active ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              value={shareUrl}
              onFocusCapture={(e) => e.currentTarget.select()}
              className="w-full flex-1 truncate rounded-lg border border-line-strong bg-card px-3 py-2 text-sm text-ink"
            />
            <CopyButton text={shareUrl} label="Copy link" />
            <button
              type="button"
              onClick={() => setShowSend(true)}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Send to hotel
            </button>
          </div>

          {createdAt && (
            <p className="text-xs text-ink-tertiary">
              Link created {new Date(createdAt).toLocaleDateString()} · works on any
              browser, no login
            </p>
          )}

          <AccessAnalytics access={access} />

          <div className="flex flex-wrap items-center gap-3">
            <details className="text-sm">
              <summary className="cursor-pointer rounded-lg border border-line-strong px-3 py-2 font-medium text-ink-secondary hover:bg-line-strong">
                Regenerate link
              </summary>
              <div className="mt-2 rounded-lg border border-line bg-page p-3">
                <p className="mb-2 text-xs text-ink-tertiary">
                  Use this if the old link was leaked. The current link stops working
                  immediately and a brand-new one is created.
                </p>
                <GenerateButton hotelId={hotelId} cta="Regenerate link" />
              </div>
            </details>
            <form action={revokeHotelShareLink}>
              <input type="hidden" name="hotelId" value={hotelId} />
              <button
                type="submit"
                className="rounded-lg border border-danger/60 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
              >
                Revoke access
              </button>
            </form>
          </div>
        </>
      ) : (
        <div>
          {revoked && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger ring-1 ring-danger/30">
              Access revoked — the previous link no longer works.
            </p>
          )}
          <p className="mb-3 text-sm text-ink-secondary">
            Generate a private, read-only link to this hotel&apos;s dashboard. The
            hotel owner can open it on any phone or computer — no login required —
            and they only ever see this one hotel&apos;s data.
          </p>
          <GenerateButton
            hotelId={hotelId}
            cta={revoked ? "Generate new share link" : "Generate share link for hotel"}
          />
        </div>
      )}

      <div className="border-t border-line pt-4">
        <AdSpendToggle hotelId={hotelId} initialOn={showAdSpend} />
      </div>

      {showSend && shareUrl && (
        <SendModal
          url={shareUrl}
          hotelName={hotelName}
          agencyName={agencyName}
          contactEmail={contactEmail}
          onClose={() => setShowSend(false)}
        />
      )}
    </div>
  );
}
