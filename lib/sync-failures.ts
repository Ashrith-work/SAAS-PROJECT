import "server-only";

import { prisma } from "@/lib/prisma";

// SyncFailure bookkeeping, shared by the ads sync, the Instagram sync and the
// backfill engine (kept separate from lib/backfill.ts to avoid import cycles).
// A SyncFailure is "active" while resolvedAt is null and drives the red
// "data sync failed" notices in the UI.

/** Creates a SyncFailure unless an unresolved one already exists (dedupe). */
export async function recordSyncFailure(
  agencyId: string,
  hotelClientId: string | null,
  tokenType: "meta_ads" | "instagram",
  reason: string,
) {
  const existing = await prisma.syncFailure.findFirst({
    where: { agencyId, hotelClientId, tokenType, resolvedAt: null },
    select: { id: true },
  });
  if (existing) return;
  await prisma.syncFailure.create({
    data: { agencyId, hotelClientId, tokenType, reason },
  });
}

/** Marks every unresolved failure of one type resolved (data flow restored). */
export async function resolveSyncFailures(
  agencyId: string,
  tokenType: "meta_ads" | "instagram",
) {
  await prisma.syncFailure.updateMany({
    where: { agencyId, tokenType, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}
