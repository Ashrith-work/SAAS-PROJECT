// Shared logic for the agency contact-info feature (Two-stage rollout):
//   • New signups (created AFTER the feature deployed) are REQUIRED to fill the
//     five contact fields — enforced by a gate in the agency app layout that
//     bounces them to the contact step until `mobile` is set.
//   • Existing agencies (created BEFORE the deploy date) are never blocked; they
//     get a dismissible nudge banner until all five fields are filled.
//
// `mobile` is the sentinel for "has this agency completed the contact step?"
// (the signup form requires all five together, so mobile-set ⇒ all set for new
// agencies). The banner uses the stricter "any field missing" check.

/**
 * When this feature went live. Agencies created strictly after this are routed
 * through the required signup step; agencies created on/before it are existing
 * accounts that only see the non-blocking banner. Bump to the real go-live
 * instant if the deploy date moves.
 */
export const FEATURE_DEPLOYED_AT = new Date("2026-06-13T00:00:00.000Z");

/** The five contact fields, as stored on Agency (all nullable in the DB). */
export type AgencyContact = {
  mobile: string | null;
  contactEmail: string | null;
  address: string | null;
  websiteUrl: string | null;
  whatsappNumber: string | null;
};

const FIELDS: (keyof AgencyContact)[] = [
  "mobile",
  "contactEmail",
  "address",
  "websiteUrl",
  "whatsappNumber",
];

/** True when at least one of the five fields is still missing. */
export function isContactInfoMissing(a: AgencyContact): boolean {
  return FIELDS.some((f) => !a[f]);
}

/** True when all five fields are filled. */
export function isContactInfoComplete(a: AgencyContact): boolean {
  return !isContactInfoMissing(a);
}

/** True when NONE of the five fields are filled (the empty-state fallback). */
export function isContactInfoEmpty(a: AgencyContact): boolean {
  return FIELDS.every((f) => !a[f]);
}

/**
 * New-signup gate: a post-deploy agency that hasn't completed the contact step
 * yet (mobile still null). These must be sent to the contact step before the
 * dashboard. Pre-deploy agencies are never forced.
 */
export function mustCompleteContactInfo(a: AgencyContact & { createdAt: Date }): boolean {
  return a.createdAt > FEATURE_DEPLOYED_AT && a.mobile == null;
}

/**
 * Show the non-blocking banner: an EXISTING (pre-deploy) agency that is still
 * missing any contact field. New agencies don't see it (their signup forced the
 * info), and it disappears once everything is filled.
 */
export function shouldShowContactBanner(a: AgencyContact & { createdAt: Date }): boolean {
  return a.createdAt <= FEATURE_DEPLOYED_AT && isContactInfoMissing(a);
}
