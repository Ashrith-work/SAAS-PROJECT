// Which website-tracking mechanism the agency is using.
//
//   "hoteltrack"  — install our /t.js snippet on the hotel site (writes
//                   TrackingEvent rows used by every per-content / per-hotel
//                   attribution dashboard)
//   "pixel"       — agency relies on Facebook Pixel only; HotelTrack receives
//                   no website events, so the attribution-dependent UI hides
//                   itself (and the snippet-install section is replaced with
//                   FB Pixel install instructions).
//
// Set via NEXT_PUBLIC_TRACKING_MODE. Defaults to "hoteltrack". The NEXT_PUBLIC_
// prefix matters: client components also need to read this (e.g. to gate
// columns in a table), and Next.js only inlines NEXT_PUBLIC_* into client code.

export type TrackingMode = "hoteltrack" | "pixel";

export function getTrackingMode(): TrackingMode {
  return process.env.NEXT_PUBLIC_TRACKING_MODE === "pixel" ? "pixel" : "hoteltrack";
}

export function isPixelMode(): boolean {
  return getTrackingMode() === "pixel";
}
