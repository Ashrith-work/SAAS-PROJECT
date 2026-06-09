"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { encryptWithAudit, logTokenAudit } from "@/lib/token-audit";
import { validateToken } from "@/lib/meta";
import { queueBackfillJob } from "@/lib/backfill";
import { syncHotelAds } from "@/lib/meta-sync";
import { archiveOnAccountChange } from "@/lib/meta-archive";

// A non-expiring Meta token (e.g. a system-user token) reports expires_at = 0.
// The MetaToken.tokenExpiresAt column is non-null, so we store this far-future
// sentinel for those. The UI shows "Does not expire" for dates past ~2900.
const NEVER_EXPIRES = new Date("2999-12-31T00:00:00.000Z");

export type SaveTokenState = {
  error: string | null;
  ok: boolean;
  // Set when reconnecting revealed a data gap and a backfill job was created.
  // The progress banner polls this job; null when there was nothing to backfill.
  backfillJobId?: string | null;
};

/**
 * Validates a pasted Meta access token with Meta, then stores it encrypted
 * (AES-256-GCM) as this agency's MetaToken. One connection per agency: the
 * existing row is updated in place, otherwise a new one is created. We never
 * persist a token that doesn't validate, so `status` is only ever set
 * "connected" for a live token.
 */
export async function saveMetaToken(
  _prev: SaveTokenState,
  formData: FormData,
): Promise<SaveTokenState> {
  const member = await getCurrentMember();
  if (!member) {
    return { error: "Your session has expired — please sign in again.", ok: false };
  }

  const raw = ((formData.get("accessToken") as string | null) ?? "").trim();
  if (!raw) return { error: "Paste your Meta access token.", ok: false };

  const validation = await validateToken(raw);
  if (!validation.valid) {
    return {
      error:
        validation.error ??
        "That token didn't validate with Meta. Check it and try again.",
      ok: false,
    };
  }

  const encryptedToken = await encryptWithAudit(raw, {
    agencyId: member.agencyId,
    tokenType: "meta_ads",
    source: "action:saveMetaToken",
  });
  const tokenExpiresAt = validation.expiresAt ?? NEVER_EXPIRES;

  // Scoped to this agency (multi-tenant). agencyId isn't unique on MetaToken, so
  // find-then-update keeps exactly one connection row per agency.
  const existing = await agencyScoped(prisma.metaToken).findFirst({
    select: { id: true },
  });

  if (existing) {
    await agencyScoped(prisma.metaToken).update({
      where: { id: existing.id },
      data: { encryptedToken, tokenExpiresAt, status: "connected" },
    });
  } else {
    await agencyScoped(prisma.metaToken).create({
      data: {
        agencyId: member.agencyId,
        encryptedToken,
        tokenExpiresAt,
        status: "connected",
      },
    });
  }

  // A first connect imports the trailing 12 months of ads history for every
  // mapped hotel; a reconnect refills the gap left while the token was dead.
  // Either way, queue a backfill job for the missing windows; the
  // BackfillProgress banner picks it up and runs it. Never blocks the save.
  let backfillJobId: string | null = null;
  try {
    backfillJobId = await queueBackfillJob(member.agencyId);
  } catch {
    // A backfill-scheduling hiccup must never fail the connect itself — the
    // next scheduled sync still keeps recent days fresh.
  }

  revalidatePath("/agency/settings");
  return { error: null, ok: true, backfillJobId };
}

/**
 * Removes this agency's Meta connection entirely, deleting the encrypted token
 * at rest. The user reconnects by pasting a fresh token.
 */
export async function disconnectMetaToken(): Promise<void> {
  const member = await getCurrentMember();
  if (!member) return;

  await agencyScoped(prisma.metaToken).deleteMany();
  await logTokenAudit({
    agencyId: member.agencyId,
    tokenType: "meta_ads",
    action: "deleted",
    source: "action:disconnectMetaToken",
  });
  revalidatePath("/agency/settings");
}

export type NotificationState = { error: string | null; ok: boolean };

/**
 * Saves the agency's budget-alert notification settings (email recipient + Slack
 * webhook + the two enable toggles). The Slack webhook is also saved here; the
 * "Test connection" button additionally verifies it via /api/agency/slack/test.
 */
