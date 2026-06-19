// The request header the public share-link dashboard uses to carry its 256-bit
// hotel share token to the /api/hotel/[hotelClientId]/* read routes. Lives in its
// OWN module (no "server-only") so both the client fetch components and the
// server-side auth helper can import the same constant.
//
// A header (not a query param) keeps the token out of access logs, the Referer
// header, and browser history for the XHR requests.
export const SHARE_TOKEN_HEADER = "x-ht-share-token";

/** A well-formed share token is 64 lowercase hex chars (32 bytes). */
export function isShareTokenShape(token: string | null | undefined): boolean {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}
