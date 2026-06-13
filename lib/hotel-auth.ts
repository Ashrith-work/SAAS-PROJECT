import "server-only";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Authorization for the hotel-owner dashboard (/hotel/[hotelClientId]). A user may
// view a hotel only if they are its creator (hotel_client whose Clerk id matches
// HotelClient.createdByUserId) OR an agency member of the agency that owns it.
// Edits are limited to the owner. Returns null when not allowed (route → 404).

export type HotelViewerHotel = {
  id: string;
  agencyId: string;
  name: string;
  websiteUrl: string;
  siteId: string;
  snippetStatus: string;
  lastSyncedAt: Date | null;
  showAdSpendToHotel: boolean;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  address: string | null;
  whatsappNumber: string | null;
  roomCount: number | null;
  channelManager: string | null;
  otaCommissionRate: { toString(): string } | null;
  agency: {
    name: string;
    mobile: string | null;
    contactEmail: string | null;
    address: string | null;
    websiteUrl: string | null;
    whatsappNumber: string | null;
    suspendedAt: Date | null;
  };
};

export type HotelViewer = { hotel: HotelViewerHotel; userId: string; isOwner: boolean; canEdit: boolean };

export async function resolveHotelForViewer(hotelClientId: string): Promise<HotelViewer | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const hotel = await prisma.hotelClient.findFirst({
    where: { id: hotelClientId, deletedAt: null },
    select: {
      id: true, agencyId: true, name: true, websiteUrl: true, siteId: true, snippetStatus: true,
      lastSyncedAt: true, showAdSpendToHotel: true, createdByUserId: true,
      contactName: true, contactEmail: true, contactPhone: true, address: true,
      whatsappNumber: true, roomCount: true, channelManager: true, otaCommissionRate: true,
      agency: {
        select: { name: true, mobile: true, contactEmail: true, address: true, websiteUrl: true, whatsappNumber: true, suspendedAt: true },
      },
    },
  });
  if (!hotel || hotel.agency.suspendedAt) return null;

  const isOwner = hotel.createdByUserId === userId;
  let allowed = isOwner;
  if (!allowed) {
    const member = await prisma.agencyMember.findUnique({ where: { clerkId: userId }, select: { agencyId: true } });
    allowed = member?.agencyId === hotel.agencyId;
  }
  if (!allowed) return null;

  return { hotel: hotel as unknown as HotelViewerHotel, userId, isOwner, canEdit: isOwner };
}
