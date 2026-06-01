import { prisma } from "@/lib/prisma";
import { getPlan } from "@/lib/razorpay-plans";
import { sendRenewalReminderEmail } from "@/lib/billing-email";

// Renewal reminders. Emails agencies whose active subscription renews in ~7 days.
// Public in proxy.ts but guarded by CRON_SECRET (same pattern as the other cron
// endpoints). Add to vercel.json crons to run daily.
//
// To avoid sending the same reminder repeatedly, we only email agencies whose
// current period ends inside a single 24h window 6–7 days out — a daily run hits
// each agency exactly once as its expiry crosses that window.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const windowStart = new Date(now + 6 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now + 7 * 24 * 60 * 60 * 1000);

  const agencies = await prisma.agency.findMany({
    where: {
      subscriptionStatus: "active",
      subscriptionExpiresAt: { gte: windowStart, lt: windowEnd },
    },
    select: { id: true, name: true, email: true, plan: true, subscriptionExpiresAt: true },
  });

  let sent = 0;
  let skipped = 0;
  for (const a of agencies) {
    if (!a.email || !a.subscriptionExpiresAt) {
      skipped++;
      continue;
    }
    const res = await sendRenewalReminderEmail({
      to: a.email,
      agencyName: a.name,
      planName: getPlan(a.plan).name,
      expiresAt: a.subscriptionExpiresAt,
    });
    if (res.ok) sent++;
    else skipped++;
  }

  return Response.json({ matched: agencies.length, sent, skipped });
}
