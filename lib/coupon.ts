// Coupon-code helpers (Phase R2) — pure, no DB, no "server-only", so the snippet
// ingestion, the admin actions, and the tests share one definition of "what's a
// valid, redeemable code".

export const COUPON_CODE_MAX = 50;
export const COUPON_STATUSES = ["ACTIVE", "EXPIRED", "DISABLED"] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];
export const REDEMPTION_SOURCES = ["snippet_auto", "manual_entry"] as const;
export type RedemptionSource = (typeof REDEMPTION_SOURCES)[number];

/** Canonical coupon code: trim, collapse inner whitespace away, UPPERCASE, cap. */
export function normalizeCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().slice(0, COUPON_CODE_MAX);
}

/** A non-empty normalized code, or null. */
export function cleanCode(raw: string | null | undefined): string | null {
  const c = normalizeCode(raw);
  return c.length > 0 ? c : null;
}

export type RedeemableCoupon = {
  status: string;
  validFrom: Date | null;
  validUntil: Date | null;
};

/**
 * Is this code redeemable right now? ACTIVE status AND (if set) within the
 * validFrom..validUntil window. Used by the snippet auto-capture path and the
 * manual-entry path so both agree.
 */
export function isCouponRedeemable(c: RedeemableCoupon, now: Date = new Date()): boolean {
  if (c.status !== "ACTIVE") return false;
  if (c.validFrom && now < c.validFrom) return false;
  if (c.validUntil && now > c.validUntil) return false;
  return true;
}

/** Why a code isn't redeemable (for [COUPON-MISMATCH] logs). null when it is. */
export function couponRejectReason(c: RedeemableCoupon, now: Date = new Date()): string | null {
  if (c.status !== "ACTIVE") return `status=${c.status}`;
  if (c.validFrom && now < c.validFrom) return "not_yet_valid";
  if (c.validUntil && now > c.validUntil) return "expired";
  return null;
}
