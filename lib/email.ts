import "server-only";

import { Resend } from "resend";

// Transactional email transport (Resend) + a small branded HTML layout used by
// every HotelTrack email. Kept `server-only` so the API key can never leak into
// a client bundle.
//
// RESILIENCE: sending NEVER throws. `sendEmail` catches every failure and
// returns a result object, so a callsite in the daily sync job can record the
// outcome and keep going even when Resend is down or unconfigured.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Verified "from" address. Falls back to Resend's shared onboarding sender so a
// developer can test with just RESEND_API_KEY set (that sender can only deliver
// to the Resend account owner's own address until a domain is verified).
const FROM = process.env.EMAIL_FROM || "HotelTrack <onboarding@resend.dev>";

// Lazily constructed so importing this module never requires the key to exist
// (e.g. during build). Reused across calls within a server instance.
let client: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export type SendResult = {
  ok: boolean;
  id?: string;
  /** True when no email was attempted because Resend isn't configured. */
  skipped?: boolean;
  error?: string;
};

/**
 * Sends one email through Resend. Returns `{ ok }` with the message id on
 * success, `{ skipped }` when RESEND_API_KEY is unset, or `{ ok: false, error }`
 * on any failure. Never throws.
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  const resend = getClient();
  if (!resend) {
    return { ok: false, skipped: true, error: "RESEND_API_KEY is not configured." };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
    });
    if (error) {
      return { ok: false, error: error.message ?? "Resend rejected the message." };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown email transport error.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Branded layout
//
// Email clients strip <style> blocks and external CSS unreliably, so every rule
// is inlined. The palette mirrors the app: near-black header, zinc text, a thin
// accent bar whose colour reflects severity.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  info: "#2563eb", // blue
  warning: "#d97706", // amber
  critical: "#dc2626", // red
  brand: "#18181b", // zinc-900
};

/** Resolves a severity (or "brand") to its accent hex. */
export function accentFor(severity: string): string {
  return ACCENTS[severity] ?? ACCENTS.brand;
}

/** Escapes a string for safe interpolation into HTML email bodies. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type EmailLayout = {
  /** Bold line in the dark header, e.g. "Performance alert". */
  heading: string;
  /** Hidden inbox-preview text. */
  preheader: string;
  /** Severity drives the accent colour. Defaults to brand. */
  accent?: string;
  /** Pre-rendered HTML for the body (use the helpers below). */
  bodyHtml: string;
  /** Optional call-to-action button. */
  cta?: { label: string; url: string };
};

/** Wraps body HTML in the branded, fully-inlined HotelTrack email shell. */
export function renderEmail(layout: EmailLayout): string {
  const accent = accentFor(layout.accent ?? "brand");
  const cta = layout.cta
    ? `<tr><td style="padding:8px 32px 24px;">
         <a href="${esc(layout.cta.url)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${esc(layout.cta.label)}</a>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(layout.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(layout.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
  <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:24px 32px 8px;">
    <div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;">HotelTrack</div>
    <div style="margin-top:6px;font-size:20px;font-weight:700;color:#18181b;">${esc(layout.heading)}</div>
  </td></tr>
  <tr><td style="padding:8px 32px 4px;color:#3f3f46;font-size:14px;line-height:1.6;">${layout.bodyHtml}</td></tr>
  ${cta}
  <tr><td style="padding:20px 32px 28px;border-top:1px solid #f4f4f5;">
    <div style="font-size:12px;color:#a1a1aa;line-height:1.5;">
      You're receiving this because email alerts are enabled for your HotelTrack agency.<br>
      <a href="${esc(APP_URL)}/agency/alerts" style="color:#71717a;">View your alert history</a>
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Body building blocks (all inline-styled) ────────────────────────────────

/** A short paragraph. */
export function p(html: string): string {
  return `<p style="margin:0 0 12px;">${html}</p>`;
}

/** A bold lead sentence. */
export function lead(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;color:#18181b;">${html}</p>`;
}

/** A label/value stat row, e.g. a before→after comparison. */
export function statRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#71717a;font-size:13px;border-bottom:1px solid #f4f4f5;">${esc(label)}</td>
    <td style="padding:8px 0;color:#18181b;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #f4f4f5;">${esc(value)}</td>
  </tr>`;
}

/** Wraps statRow()/row HTML in a bordered table. */
export function statTable(rowsHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border:1px solid #e4e4e7;border-radius:10px;padding:4px 14px;">${rowsHtml}</table>`;
}
