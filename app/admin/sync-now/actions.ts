"use server";

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPlatformRole } from "@/lib/auth";
import { syncHotelAds } from "@/lib/meta-sync";

export type SyncNowState = {
  error: string | null;
  ok: boolean;
  message: string | null;
};

/** Constant-time password check (length leak only — acceptable for this gate). */
function passwordMatches(supplied: string, configured: string): boolean {
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(configured, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Manually syncs one hotel's Meta Ads data. Double-gated: the proxy + admin
 * layout already restrict /admin to super_admin, and this action additionally
 * requires ADMIN_PASSWORD (server actions are reachable POST endpoints, so the
 * role is re-verified here too — defense in depth).
 */
export async function adminSyncNow(
  _prev: SyncNowState,
  formData: FormData,
): Promise<SyncNowState> {
  const role = await getPlatformRole();
  if (role !== "super_admin") {
    return { error: "Not authorized.", ok: false, message: null };
  }

  const configured = process.env.ADMIN_PASSWORD ?? "";
  if (!configured) {
    return {
      error: "ADMIN_PASSWORD is not configured on the server — add it to the environment first.",
      ok: false,
      message: null,
    };
  }
  const supplied = ((formData.get("password") as string | null) ?? "").trim();
  if (!passwordMatches(supplied, configured)) {
    return { error: "Wrong admin password.", ok: false, message: null };
  }

  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  if (!hotelId) return { error: "Pick a hotel.", ok: false, message: null };

  const daysRaw = Number(formData.get("days"));
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 1), 90) : 7;

  const res = await syncHotelAds(hotelId, days);
  if (!res.ok) {
    return {
      error: `${res.hotelName ? `${res.hotelName}: ` : ""}${res.error}`,
      ok: false,
      message: null,
    };
  }

  revalidatePath("/admin/sync-now");
  return {
    error: null,
    ok: true,
    message: `${res.hotelName}: wrote ${res.snapshotsWritten} daily snapshot${res.snapshotsWritten === 1 ? "" : "s"} for ${res.range!.since} → ${res.range!.until}.`,
  };
}
