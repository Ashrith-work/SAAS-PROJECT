import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { postSlackWebhook, buildSlackTestMessage, isSlackWebhookUrl } from "@/lib/slack";

// Wired to the "Test connection" button in agency settings. Posts a test message
// to the agency's Slack webhook. The caller may pass a `url` in the body (the
// value currently typed in the form, not yet saved); on success that URL is
// saved as the agency's webhook so test == verify + save. The last-test outcome
// is recorded for the UI. Session-guarded (agency member); agency-scoped writes.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) {
    return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const provided = typeof body.url === "string" ? body.url.trim() : "";

  const agency = await prisma.agency.findUnique({
    where: { id: member.agencyId },
    select: { slackWebhookUrl: true },
  });
  const url = provided || agency?.slackWebhookUrl || "";

  if (!isSlackWebhookUrl(url)) {
    return Response.json(
      { ok: false, error: "Enter a valid Slack Incoming Webhook URL (https://hooks.slack.com/services/…)." },
      { status: 400 },
    );
  }

  const res = await postSlackWebhook(url, buildSlackTestMessage());

  // Record the outcome; on success persist the tested URL as the active webhook.
  await agencyScoped(prisma.agency).update({
    where: { id: member.agencyId },
    data: {
      slackLastTestAt: new Date(),
      slackLastTestStatus: res.ok ? "success" : res.error ?? "Slack test failed.",
      ...(res.ok ? { slackWebhookUrl: url } : {}),
    },
  });

  return Response.json(
    res.ok ? { ok: true } : { ok: false, error: res.error },
    { status: res.ok ? 200 : 502 },
  );
}
