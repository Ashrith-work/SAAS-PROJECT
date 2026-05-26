"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/encryption";
import { validateToken } from "@/lib/meta";

// A non-expiring Meta token (e.g. a system-user token) reports expires_at = 0.
// The MetaToken.tokenExpiresAt column is non-null, so we store this far-future
// sentinel for those. The UI shows "Does not expire" for dates past ~2900.
const NEVER_EXPIRES = new Date("2999-12-31T00:00:00.000Z");

export type SaveTokenState = { error: string | null; ok: boolean };

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

  const encryptedToken = encryptToken(raw);
  const tokenExpiresAt = validation.expiresAt ?? NEVER_EXPIRES;

  // Scoped to this agency (multi-tenant). agencyId isn't unique on MetaToken, so
  // find-then-update keeps exactly one connection row per agency.
  const existing = await prisma.metaToken.findFirst({
    where: { agencyId: member.agencyId },
    select: { id: true },
  });

  if (existing) {
    await prisma.metaToken.update({
      where: { id: existing.id },
      data: { encryptedToken, tokenExpiresAt, status: "connected" },
    });
  } else {
    await prisma.metaToken.create({
      data: {
        agencyId: member.agencyId,
        encryptedToken,
        tokenExpiresAt,
        status: "connected",
      },
    });
  }

  revalidatePath("/agency/settings");
  return { error: null, ok: true };
}

/**
 * Removes this agency's Meta connection entirely, deleting the encrypted token
 * at rest. The user reconnects by pasting a fresh token.
 */
export async function disconnectMetaToken(): Promise<void> {
  const member = await getCurrentMember();
  if (!member) return;

  await prisma.metaToken.deleteMany({ where: { agencyId: member.agencyId } });
  revalidatePath("/agency/settings");
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
  const hotel = await prisma.hotelClient.findFirst({
    where: { id: hotelId, agencyId: member.agencyId },
    select: { id: true },
  });
  if (!hotel) return { error: "That hotel client wasn't found for your agency.", ok: false };

  await prisma.hotelClient.update({
    where: { id: hotel.id },
    data: { metaAdAccountId: adAccountId || null },
  });

  revalidatePath("/agency/settings");
  return { error: null, ok: true };
}
