import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyOauthState } from "@/lib/signed-state";
import { encryptWithAudit } from "@/lib/token-audit";
import {
  exchangeCodeForToken,
  exchangeLongLivedToken,
  getProfile,
} from "@/lib/instagram";

// Step 2 of the Instagram Login (IGAA) OAuth flow. Instagram redirects the
// browser here with ?code&state. The signed state is the authorization: it was
// minted by /start for an authenticated agency member and binds this callback
// to exactly one (agencyId, hotelClientId) pair, with a 10-minute expiry.
//
// SECURITY: the token is exchanged server-to-server, immediately swapped for a
// long-lived token, AES-256-GCM encrypted, and stored. It never reaches the
// browser and is never logged. PERSONAL accounts are rejected — the IGAA
// insights endpoints only work for Business/Creator accounts.
//
// DEBUG LOGGING: every step logs under the "[IG-OAUTH]" prefix so the flow can
// be traced in Vercel Logs. Tokens/codes are NEVER logged in full — only
// lengths, booleans, and non-secret profile fields (username, account type).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOG = "[IG-OAUTH]";

/** Masks a secret-ish string for logs: shows length + first 4 chars only. */
function mask(s: string | null | undefined): string {
  if (!s) return "(empty)";
  return `len=${s.length} head=${s.slice(0, 4)}…`;
}

/** Host of the configured DB, with credentials stripped — for logs. */
function dbHost(): string {
  return (process.env.DATABASE_URL || "").match(/@([^/:?]+)/)?.[1] ?? "unknown";
}