export async function saveNotificationSettings(
  _prev: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  const member = await getCurrentMember();
  if (!member) return { error: "Your session has expired — please sign in again.", ok: false };

  const alertEmailAddress = ((formData.get("alertEmailAddress") as string | null) ?? "").trim() || null;
  const emailAlertsEnabled = formData.get("emailAlertsEnabled") === "on";
  const slackEnabled = formData.get("slackEnabled") === "on";
  const slackWebhookUrl = ((formData.get("slackWebhookUrl") as string | null) ?? "").trim() || null;

  if (alertEmailAddress && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alertEmailAddress)) {
    return { error: "That alert email address doesn't look valid.", ok: false };
  }

  await agencyScoped(prisma.agency).update({
    where: { id: member.agencyId },
    data: { alertEmailAddress, emailAlertsEnabled, slackEnabled, slackWebhookUrl },
  });

  revalidatePath("/agency/settings");
  return { error: null, ok: true };
}

export type MapAccountState = { error: string | null; ok: boolean };

/**
 * Maps a Meta ad account to one of this agency's hotel clients (or clears the
 * mapping when adAccountId is empty). Verifies the hotel belongs to the agency.
 */
export async function mapAdAccount(
  _prev: MapAccountState,
  formData: FormData,
): Promise<MapAccountState> {
  const member = await getCurrentMember();
  if (!member) {
    return { error: "Your session has expired — please sign in again.", ok: false };
  }

  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const adAccountId = ((formData.get("adAccountId") as string | null) ?? "").trim();
  if (!hotelId) return { error: "Missing hotel.", ok: false };

  // Multi-tenant guard: never trust a client-supplied hotel id.
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelId },
    select: { id: true, metaAdAccountId: true, previousAdAccountIds: true },
  });
  if (!hotel) return { error: "That hotel client wasn't found for your agency.", ok: false };

  const newId = adAccountId || null;
  const oldId = hotel.metaAdAccountId;
  const accountChanged = newId !== oldId;
  // A switch between two DIFFERENT real accounts (not first-time mapping, not
  // unmapping, not a same-account re-save) triggers archiving of the old data.
  const switchedAccounts = accountChanged && !!oldId && !!newId;

  let previousAdAccountIds = hotel.previousAdAccountIds;
  if (switchedAccounts) {
    // Archive the old account's rows + restore any prior data for the new one.
    // Best-effort: a hiccup here must not block re-mapping the account.
    try {
      await archiveOnAccountChange({
        agencyId: member.agencyId,
        hotelClientId: hotel.id,
        oldAccountId: oldId!,
        newAccountId: newId!,
      });
    } catch (err) {
      console.error("[META-RECONNECT] archive failed for hotel", hotel.id, err);
    }
    // Record the old account in history (dedup); drop the new one if it was a
    // previous account being reconnected (its data is live again now).
    previousAdAccountIds = [...new Set([...previousAdAccountIds, oldId!])].filter(
      (id) => id !== newId,
    );
  }

  await agencyScoped(prisma.hotelClient).update({
    where: { id: hotel.id },
    data: {
      metaAdAccountId: newId,
      previousAdAccountIds,
      // Stamp the connection time only when the mapped account actually changes
      // to a real account — a same-account re-save must not reset the
      // "sync in progress" fresh-start window.
      ...(newId && accountChanged ? { metaAccountConnectedAt: new Date() } : {}),
    },
  });

  // Mapping an ad account is what makes a hotel syncable. Two-step so its
  // dashboard fills in immediately AND completely:
  //   1. A bounded inline sync of the last 30 days (account + campaign-level +
  //      attribution) so the default dashboard view shows data the moment the
  //      mapping returns — this is what makes selecting the account feel
  //      "automatic". 30 days stays within Meta's campaign-insights window cap.
  //   2. Queue the full 12-month history import (now campaign-aware too) for the
  //      longer date ranges. Both are best-effort and never block the mapping.
  if (adAccountId) {
    try {
      await syncHotelAds(hotel.id, 30);
    } catch {
      // The history backfill + scheduled sync still cover the data if this hiccups.
    }
    try {
      await queueBackfillJob(member.agencyId);
    } catch {
      // The scheduled sync still covers recent days if scheduling hiccups.
    }
  }

  // The mapping is set per hotel on its Integrations page; also refresh the
  // hotel dashboard (where the campaign sections live) and Settings.
  revalidatePath(`/agency/hotel/${hotel.id}/integrations`);
  revalidatePath(`/agency/hotel/${hotel.id}`);
  revalidatePath("/agency/settings");
  return { error: null, ok: true };
}
