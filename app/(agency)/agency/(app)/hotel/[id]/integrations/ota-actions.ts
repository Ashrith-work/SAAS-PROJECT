"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { parseOtaRate } from "@/lib/savings";

export type OtaRateState = { error: string | null; ok: boolean };

/**
 * Saves a hotel's average OTA commission rate (0–50%). Used to calculate how much
 * direct snippet-tracked bookings saved vs going through an OTA. Multi-tenant: the
 * hotel is verified against the caller's agency.
 */
export async function saveOtaRate(_prev: OtaRateState, formData: FormData): Promise<OtaRateState> {
  const member = await getCurrentMember();
  if (!member) return { error: "Your session has expired — please sign in again.", ok: false };

  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const rate = parseOtaRate((formData.get("otaCommissionRate") as string | null) ?? "");
  if (rate === null) {
    return { error: "Enter a commission rate between 0 and 50%.", ok: false };
  }

  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelId },
    select: { id: true },
  });
  if (!hotel) return { error: "That hotel client wasn't found for your agency.", ok: false };

  await agencyScoped(prisma.hotelClient).update({
    where: { id: hotel.id },
    data: { otaCommissionRate: rate },
  });
  revalidatePath(`/agency/hotel/${hotelId}/integrations`);
  revalidatePath(`/agency/hotel/${hotelId}`);
  return { error: null, ok: true };
}
