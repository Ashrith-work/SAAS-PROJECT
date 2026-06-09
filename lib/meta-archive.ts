import "server-only";

import { prisma } from "@/lib/prisma";
import { agencyScopedFor } from "@/lib/tenant-scope";

// ─────────────────────────────────────────────────────────────────────────────
// Ad-account-change archiving.
//
// When an agency re-maps a hotel to a DIFFERENT Meta ad account, the previous
// account's ad data must stop mixing into the dashboard — but it's archived, not
// deleted, so it stays recoverable. These helpers archive/restore/delete rows
// across the three ad tables (AdSnapshot, AdCampaignSnapshot, CampaignPerformance)
// for a given (hotel, ad account). Every query is agency-scoped (multi-tenant).
// ─────────────────────────────────────────────────────────────────────────────

export type ArchiveReason = "account_changed" | "manual";

const ARCHIVE = (reason: ArchiveReason, at: Date) => ({
  archived: true,
  archivedAt: at,
  archivedReason: reason,
});
const RESTORE = { archived: false, archivedAt: null, archivedReason: null };

/**
 * Called when a hotel is re-mapped from `oldAccountId` to a DIFFERENT
 * `newAccountId`. Archives the old account's still-active rows and restores any
 * rows previously archived for the new account (so reconnecting a prior account
 * brings its history back instead of stranding it). Returns the number of
 * AdSnapshot rows archived (for logging). Idempotent.
 */
export async function archiveOnAccountChange(args: {
  agencyId: string;
  hotelClientId: string;
  oldAccountId: string;
  newAccountId: string;
  reason?: ArchiveReason;
}): Promise<number> {
  const { agencyId, hotelClientId, oldAccountId, newAccountId, reason = "account_changed" } = args;
  const scoped = <D>(m: D) => agencyScopedFor(agencyId, m);
  const archive = ARCHIVE(reason, new Date());

  // Archive EVERY active row that isn't the new account's — not just the prior
  // mapping's. This self-heals hotels whose stored data's account drifted from
  // their mapping (e.g. an account switched before this feature existed), so the
  // new account always starts on a clean dashboard.
  const oldWhere = { hotelClientId, metaAccountId: { not: newAccountId }, archived: false };
  const newWhere = { hotelClientId, metaAccountId: newAccountId, archived: true };

  const [adArch, campArch, perfArch] = await prisma.$transaction([
    // Archive the OLD account's active rows.
    scoped(prisma.adSnapshot).updateMany({ where: oldWhere, data: archive }),
    scoped(prisma.adCampaignSnapshot).updateMany({ where: oldWhere, data: archive }),
    scoped(prisma.campaignPerformance).updateMany({ where: oldWhere, data: archive }),
    // Restore the NEW account's previously-archived rows (reconnect-a-prior-account).
    scoped(prisma.adSnapshot).updateMany({ where: newWhere, data: RESTORE }),
    scoped(prisma.adCampaignSnapshot).updateMany({ where: newWhere, data: RESTORE }),
    scoped(prisma.campaignPerformance).updateMany({ where: newWhere, data: RESTORE }),
  ]);

  console.log(
    "[META-RECONNECT] Ad account changed from",
    oldAccountId,
    "to",
    newAccountId,
    "archiving",
    adArch.count,
    "old AdSnapshot rows (+",
    campArch.count,
    "campaign-day,",
    perfArch.count,
    "attribution rows)",
  );
  return adArch.count;
}

/**
 * Un-archives every row for one ad account on a hotel (the "Restore data from
 * this account" button). Agency-scoped.
 */
export async function restoreArchivedAccount(
  agencyId: string,
  hotelClientId: string,
  accountId: string,
): Promise<number> {
  const scoped = <D>(m: D) => agencyScopedFor(agencyId, m);
  const where = { hotelClientId, metaAccountId: accountId, archived: true };
  const [ad] = await prisma.$transaction([
    scoped(prisma.adSnapshot).updateMany({ where, data: RESTORE }),
    scoped(prisma.adCampaignSnapshot).updateMany({ where, data: RESTORE }),
    scoped(prisma.campaignPerformance).updateMany({ where, data: RESTORE }),
  ]);
  console.log("[META-RECONNECT] Restored", ad.count, "AdSnapshot rows for account", accountId, "on hotel", hotelClientId);
  return ad.count;
}

/**
 * Hard-deletes every ARCHIVED row for one ad account on a hotel (the
 * "Permanently delete archived data" button — irreversible). Agency-scoped.
 * Only ever touches archived rows, so it can never remove live data.
 */
export async function deleteArchivedAccount(
  agencyId: string,
  hotelClientId: string,
  accountId: string,
): Promise<number> {
  const scoped = <D>(m: D) => agencyScopedFor(agencyId, m);
  const where = { hotelClientId, metaAccountId: accountId, archived: true };
  const [ad] = await prisma.$transaction([
    scoped(prisma.adSnapshot).deleteMany({ where }),
    scoped(prisma.adCampaignSnapshot).deleteMany({ where }),
    scoped(prisma.campaignPerformance).deleteMany({ where }),
  ]);
  console.log("[META-RECONNECT] Permanently deleted", ad.count, "archived AdSnapshot rows for account", accountId, "on hotel", hotelClientId);
  return ad.count;
}

export type ArchivedAccountSummary = {
  accountId: string;
  rows: number;
  firstDate: string | null;
  lastDate: string | null;
  totalSpend: number;
};

/**
 * Per-account rollup of a hotel's ARCHIVED AdSnapshot data, for the Connection
 * History section: how many days, the date range, and total archived spend.
 */
export async function archivedAccountSummaries(
  agencyId: string,
  hotelClientId: string,
  accountIds: string[],
): Promise<ArchivedAccountSummary[]> {
  if (accountIds.length === 0) return [];
  const grouped = await agencyScopedFor(agencyId, prisma.adSnapshot).groupBy({
    by: ["metaAccountId"],
    where: { hotelClientId, archived: true, metaAccountId: { in: accountIds } },
    _count: { _all: true },
    _min: { date: true },
    _max: { date: true },
    _sum: { spend: true },
  });
  const byId = new Map(
    grouped.map((g: {
      metaAccountId: string;
      _count: { _all: number };
      _min: { date: Date | null };
      _max: { date: Date | null };
      _sum: { spend: import("@prisma/client").Prisma.Decimal | null };
    }) => [g.metaAccountId, g]),
  );
  const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
  return accountIds.map((accountId) => {
    const g = byId.get(accountId);
    return {
      accountId,
      rows: g?._count._all ?? 0,
      firstDate: ymd(g?._min.date),
      lastDate: ymd(g?._max.date),
      totalSpend: g ? Number(g._sum.spend ?? 0) : 0,
    };
  });
}
