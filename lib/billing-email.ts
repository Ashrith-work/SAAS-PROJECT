import "server-only";

import { sendEmail, renderEmail, p, lead, statRow, statTable, type SendResult } from "@/lib/email";

// Transactional billing emails (Resend). Each mirrors the branded layout used by
// the rest of the app (see lib/email.ts) and, like sendEmail, NEVER throws — the
// caller (a webhook handler or cron) records the outcome and keeps going.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const billingUrl = `${APP_URL}/agency/billing`;

/** Welcome email when a subscription first becomes active. */
export function sendSubscriptionActivatedEmail(opts: {
  to: string;
  agencyName: string;
  planName: string;
}): Promise<SendResult> {
  const html = renderEmail({
    heading: "Your subscription is active",
    preheader: `Welcome to HotelTrack ${opts.planName}.`,
    accent: "brand",
    bodyHtml:
      lead(`Welcome aboard, ${escapeText(opts.agencyName)} 🎉`) +
      p(`Your <strong>${escapeText(opts.planName)}</strong> plan is now active. Your agency dashboard is unlocked — add hotel clients, generate tracking links, and start proving which content drives real bookings.`) +
      p("You'll be billed monthly in INR. You can change plan, pause, or cancel anytime from the billing page."),
    cta: { label: "Go to your dashboard", url: `${APP_URL}/agency/dashboard` },
  });
  return sendEmail({ to: opts.to, subject: `Welcome to HotelTrack ${opts.planName}`, html });
}

/** Action-required email when a subscription payment fails. */
export function sendPaymentFailedEmail(opts: {
  to: string;
  agencyName: string;
}): Promise<SendResult> {
  const html = renderEmail({
    heading: "Payment failed — action required",
    preheader: "We couldn't process your latest HotelTrack payment.",
    accent: "critical",
    bodyHtml:
      lead(`Hi ${escapeText(opts.agencyName)},`) +
      p("We weren't able to charge your payment method for your HotelTrack subscription. Razorpay will retry automatically, but your dashboard access may be interrupted if the renewal can't be collected.") +
      p("Please review your payment method to avoid any disruption."),
    cta: { label: "Update payment & retry", url: billingUrl },
  });
  return sendEmail({ to: opts.to, subject: "Action required: your HotelTrack payment failed", html });
}

/** Confirmation email when a subscription is cancelled. */
export function sendSubscriptionCancelledEmail(opts: {
  to: string;
  agencyName: string;
  planName: string;
}): Promise<SendResult> {
  const html = renderEmail({
    heading: "Your subscription was cancelled",
    preheader: "Confirmation that your HotelTrack subscription is cancelled.",
    accent: "warning",
    bodyHtml:
      lead(`Hi ${escapeText(opts.agencyName)},`) +
      p(`This confirms your <strong>${escapeText(opts.planName)}</strong> subscription has been cancelled. You'll keep access until the end of your current billing period, after which the dashboard will lock.`) +
      p("Changed your mind? You can resubscribe anytime — your hotels, content, and historical data are kept."),
    cta: { label: "Resubscribe", url: billingUrl },
  });
  return sendEmail({ to: opts.to, subject: "Your HotelTrack subscription was cancelled", html });
}

/** Renewal reminder ~7 days before the current cycle ends. */
export function sendRenewalReminderEmail(opts: {
  to: string;
  agencyName: string;
  planName: string;
  expiresAt: Date;
}): Promise<SendResult> {
  const when = opts.expiresAt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const html = renderEmail({
    heading: "Your plan renews in 7 days",
    preheader: `Your HotelTrack ${opts.planName} plan renews on ${when}.`,
    accent: "info",
    bodyHtml:
      lead(`Hi ${escapeText(opts.agencyName)},`) +
      p("This is a friendly heads-up that your subscription will renew automatically:") +
      statTable(
        statRow("Plan", opts.planName) +
          statRow("Renews on", when) +
          statRow("Billing", "Monthly · INR"),
      ) +
      p("No action is needed if you'd like to continue. To change plan or cancel before renewal, visit your billing page."),
    cta: { label: "Manage subscription", url: billingUrl },
  });
  return sendEmail({ to: opts.to, subject: `Your HotelTrack ${opts.planName} plan renews in 7 days`, html });
}

/** Minimal escaping for values interpolated into the HTML bodies above. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
