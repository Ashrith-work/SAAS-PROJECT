import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAgencyId, requireSuperAdmin } from "@/lib/tenant";

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — Row-Level Security request context (see MULTITENANCY.md).
//
// RLS policies (migration 20260530100000_enable_rls) gate every row on the
// per-transaction GUC `app.current_agency_id` (or the super-admin bypass GUC
// `app.bypass_rls`). Those GUCs must be set INSIDE the same transaction as the
// query — Postgres `SET LOCAL` / set_config(..., is_local => true) is scoped to
// the current transaction and auto-resets on commit/rollback.
//
// These helpers open such a transaction. They are a NO-OP in effect under the
// current table-owner connection (owners bypass RLS), and become enforcing once
// the app connects as the non-owner `hoteltrack_app` role.
// ─────────────────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

/** Set the tenant GUC on an EXISTING interactive transaction. */
export async function setAgencyContextOnTx(tx: Tx, agencyId: string): Promise<void> {
  // Parameterised via tagged template — never interpolate the id into SQL text.
  await tx.$executeRaw`SELECT set_config('app.current_agency_id', ${agencyId}, true)`;
}

/** Set the super-admin bypass GUC on an EXISTING interactive transaction. */
export async function setSuperAdminContextOnTx(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
}

/**
 * Run `fn` in a transaction scoped to `agencyId` via RLS. Use when you already
 * hold the agencyId (cron jobs processing a specific agency, the tracking
 * ingest endpoint after resolving the hotel's agency from its siteId, the
 * public /share path after resolving it from the token).
 */
export async function withAgencyContext<T>(
  agencyId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setAgencyContextOnTx(tx, agencyId);
    return fn(tx);
  });
}

/**
 * Run `fn` in a transaction scoped to the Clerk-session agency via RLS.
 * Rejects super-admin callers (via requireAgencyId). The request-level wrapper
 * for authenticated pages / actions / routes.
 */
export async function withRequestAgencyContext<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const agencyId = await requireAgencyId();
  return withAgencyContext(agencyId, fn);
}

/**
 * Run `fn` in a transaction with the RLS bypass enabled — for the super-admin
 * (cross-agency) surface only. Gated by requireSuperAdmin().
 */
export async function withSuperAdminContext<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  await requireSuperAdmin();
  return prisma.$transaction(async (tx) => {
    await setSuperAdminContextOnTx(tx);
    return fn(tx);
  });
}
