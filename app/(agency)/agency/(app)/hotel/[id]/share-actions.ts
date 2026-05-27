"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashSharePassword, shareExpiry } from "@/lib/share";

export type ShareState = { error: string | null; ok: boolean };

/**
 * Creates a fresh public share link for one of the agency's hotels. Any existing
 * active link for that hotel is revoked first, so there's always at most one live
 * link. Optional password is stored only as a scrypt hash. Multi-tenant: the
 * hotel is verified to belong to the caller's agency.
 */
export async function createShareLink(
  _prev: ShareState,
  formData: FormData,
): Promise<ShareState> {
  const member = await getCurrentMember();
  if (!member) return { error: "Your session has expired — please sign in again.", ok: false };

  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";

  const hotel = await prisma.hotelClient.findFirst({
    where: { id: hotelId, agencyId: member.agencyId },
    select: { id: true },
  });
  if (!hotel) return { error: "That hotel wasn't found for your agency.", ok: false };

  // Revoke any currently-active link so the old URL stops working.
  await prisma.shareLink.updateMany({
    where: { agencyId: member.agencyId, hotelClientId: hotel.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.shareLink.create({
    data: {
      agencyId: member.agencyId,
      hotelClientId: hotel.id,
      passwordHash: hashSharePassword(password),
      expiresAt: shareExpiry(),
    },
  });

  revalidatePath(`/agency/hotel/${hotel.id}`);
  return { error: null, ok: true };
}

/**
 * Revokes a share link immediately. Scoped by agencyId so an agency can only
 * revoke its own links.
 */
export async function revokeShareLink(formData: FormData): Promise<void> {
  const member = await getCurrentMember();
  if (!member) return;

  const linkId = ((formData.get("linkId") as string | null) ?? "").trim();
  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  if (!linkId) return;

  await prisma.shareLink.updateMany({
    where: { id: linkId, agencyId: member.agencyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (hotelId) revalidatePath(`/agency/hotel/${hotelId}`);
}
