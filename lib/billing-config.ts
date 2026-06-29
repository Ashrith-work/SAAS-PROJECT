// ─────────────────────────────────────────────────────────────────────────────
// Billing kill-switch (free beta).
//
// HotelTrack normally bills agencies monthly via Razorpay (see lib/razorpay*.ts)
// and gates the dashboard behind a live `active` subscription. During the beta we
// make the whole product FREE for every signed-in user by turning this flag OFF.
//
//   BILLING_ENABLED = false (default)  → free beta. No paywall, no plan selection,
//                                         no Razorpay checkout. Every authenticated
//                                         agency gets full, highest-tier access and
//                                         unlimited hotels/members + GA4.
//   BILLING_ENABLED = true             → the original paywall is restored. The
//                                         dashboard again requires an `active`
//                                         Razorpay subscription and plan-tier limits
//                                         apply.
//
// NOTHING about billing is deleted: the Razorpay integration, subscription models,
// plan tiers, webhook and cron handlers all stay intact. They are simply bypassed
// while the flag is off, and re-engage the moment it is flipped back on.
//
// The check lives in ONE place so the beta can be ended by setting a single env
// var (BILLING_ENABLED=true) with no code changes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether subscription billing + paywall enforcement is active. Defaults to
 * OFF (free beta). Set the env var BILLING_ENABLED=true to re-enable billing.
 */
export const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";
