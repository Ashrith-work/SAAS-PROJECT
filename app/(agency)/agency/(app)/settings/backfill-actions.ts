"use server";

import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Serializable view of a BackfillJob for the progress banner. Dates are ISO
// strings so it crosses the server→client boundary cleanly.
export type BackfillJobView = {
  id: string;
  status: string; // pending | running | completed | partial | failed
  rangeStart: string;
  rangeEnd: string;
  daysRestored: number;
  daysFailed: number;
  message: string | null;
  finishedAt: string | null;
};

/**
 * The agency's most recent backfill job, or null. The banner shows it while it's
 * pending/running, and for a short window after it finishes (so the completion
 * summary is visible). Agency-scoped via the signed-in member.
 */
export async function getActiveBackfill(): Promise<BackfillJobView | null> {
  const member = await getCurrentMember();
  if (!member) return null;

  const job = await prisma.backfillJob.findFirst({
    where: { agencyId: member.agencyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      rangeStart: true,
      rangeEnd: true,
      daysRestored: true,
      daysFailed: true,
      message: true,
      finishedAt: true,
    },
  });
  if (!job) return null;

  // Hide a finished job after a short window so the completion summary doesn't
  // linger across sessions (the banner is for the just-completed reconnect).
  const FINISHED_TTL_MS = 10 * 60 * 1000;
  if (
    job.finishedAt &&
    job.status !== "pending" &&
    job.status !== "running" &&
    Date.now() - job.finishedAt.getTime() > FINISHED_TTL_MS
  ) {
    return null;
  }

  return {
    id: job.id,
    status: job.status,
    rangeStart: job.rangeStart.toISOString().slice(0, 10),
    rangeEnd: job.rangeEnd.toISOString().slice(0, 10),
    daysRestored: job.daysRestored,
    daysFailed: job.daysFailed,
    message: job.message,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}
