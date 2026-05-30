"use server";

import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";

/**
 * Records a Report metadata row after a PDF is generated client-side. The Excel
 * route records its own row server-side. Scoped to the agency; verifies the
 * hotel belongs to it.
 */
export async function recordReport(
  hotelId: string,
  from: string,
  to: string,
): Promise<{ ok: boolean }> {
  const member = await getCurrentMember();
  if (!member) return { ok: false };

  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelId },
    select: { id: true },
  });
  if (!hotel) return { ok: false };

  await agencyScoped(prisma.report).create({
    data: {
      agencyId: member.agencyId,
      hotelClientId: hotel.id,
      dateRangeStart: new Date(`${from}T00:00:00.000Z`),
      dateRangeEnd: new Date(`${to}T23:59:59.999Z`),
    },
  });
  return { ok: true };
}
