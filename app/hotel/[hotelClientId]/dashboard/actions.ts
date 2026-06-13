"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant";
import { resolveHotelForViewer } from "@/lib/hotel-auth";
import { validateEmail, validateMobile, validateWhatsapp, validateAddress } from "@/lib/agency-validation";

// Hotel-owner self-edits: contact details, OTA commission rate, channel manager.
// Authorized via resolveHotelForViewer (owner only). Everything else on the
// hotel dashboard is read-only.

const CHANNEL_MANAGERS = new Set(["None", "djubo", "eZee", "STAAH", "RateGain", "Other", "Custom"]);

export type HotelEditState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

export async function updateHotelDetails(
  hotelClientId: string,
  input: {
    contactName: string; contactEmail: string; contactPhone: string;
    whatsappNumber: string; address: string; otaCommissionRate: string; channelManager: string;
  },
): Promise<HotelEditState> {
  const viewer = await resolveHotelForViewer(hotelClientId);
  if (!viewer) return { ok: false, error: "You don't have access to this hotel." };
  if (!viewer.canEdit) return { ok: false, error: "Only the hotel owner can edit these details." };

  const fieldErrors: Record<string, string> = {};
  const contactName = input.contactName.trim();
  if (contactName.length < 2) fieldErrors.contactName = "Enter the contact name.";
  const contactEmail = input.contactEmail.trim();
  if (!validateEmail(contactEmail)) fieldErrors.contactEmail = "Enter a valid email.";
  const contactPhone = validateMobile(input.contactPhone);
  if (!contactPhone) fieldErrors.contactPhone = "Enter a valid mobile number.";
  const whatsappNumber = validateWhatsapp(input.whatsappNumber);
  if (!whatsappNumber) fieldErrors.whatsappNumber = "Enter a valid WhatsApp number.";
  const address = input.address.trim();
  if (!validateAddress(address)) fieldErrors.address = "Enter an address (10–500 characters).";
  let otaRate = Number.parseFloat(input.otaCommissionRate);
  if (!Number.isFinite(otaRate)) otaRate = 18;
  otaRate = Math.min(50, Math.max(0, otaRate));
  const channelManager = CHANNEL_MANAGERS.has(input.channelManager) ? input.channelManager : "None";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };

  await agencyScopedFor(viewer.hotel.agencyId, prisma.hotelClient).update({
    where: { id: hotelClientId },
    data: { contactName, contactEmail, contactPhone, whatsappNumber, address, otaCommissionRate: otaRate.toFixed(2), channelManager },
  });

  revalidatePath(`/hotel/${hotelClientId}/dashboard`);
  return { ok: true };
}