function integrationsUrl(hotelClientId: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `/agency/hotel/${hotelClientId}/integrations?${qs}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = (url.searchParams.get("state") ?? "").trim();
  const code = (url.searchParams.get("code") ?? "").trim();
  const oauthError = url.searchParams.get("error");

  // ── Config + entry dump: proves which env values prod is actually using.
  // app_id and redirect_uri are PUBLIC (they appear in the authorize URL);
  // the secret is only ever reported as present/absent, never its value.
  console.log(
    `${LOG} callback hit:`,
    JSON.stringify({
      hasCode: !!code,
      code: mask(code),
      hasState: !!state,
      oauthError: oauthError ?? null,
      INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID ?? "(unset)",
      INSTAGRAM_REDIRECT_URI: process.env.INSTAGRAM_REDIRECT_URI ?? "(unset)",
      INSTAGRAM_APP_SECRET_present: !!process.env.INSTAGRAM_APP_SECRET,
      DB_HOST: dbHost(),
    }),
  );

  // Tampered/expired/missing state → there is no trustworthy hotel to return
  // to, so fail closed with a JSON 400 rather than redirecting anywhere.
  const payload = state ? verifyOauthState(state) : null;
  if (!payload) {
    console.error(`${LOG} STATE INVALID — verifyOauthState returned null. Failing 400.`);
    return Response.json(
      { error: "Invalid or expired state. Please restart the Instagram connection." },
      { status: 400 },
    );
  }
  const { hotelClientId, agencyId } = payload;
  console.log(`${LOG} state OK:`, JSON.stringify({ hotelClientId, agencyId }));

  // The user cancelled Instagram's consent screen.
  if (oauthError || !code) {
    console.warn(`${LOG} no code / oauth error (${oauthError ?? "missing code"}) → access_denied redirect`);
    redirect(integrationsUrl(hotelClientId, { ig_error: "access_denied" }));
  }

  // Re-verify the hotel still exists and belongs to the agency in the state.
  const hotel = await prisma.hotelClient.findFirst({
    where: { id: hotelClientId, agencyId },
    select: { id: true },
  });
  if (!hotel) {
    console.error(`${LOG} hotel ${hotelClientId} not found for agency ${agencyId} → 404`);
    return Response.json({ error: "Hotel not found." }, { status: 404 });
  }

  let igUserId: string;
  let username: string;
  let accountType: string;
  let profilePicUrl: string | null;
  let longLivedToken: string;
  let tokenExpiresAt: Date;

  try {
    // code → short-lived IGAA token → long-lived (~60 days)
    console.log(`${LOG} step 1/3 exchangeCodeForToken …`);
    const short = await exchangeCodeForToken(code);
    console.log(
      `${LOG} step 1/3 OK:`,
      JSON.stringify({ shortToken: mask(short.accessToken), igUserId: short.igUserId || "(none)" }),
    );

    console.log(`${LOG} step 2/3 exchangeLongLivedToken …`);
    const long = await exchangeLongLivedToken(short.accessToken);
    longLivedToken = long.accessToken;
    tokenExpiresAt = long.expiresAt;
    console.log(
      `${LOG} step 2/3 OK:`,
      JSON.stringify({ longToken: mask(long.accessToken), expiresAt: long.expiresAt.toISOString() }),
    );

    console.log(`${LOG} step 3/3 getProfile …`);
    const profile = await getProfile(longLivedToken);
    igUserId = profile.igUserId || short.igUserId;
    username = profile.username;
    accountType = profile.accountType;
    profilePicUrl = profile.profilePictureUrl;
    console.log(
      `${LOG} step 3/3 OK:`,
      JSON.stringify({ igUserId, username, accountType, followers: profile.followersCount }),
    );
  } catch (err) {
    // THE failure the user couldn't see before: exchange/profile error. Log the
    // full reason + stack (Instagram's error_message is the gold here), then
    // redirect with a generic code as before.
    console.error(
      `${LOG} EXCHANGE/PROFILE FAILED:`,
      err instanceof Error ? err.message : String(err),
    );
    if (err instanceof Error && err.stack) console.error(`${LOG} stack:`, err.stack);
    redirect(integrationsUrl(hotelClientId, { ig_error: "exchange_failed" }));
  }

  // IGAA insights only exist for professional accounts.
  if (accountType === "PERSONAL") {
    console.warn(`${LOG} account ${username} is PERSONAL → personal_account_not_supported`);
    redirect(integrationsUrl(hotelClientId, { ig_error: "personal_account_not_supported" }));
  }

  console.log(`${LOG} encrypting token + writing InstagramConnection (db=${dbHost()}) …`);
  const encryptedToken = await encryptWithAudit(longLivedToken, {
    agencyId,
    hotelClientId,
    tokenType: "instagram",
    source: "oauth:instagram-callback",
  });

  try {
    const saved = await prisma.instagramConnection.upsert({
      // hotelClientId is unique — one Instagram connection per hotel. Ownership
      // was bound by the signed state and re-verified above.
      where: { hotelClientId },
      create: {
        agencyId,
        hotelClientId,
        tokenType: "igaa_direct",
        igUserId,
        username,
        igAccountType: accountType,
        profilePicUrl,
        encryptedToken,
        tokenExpiresAt,
        status: "active",
        errorMessage: null,
      },
      update: {
        tokenType: "igaa_direct",
        igUserId,
        username,
        igAccountType: accountType,
        profilePicUrl,
        encryptedToken,
        tokenExpiresAt,
        status: "active",
        errorMessage: null,
      },
      select: { id: true },
    });
    console.log(
      `${LOG} DB write OK:`,
      JSON.stringify({ connectionId: saved.id, hotelClientId, username, igUserId }),
    );
  } catch (err) {
    // Log the DB write failure (previously this would surface as an unhandled
    // 500 with no trace) — then re-throw to preserve the original behavior.
    console.error(
      `${LOG} DB WRITE FAILED:`,
      err instanceof Error ? err.message : String(err),
    );
    if (err instanceof Error && err.stack) console.error(`${LOG} stack:`, err.stack);
    throw err;
  }

  console.log(`${LOG} success → redirecting to integrations (ig_connected=success)`);
  redirect(integrationsUrl(hotelClientId, { ig_connected: "success" }));
}
