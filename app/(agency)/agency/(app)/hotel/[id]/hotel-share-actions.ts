"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { generateShareToken } from "@/lib/hotel-share";

// Server actions for the hotel-owner share link (the public /h/<shareToken>
// dashboard). Every action is multi-tenant: the hotel is mutated through the
// agency-scoped delegate, so an agency can only ever touch its OWN hotels — a
// spoofed hotelId from another agency matches no row and silently no-ops.

export type HotelShareState = { error: string | null; ok: boolean };
const ok: HotelShareState = { error: null, ok: true };

async function ownHotelId(hotelId: string): Promise<string | null> {
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelId },
    select: { id: true },
  });
  return hotel?.id ?? null;
}

/**
 * Generates (or REGENERATES) the hotel's share token. Regenerating overwrites
 * the old token, so any previously-shared URL immediately stops resolving. Also
 * clears the revoked flag so the fresh link works. Idempotent per click.
 */
export async function generateHotelShareLink(
  _prev: HotelShareState,
  formData: FormData,
): Promise<HotelShareState> {
  const member = await getCurrentMember();
  if (!member) return { error: "Your session has expired — please sign in again.", ok: false };

  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const id = await ownHotelId(hotelId);
  if (!id) return { error: "That hotel wasn't found for your agency.", ok: false };

  await agencyScoped(prisma.hotelClient).updateMany({
    where: { id },
    data: {
      shareToken: generateShareToken(),
      shareTokenCreatedAt: new Date(),
      shareTokenRevoked: false,
    },
  });

  revalidatePath(`/agency/hotel/${id}`);
  return ok;
}

/**
 * Revokes the current share link (shareTokenRevoked = true). The token is kept
 * so the agency can still see it was issued, but /h/<token> now 404s. A later
 * "regenerate" mints a brand-new token and clears the flag.
 */
export async function revokeHotelShareLink(formData: FormData): Promise<void> {
  const member = await getCurrentMember();
  if (!member) return;

  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const id = await ownHotelId(hotelId);
  if (!id) return;

  await agencyScoped(prisma.hotelClient).updateMany({
    where: { id },
    data: { shareTokenRevoked: true },
  });
  revalidatePath(`/agency/hotel/${id}`);
}

/**
 * Toggles whether ad-spend figures (spend, True ROAS, per-channel spend) are
 * revealed on the hotel's public dashboard. Default OFF.
 */
export async function setShowAdSpendToHotel(formData: FormData): Promise<void> {
  const member = await getCurrentMember();
  if (!member) return;

  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const show = formData.get("show") === "on";
  const id = await ownHotelId(hotelId);
  if (!id) return;

  await agencyScoped(prisma.hotelClient).updateMany({
    where: { id },
    data: { showAdSpendToHotel: show },
  });
  revalidatePath(`/agency/hotel/${id}`);
}
