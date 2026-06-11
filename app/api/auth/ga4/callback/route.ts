import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyOauthState } from "@/lib/signed-state";
import { encryptWithAudit } from "@/lib/token-audit";
import { getTokenForApiCall } from "@/lib/token-access";
import { exchangeCodeForTokens, listProperties, mask } from "@/lib/ga4";

// Step 2 of the GA4 OAuth flow. Google redirects here with ?code&state. The
// signed state (minted by /start for an authenticated agency member) binds this
// callback to exactly one (agencyId, hotelClientId) pair, with a 10-minute
// expiry.
//
// SECURITY: tokens are exchanged server-to-server, AES-256-GCM encrypted, and
// stored — never reaching the browser, never logged. Every step logs under the
// "[GA4-OAUTH]" prefix; tokens/codes are masked (length + first 4 chars).
//
// Property selection: 0 properties → error; exactly 1 → auto-select; 2+ → save
// tokens with an empty propertyId and send the user back to pick one.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOG = "[GA4-OAUTH]";

function dbHost(): string {
  return (process.env.DATABASE_URL || "").match(/@([^/:?]+)/)?.[1] ?? "unknown";
}
function integrationsUrl(hotelClientId: string, params: Record<string, string>): string {
  return `/agency/hotel/${hotelClientId}/integrations?${new URLSearchParams(params).toString()}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = (url.searchParams.get("state") ?? "").trim();
  const code = (url.searchParams.get("code") ?? "").trim();
  const oauthError = url.searchParams.get("error");

  console.log(
    `${LOG} callback hit:`,
    JSON.stringify({
      hasCode: !!code,
      code: mask(code),
      hasState: !!state,
      oauthError: oauthError ?? null,
      GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID ? "(set)" : "(unset)",
      GA4_REDIRECT_URI: process.env.GA4_REDIRECT_URI ?? "(unset)",
      GOOGLE_OAUTH_CLIENT_SECRET_present: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      DB_HOST: dbHost(),
    }),
  );

  const payload = state ? verifyOauthState(state) : null;
  if (!payload) {
    console.error(`${LOG} STATE INVALID — verifyOauthState returned null. Failing 400.`);
    return Response.json(
      { error: "Invalid or expired state. Please restart the GA4 connection." },
      { status: 400 },
    );
  }
  const { hotelClientId, agencyId } = payload;
  console.log(`${LOG} state OK:`, JSON.stringify({ hotelClientId, agencyId }));

  if (oauthError || !code) {
    console.warn(`${LOG} no code / oauth error (${oauthError ?? "missing code"}) → access_denied`);
    redirect(integrationsUrl(hotelClientId, { ga4_error: "access_denied" }));
  }

  const hotel = await prisma.hotelClient.findFirst({
    where: { id: hotelClientId, agencyId },
    select: { id: true },
  });
  if (!hotel) {
    console.error(`${LOG} hotel ${hotelClientId} not found for agency ${agencyId} → 404`);
    return Response.json({ error: "Hotel not found." }, { status: 404 });
  }

  // ── Exchange code → tokens, then list the user's GA4 properties ──
  let accessToken: string;
  let refreshToken: string | null;
  let tokenExpiresAt: Date;
  let scope: string;
  let properties: { propertyId: string; displayName: string }[];
  try {
    console.log(`${LOG} step 1/2 exchangeCodeForTokens …`);
    const tokens = await exchangeCodeForTokens(code);
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    tokenExpiresAt = tokens.expiresAt;
    scope = tokens.scope;
    console.log(
      `${LOG} step 1/2 OK:`,
      JSON.stringify({
        access: mask(accessToken),
        refresh: mask(refreshToken),
        expiresAt: tokenExpiresAt.toISOString(),
        scope,
      }),
    );

    console.log(`${LOG} step 2/2 listProperties …`);
    properties = await listProperties(accessToken);
    console.log(`${LOG} step 2/2 OK: ${properties.length} property(ies):`, JSON.stringify(properties.map((p) => p.propertyId)));
  } catch (err) {
    console.error(`${LOG} EXCHANGE/PROPERTIES FAILED:`, err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(`${LOG} stack:`, err.stack);
    redirect(integrationsUrl(hotelClientId, { ga4_error: "exchange_failed" }));
  }

  if (properties.length === 0) {
    console.warn(`${LOG} user has no GA4 properties → no_property`);
    redirect(integrationsUrl(hotelClientId, { ga4_error: "no_property" }));
  }

  // Auto-select when there's exactly one; otherwise leave it for the picker.
  const selected = properties.length === 1 ? properties[0] : null;

  // ── Encrypt tokens. Google only returns a refresh_token on the FIRST consent;
  // prompt=consent forces one, but if it's ever absent reuse the stored one. ──
  console.log(`${LOG} encrypting tokens + upserting Ga4Connection (db=${dbHost()}) …`);
  const accessCipher = await encryptWithAudit(accessToken, {
    agencyId, hotelClientId, tokenType: "ga4", source: "oauth:ga4-callback",
  });

  let refreshCipher: string;
  if (refreshToken) {
    refreshCipher = await encryptWithAudit(refreshToken, {
      agencyId, hotelClientId, tokenType: "ga4", source: "oauth:ga4-callback",
    });
  } else {
    const existing = await prisma.ga4Connection.findUnique({ where: { hotelClientId }, select: { id: true } });
    if (!existing) {
      console.error(`${LOG} no refresh_token returned and no existing connection → no_refresh`);
      redirect(integrationsUrl(hotelClientId, { ga4_error: "no_refresh" }));
    }
    // Reuse the stored refresh token (decrypt out-of-band, re-encrypt).
    const stored = await getTokenForApiCall("ga4_refresh", existing!.id, {
      agencyId, hotelClientId, source: "oauth:ga4-callback-reuse",
    });
    refreshCipher = await encryptWithAudit(stored.reveal(), {
      agencyId, hotelClientId, tokenType: "ga4", source: "oauth:ga4-callback",
    });
  }

  try {
    const saved = await prisma.ga4Connection.upsert({
      where: { hotelClientId },
      create: {
        agencyId,
        hotelClientId,
        propertyId: selected?.propertyId ?? "",
        propertyName: selected?.displayName ?? null,
        accessToken: accessCipher,
        refreshToken: refreshCipher,
        tokenExpiresAt,
        scope,
        status: "ACTIVE",
        lastSyncError: null,
        requiresReconnect: false,
        lastErrorReason: null,
      },
      update: {
        propertyId: selected?.propertyId ?? "",
        propertyName: selected?.displayName ?? null,
        accessToken: accessCipher,
        refreshToken: refreshCipher,
        tokenExpiresAt,
        scope,
        status: "ACTIVE",
        lastSyncError: null,
        requiresReconnect: false,
        lastErrorReason: null,
      },
      select: { id: true },
    });
    console.log(`${LOG} DB write OK:`, JSON.stringify({ connectionId: saved.id, hotelClientId, propertyId: selected?.propertyId ?? "(pick)" }));
  } catch (err) {
    console.error(`${LOG} DB WRITE FAILED:`, err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(`${LOG} stack:`, err.stack);
    throw err;
  }

  if (!selected) {
    console.log(`${LOG} multiple properties → redirect to property picker`);
    redirect(integrationsUrl(hotelClientId, { ga4_select: "1" }));
  }

  console.log(`${LOG} success → integrations (ga4_connected=success)`);
  redirect(integrationsUrl(hotelClientId, { ga4_connected: "success" }));
}
