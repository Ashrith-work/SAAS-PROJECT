import "server-only";

import { prisma } from "@/lib/prisma";
import {
  encryptToken,
  decryptToken,
  type EncryptedToken,
  type SecretToken,
} from "@/lib/encryption";
import { redactSecrets } from "@/lib/redact";
import { sendEmail, renderEmail, lead, p } from "@/lib/email";

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — token audit logging (see SECURITY.md / model TokenAuditLog).
//
// Wraps encrypt/decrypt so every handling of a stored secret is recorded:
// who/what (actorId, source), which tenant (agencyId, hotelClientId), the
// action, and whether it succeeded. A failed decryption is logged with
// success=false + a reason; a burst (>3 in 10 minutes) emails a security alert.
//
// Auditing is BEST-EFFORT: a failure to write the log never breaks the crypto
// operation (it must not), and the alert path never throws.
// ─────────────────────────────────────────────────────────────────────────────

export type TokenAuditActionValue =
  | "created"
  | "decrypted"
  | "refreshed"
  | "rotated"
  | "deleted"
  | "failed_decrypt"
  | "hotel_soft_deleted"
  | "hotel_restored";

export type AuditContext = {
  agencyId: string;
  hotelClientId?: string | null;
  /** "meta_ads" | "instagram" | "ga_credentials" | … */
  tokenType: string;
  /** Calling context, e.g. "action:saveMetaToken" or "api:/api/meta/sync". */
  source?: string | null;
  /** Overrides — otherwise auto-filled from the request (Clerk + headers). */
  actorId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Optional action override for decrypt (e.g. "refreshed"). */
  action?: TokenAuditActionValue;
};

// Resolve the acting user + request metadata from the ambient request, if any.
// Dynamic imports + try/catch so this is a no-op (nulls) outside a request scope
// — cron jobs, CLI scripts, and unit tests — without a hard dependency on Next.
async function ambientMeta(): Promise<{
  actorId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}> {
  let actorId: string | null = null;
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    actorId = (await auth()).userId ?? null;
  } catch {
    /* not in a request / no session */
  }
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    userAgent = h.get("user-agent") || null;
  } catch {
    /* not in a request */
  }
  return { actorId, ipAddress, userAgent };
}

async function writeAuditLog(
  ctx: AuditContext,
  action: TokenAuditActionValue,
  success: boolean,
  errorReason?: string | null,
): Promise<void> {
  try {
    const ambient = await ambientMeta();
    await prisma.tokenAuditLog.create({
      data: {
        agencyId: ctx.agencyId,
        hotelClientId: ctx.hotelClientId ?? null,
        tokenType: ctx.tokenType,
        action,
        success,
        errorReason: errorReason ?? null,
        actorId: ctx.actorId ?? ambient.actorId,
        ipAddress: ctx.ipAddress ?? ambient.ipAddress,
        userAgent: ctx.userAgent ?? ambient.userAgent,
        source: ctx.source ?? null,
      },
    });
  } catch {
    // Auditing must never break the operation it observes. Swallow.
  }
}

/** Encrypt a secret and record a "created" audit event. */
export async function encryptWithAudit(
  plain: string | SecretToken,
  ctx: AuditContext,
): Promise<EncryptedToken> {
  const cipher = encryptToken(plain);
  await writeAuditLog(ctx, "created", true);
  return cipher;
}

/**
 * Decrypt a secret and record the outcome. On failure (tampering, wrong key,
 * corruption) it logs success=false with the error reason, checks the burst
 * threshold, and re-throws — callers handle the error exactly as before.
 */
export async function decryptWithAudit(
  cipher: string,
  ctx: AuditContext,
): Promise<SecretToken> {
  try {
    const plain = decryptToken(cipher);
    await writeAuditLog(ctx, ctx.action ?? "decrypted", true);
    return plain;
  } catch (err) {
    await recordDecryptFailure(ctx, err);
    throw err;
  }
}

/**
 * Record a failed decryption (success=false + redacted reason) and run the burst
 * threshold check. Exported so getTokenForApiCall's security-definer path — where
 * the DB function logs the successful access but the app decrypts — can still log
 * failures here.
 */
export async function recordDecryptFailure(ctx: AuditContext, err: unknown): Promise<void> {
  // Redact + cap the reason defensively before it is stored/logged.
  const reason = redactSecrets(
    err instanceof Error ? err.message : "decryption failed",
  ).slice(0, 300);
  await writeAuditLog(ctx, "failed_decrypt", false, reason);
  await maybeAlertOnDecryptFailures();
}

/** Record a non-crypto token lifecycle event (deleted / refreshed / rotated). */
export async function logTokenAudit(
  ctx: AuditContext & { action: TokenAuditActionValue; success?: boolean; errorReason?: string },
): Promise<void> {
  await writeAuditLog(ctx, ctx.action, ctx.success ?? true, ctx.errorReason);
}

// ── Failed-decrypt burst alert ───────────────────────────────────────────────

const FAIL_WINDOW_MS = 10 * 60 * 1000;
const FAIL_THRESHOLD = 3; // alert when MORE THAN this many failures occur in the window

// In-memory throttle so we email at most once per window per server instance.
// (A few duplicate alerts across instances during a real attack is acceptable —
// far better than missing one.)
let lastAlertAt = 0;

async function maybeAlertOnDecryptFailures(): Promise<void> {
  try {
    const since = new Date(Date.now() - FAIL_WINDOW_MS);
    const count = await prisma.tokenAuditLog.count({
      where: { action: "failed_decrypt", success: false, createdAt: { gte: since } },
    });
    if (count <= FAIL_THRESHOLD) return;

    const now = Date.now();
    if (now - lastAlertAt < FAIL_WINDOW_MS) return; // throttled
    lastAlertAt = now;

    const to = process.env.SECURITY_ALERT_EMAIL;
    if (!to) return; // nowhere to send — see .env.example

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    await sendEmail({
      to,
      subject: `[HotelTrack security] ${count} token decryption failures in 10 minutes`,
      html: renderEmail({
        heading: "Token decryption failures",
        preheader: `${count} failed decryptions in the last 10 minutes`,
        accent: "critical",
        bodyHtml:
          lead(`We recorded <strong>${count}</strong> failed token decryptions in the last 10 minutes.`) +
          p(
            "A burst of failures can indicate ciphertext tampering, a wrong or rotated encryption key, or data corruption. Review the audit log and confirm the encryption keys are intact.",
          ),
        cta: appUrl ? { label: "Open the audit log", url: `${appUrl}/admin/audit?action=failed_decrypt` } : undefined,
      }),
    });
  } catch {
    // Never let the alert path throw into the decrypt caller.
  }
}
