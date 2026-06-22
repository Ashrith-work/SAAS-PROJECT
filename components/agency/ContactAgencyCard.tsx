"use client";

import { useState } from "react";
import Link from "next/link";
import { whatsappDigits } from "@/lib/agency-validation";
import type { AgencyContact } from "@/lib/agency-contact";

// "Contact Agency" card at the bottom of every hotel dashboard (and the public
// share-link view). Collapsed by default; expands to reveal the agency's contact
// details as tappable links (tel: / wa.me / mailto: / new-tab website / maps).
// Each missing field's row is simply hidden. Multi-tenant note: the PARENT passes
// the agency that OWNS the hotel being viewed — so a hotel owner sees the agency
// that manages them, never the viewer's own agency.

function Row({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span aria-hidden className="mt-0.5 text-lg leading-none">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</p>
        <div className="mt-0.5 break-words text-sm text-ink">{children}</div>
      </div>
    </li>
  );
}

const linkCls = "text-brand hover:underline";

export function ContactAgencyCard({
  agencyName,
  contact,
  canEdit,
  settingsHref = "/agency/settings",
  viewerIsAgency,
}: {
  agencyName: string;
  contact: AgencyContact;
  /** True only for an agency ADMIN — gates the "Edit / Configure" affordance. */
  canEdit: boolean;
  settingsHref?: string;
  /** True for in-app agency members; false for a hotel owner on a share link. */
  viewerIsAgency: boolean;
}) {
  const [open, setOpen] = useState(false);

  const hasAny =
    !!contact.mobile ||
    !!contact.whatsappNumber ||
    !!contact.contactEmail ||
    !!contact.websiteUrl ||
    !!contact.address;

  // ── Empty state (no fields filled) — shouldn't happen for new signups ──
  if (!hasAny) {
    return (
      <section className="rounded-card border border-line bg-card p-5">
        <h2 className="font-medium text-ink">Contact info not yet added</h2>
        {viewerIsAgency ? (
          <>
            <p className="mt-1 text-sm text-ink-tertiary">
              Hotel owners can&apos;t see how to reach {agencyName} yet.
            </p>
            {canEdit && (
              <Link
                href={settingsHref}
                className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
              >
                Configure
              </Link>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-tertiary">
            Your agency hasn&apos;t set up contact info yet. Please ask your agency to add it.
          </p>
        )}
      </section>
    );
  }

  const mapsHref = contact.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`
    : null;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-card">
      {/* Collapsed header (always visible) */}
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-medium text-ink">Need to reach your agency?</h2>
          <p className="mt-0.5 text-sm text-ink-tertiary">{agencyName} is here to help</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          {open ? "Hide contact details" : "Contact Agency"}
        </button>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="border-t border-line px-5 pb-4 pt-1">
          <ul className="divide-y divide-line">
            {contact.mobile && (
              <Row icon="📱" label="Mobile">
                <a href={`tel:${contact.mobile}`} className={linkCls}>
                  {contact.mobile}
                </a>
              </Row>
            )}
            {contact.whatsappNumber && (
              <Row icon="💬" label="WhatsApp">
                <a
                  href={`https://wa.me/${whatsappDigits(contact.whatsappNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkCls}
                >
                  {contact.whatsappNumber}
                </a>
              </Row>
            )}
            {contact.contactEmail && (
              <Row icon="✉️" label="Email">
                <a href={`mailto:${contact.contactEmail}`} className={linkCls}>
                  {contact.contactEmail}
                </a>
              </Row>
            )}
            {contact.websiteUrl && (
              <Row icon="🌐" label="Website">
                <a
                  href={contact.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkCls}
                >
                  {contact.websiteUrl}
                </a>
              </Row>
            )}
            {contact.address && (
              <Row icon="📍" label="Address">
                <span className="whitespace-pre-line">{contact.address}</span>
                {mapsHref && (
                  <>
                    {" "}
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${linkCls} whitespace-nowrap text-xs`}
                    >
                      Get directions →
                    </a>
                  </>
                )}
              </Row>
            )}
          </ul>

          {canEdit && (
            <div className="mt-2 border-t border-line pt-3">
              <Link href={settingsHref} className="text-xs text-ink-tertiary hover:text-ink hover:underline">
                Edit contact info
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
