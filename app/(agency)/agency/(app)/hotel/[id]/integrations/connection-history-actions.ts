"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { restoreArchivedAccount, deleteArchivedAccount } from "@/lib/meta-archive";

// Connection History actions on a hotel's Integrations page: recover or purge
// the archived data from a previously-connected Meta ad account. Multi-tenant:
// the hotel is verified against the caller's agency before anything mutates.

async function ownHotel(hotelId: string): Promise<{ id: string; previousAdAccountIds: string[] } | null> {
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelId },
    select: { id: true, previousAdAccountIds: true },
  });
  return hotel ?? null;
}

/**
 * Un-archives all rows for a previously-connected ad account, making its data
 * visible on the dashboard again. The account stays in the connection history.
 */
export async function restorePreviousAccount(formData: FormData): Promise<void> {
  const member = await getCurrentMember();
  if (!member) return;
  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const accountId = ((formData.get("accountId") as string | null) ?? "").trim();
  if (!accountId) return;
  const hotel = await ownHotel(hotelId);
  if (!hotel) return;

  await restoreArchivedAccount(member.agencyId, hotel.id, accountId);
  revalidatePath(`/agency/hotel/${hotel.id}/integrations`);
  revalidatePath(`/agency/hotel/${hotel.id}`);
}

/**
 * Permanently hard-deletes the archived data for a previously-connected ad
 * account and drops it from the connection history. Irreversible — the UI
 * guards this behind a confirm dialog.
 */
export async function deletePreviousAccount(formData: FormData): Promise<void> {
  const member = await getCurrentMember();
  if (!member) return;
  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const accountId = ((formData.get("accountId") as string | null) ?? "").trim();
  if (!accountId) return;
  const hotel = await ownHotel(hotelId);
  if (!hotel) return;

  await deleteArchivedAccount(member.agencyId, hotel.id, accountId);
  await agencyScoped(prisma.hotelClient).update({
    where: { id: hotel.id },
    data: { previousAdAccountIds: hotel.previousAdAccountIds.filter((id) => id !== accountId) },
  });
  revalidatePath(`/agency/hotel/${hotel.id}/integrations`);
  revalidatePath(`/agency/hotel/${hotel.id}`);
}
