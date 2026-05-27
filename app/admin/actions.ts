"use server";

import { revalidatePath } from "next/cache";
import { getPlatformRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Suspends or reactivates an agency. Super-admin only — re-checks the platform
 * role server-side (never trusts that the proxy ran). This is the admin panel's
 * only write; everything else there is read-only.
 *
 * Suspension is independent of Stripe billing: it sets/clears Agency.suspendedAt,
 * which the agency layout checks to block dashboard access.
 */
export async function setAgencySuspended(formData: FormData): Promise<void> {
  const role = await getPlatformRole();
  if (role !== "super_admin") return;

  const agencyId = ((formData.get("agencyId") as string | null) ?? "").trim();
  const suspend = formData.get("suspend") === "1";
  if (!agencyId) return;

  await prisma.agency.update({
    where: { id: agencyId },
    data: { suspendedAt: suspend ? new Date() : null },
  });

  revalidatePath("/admin");
}
