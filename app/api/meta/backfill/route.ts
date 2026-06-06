import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runBackfillJob } from "@/lib/backfill";

// Runs a BackfillJob for the signed-in agency. The client triggers this once
// after a reconnect, then polls getActiveBackfill() for live progress. The job
// row is verified to belong to the caller's agency (multi-tenant guard) before
// any work runs. NEVER touches another agency's data and never logs tokens.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A long gap with many hotels/posts can take a few minutes; cap at the plan max.
export const maxDuration = 300;

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let jobId: string;
  try {
    const body = (await request.json()) as { jobId?: unknown };
    jobId = typeof body.jobId === "string" ? body.jobId : "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!jobId) {
    return Response.json({ error: "Missing jobId." }, { status: 400 });
  }

  // Multi-tenant guard: the job must belong to this agency.
  const job = await prisma.backfillJob.findFirst({
    where: { id: jobId, agencyId: member.agencyId },
    select: { id: true, status: true },
  });
  if (!job) {
    return Response.json({ error: "Backfill job not found." }, { status: 404 });
  }

  // Idempotent: runBackfillJob atomically claims pending jobs (and stale
  // "running" jobs whose serverless runner timed out, resuming where the data
  // stops). A healthy running or finished job just reports current state.
  await runBackfillJob(job.id);

  const finished = await prisma.backfillJob.findUnique({
    where: { id: job.id },
    select: { id: true, status: true, daysRestored: true, daysFailed: true, message: true },
  });
  return Response.json({ ok: true, job: finished });
}
