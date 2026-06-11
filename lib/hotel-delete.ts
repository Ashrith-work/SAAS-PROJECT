import "server-only";

import { prisma } from "@/lib/prisma";
import { logTokenAudit } from "@/lib/token-audit";

// Soft-delete / restore core for HotelClient. Pure-ish (takes the actor as a
// param, no Clerk/session import) so it's unit-testable against a real DB; the
// thin server actions in app/.../settings/actions.ts resolve the session and
// call these. Storage is NEVER hard-deleted — only deletedAt is toggled.
//
// SECURITY: every check is enforced here, not in the UI. Lookups are scoped by
// agencyId via a RAW query (not the soft-delete-filtering agencyScoped proxy) so
// we can tell "another agency / missing" (NOT_FOUND — no existence leak) apart
// from "already deleted" (ALREADY_DELETED).

export type HotelDeleteErrorCode =
  | "UNAUTHORIZED"
  | "WRONG_NAME"
  | "ALREADY_DELETED"
  | "NOT_FOUND";

export class HotelDeleteError extends Error {
  code: HotelDeleteErrorCode;
  constructor(code: HotelDeleteErrorCode, message?: string) {
    super(message ?? code);
    this.name = "HotelDeleteError";
    this.code = code;
  }
}

/** The acting agency member. role gates admin-only operations. */
export type DeleteActor = {
  agencyId: string;
  memberId: string;
  role: "admin" | "analyst";
};

const MAX_REASON = 500;

/**
 * Soft-deletes a hotel. Verifies: admin role, hotel belongs to the actor's
 * agency, not already deleted, and the typed confirmation matches the name
 * exactly (case-sensitive). Preserves all tokens/data; does NOT revoke any
 * Meta/Google/Instagram tokens (a restored hotel must keep working).
 *
 * To restore, call restoreHotelCore(...) — there is no self-service restore UI;
 * it is admin/CLI-only (see scripts/restore-hotel.ts).
 */
export async function softDeleteHotelCore(
  actor: DeleteActor,
  input: { hotelClientId: string; confirmationName: string; reason?: string | null },
): Promise<{ id: string; name: string }> {
  if (actor.role !== "admin") {
    throw new HotelDeleteError("UNAUTHORIZED", "Only agency admins can delete a hotel.");
  }

  const hotel = await prisma.hotelClient.findFirst({
    where: { id: input.hotelClientId, agencyId: actor.agencyId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!hotel) throw new HotelDeleteError("NOT_FOUND", "Hotel not found.");
  if (hotel.deletedAt) throw new HotelDeleteError("ALREADY_DELETED", "This hotel is already deleted.");
  if (input.confirmationName !== hotel.name) {
    throw new HotelDeleteError("WRONG_NAME", "The typed name does not match the hotel name.");
  }

  await prisma.hotelClient.update({
    where: { id: hotel.id },
    data: {
      deletedAt: new Date(),
      deletedByAgencyMemberId: actor.memberId,
      deletionReason: input.reason ? input.reason.slice(0, MAX_REASON) : null,
    },
  });

  // Audit trail. tokenType "hotel" (no secret involved); the human-readable
  // reason is persisted on the hotel row itself.
  await logTokenAudit({
    agencyId: actor.agencyId,
    hotelClientId: hotel.id,
    tokenType: "hotel",
    action: "hotel_soft_deleted",
    source: "action:softDeleteHotel",
  });

  return { id: hotel.id, name: hotel.name };
}

/**
 * Restores a soft-deleted hotel (admin only). Idempotent: restoring an active
 * hotel is a no-op. Clears deletedAt + deletedByAgencyMemberId.
 */
export async function restoreHotelCore(
  actor: DeleteActor,
  hotelClientId: string,
): Promise<{ id: string; name: string }> {
  if (actor.role !== "admin") {
    throw new HotelDeleteError("UNAUTHORIZED", "Only agency admins can restore a hotel.");
  }

  const hotel = await prisma.hotelClient.findFirst({
    where: { id: hotelClientId, agencyId: actor.agencyId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!hotel) throw new HotelDeleteError("NOT_FOUND", "Hotel not found.");
  if (!hotel.deletedAt) return { id: hotel.id, name: hotel.name }; // already active

  await prisma.hotelClient.update({
    where: { id: hotel.id },
    data: { deletedAt: null, deletedByAgencyMemberId: null },
  });

  await logTokenAudit({
    agencyId: actor.agencyId,
    hotelClientId: hotel.id,
    tokenType: "hotel",
    action: "hotel_restored",
    source: "action:restoreHotel",
  });

  return { id: hotel.id, name: hotel.name };
}
