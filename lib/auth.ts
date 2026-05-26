import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Loads the AgencyMember (with its Agency) for the currently signed-in Clerk
 * user, or null if not signed in / not yet onboarded.
 */
export async function getCurrentMember() {
  const { userId } = await auth();
  if (!userId) return null;

  return prisma.agencyMember.findUnique({
    where: { clerkId: userId },
    include: { agency: true },
  });
}
