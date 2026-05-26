"use server";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Provisions an Agency for a freshly signed-up user: creates the Agency and an
 * admin AgencyMember linked to their Clerk ID, then marks their platform role
 * as `agency_admin` in Clerk publicMetadata so Proxy (middleware) can gate
 * routes. Idempotent — safe to call twice.
 */
export async function createAgencyForCurrentUser(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return { error: "You must be signed in." };

  const name = (formData.get("agencyName") as string | null)?.trim();
  if (!name) return { error: "Agency name is required." };

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "";
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    email ||
    "Agency owner";

  // Only create if this Clerk user isn't already attached to an agency.
  const existing = await prisma.agencyMember.findUnique({
    where: { clerkId: userId },
  });
  if (!existing) {
    await prisma.agency.create({
      data: {
        name,
        email,
        members: {
          create: {
            clerkId: userId,
            email,
            name: fullName,
            role: "admin", // MemberRole within the agency
          },
        },
      },
    });
  }

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { role: "agency_admin" },
  });

  return { ok: true };
}
