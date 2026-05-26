import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Loads the AgencyMember (with its Agency) for the currently signed-in Clerk
 * user, or null if not signed in / not yet onboarded.
 *
 * Wrapped in React `cache` so a layout and the page it wraps share one DB query
 * within the same request render.
 */
export const getCurrentMember = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;

  return prisma.agencyMember.findUnique({
    where: { clerkId: userId },
    include: { agency: true },
  });
});
