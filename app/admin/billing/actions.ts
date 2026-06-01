"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPlatformRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRazorpay } from "@/lib/razorpay";

// Super-admin billing overrides. Both re-check the platform role server-side
// (never trusting that the proxy ran) — this is the only place billing is
// mutated outside the agency's own Razorpay-driven flow.

/**
 * Manually extends an agency's access by N days (default 30) and marks it active.
 * Use to comp an agency or bridge a billing hiccup without taking a payment.
 */
export async function extendSubscription(formData: FormData): Promise<void> {
  const role = await getPlatformRole();
  if (role !== "super_admin") return;

  const agencyId = ((formData.get("agencyId") as string | null) ?? "").trim();
  const days = Number(formData.get("days") ?? 30) || 30;
  if (!agencyId) return;

  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { subscriptionExpiresAt: true },
  });
  if (!agency) return;

  const base = agency.subscriptionExpiresAt && agency.subscriptionExpiresAt.getTime() > Date.now()
    ? agency.subscriptionExpiresAt.getTime()
    : Date.now();
  const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000);

  await prisma.agency.update({
    where: { id: agencyId },
    data: { subscriptionStatus: "active", subscriptionExpiresAt: expiresAt },
  });

  revalidatePath("/admin/billing");
  redirect("/admin/billing?extend=ok");
}

/**
 * Refunds the most recent captured payment for an agency's subscription via the
 * Razorpay refunds API. (Razorpay processes a real refund — test refunds in test
 * mode.) Does not change local status; the relevant webhook will follow.
 */
export async function refundLastPayment(formData: FormData): Promise<void> {
  const role = await getPlatformRole();
  if (role !== "super_admin") return;

  const agencyId = ((formData.get("agencyId") as string | null) ?? "").trim();
  if (!agencyId) return;

  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { razorpaySubscriptionId: true },
  });

  let ok = false;
  if (agency?.razorpaySubscriptionId) {
    try {
      const rzp = getRazorpay();
      const invoices = await rzp.invoices.all({
        subscription_id: agency.razorpaySubscriptionId,
        count: 100,
      });
      // Most recent invoice that has a captured payment.
      const withPayment = invoices.items
        .map((i) => i as unknown as { payment_id?: string | null; paid_at?: number | null })
        .filter((i) => i.payment_id)
        .sort((a, b) => (b.paid_at ?? 0) - (a.paid_at ?? 0));
      const paymentId = withPayment[0]?.payment_id;
      if (paymentId) {
        await rzp.payments.refund(paymentId, {});
        ok = true;
      }
    } catch {
      ok = false;
    }
  }

  revalidatePath("/admin/billing");
  redirect(`/admin/billing?refund=${ok ? "ok" : "err"}`);
}
