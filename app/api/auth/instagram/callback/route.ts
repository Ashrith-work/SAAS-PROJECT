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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function integrationsUrl(hotelClientId: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `/agency/hotel/${hotelClientId}/integrations?${qs}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = (url.searchParams.get("state") ?? "").trim();
  const code = (url.searchParams.get("code") ?? "").trim();
  const oauthError = url.searchParams.get("error");

  // Tampered/expired/missing state → there is no trustworthy hotel to return
  // to, so fail closed with a JSON 400 rather than redirecting anywhere.
  const payload = state ? verifyOauthState(state) : null;
  if (!payload) {
    return Response.json(
      { error: "Invalid or expired state. Please restart the Instagram connection." },
      { status: 400 },
    );
  }
  const { hotelClientId, agencyId } = payload;

  // The user cancelled Instagram's consent screen.
  if (oauthError || !code) {
    redirect(integrationsUrl(hotelClientId, { ig_error: "access_denied" }));
  }

  // Re-verify the hotel still exists and belongs to the agency in the state.
  const hotel = await prisma.hotelClient.findFirst({
    where: { id: hotelClientId, agencyId },
    select: { id: true },
  });
  if (!hotel) {
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
    const short = await exchangeCodeForToken(code);
    const long = await exchangeLongLivedToken(short.accessToken);
    longLivedToken = long.accessToken;
    tokenExpiresAt = long.expiresAt;

    const profile = await getProfile(longLivedToken);
    igUserId = profile.igUserId || short.igUserId;
    username = profile.username;
    accountType = profile.accountType;
    profilePicUrl = profile.profilePictureUrl;
  } catch {
    // Exchange or profile fetch failed — never log the details (they can
    // embed token fragments); send the user back with a generic error.
    redirect(integrationsUrl(hotelClientId, { ig_error: "exchange_failed" }));
  }

  // IGAA insights only exist for professional accounts.
  if (accountType === "PERSONAL") {
    redirect(integrationsUrl(hotelClientId, { ig_error: "personal_account_not_supported" }));
  }

  const encryptedToken = await encryptWithAudit(longLivedToken, {
    agencyId,
    hotelClientId,
    tokenType: "instagram",
    source: "oauth:instagram-callback",
  });

  await prisma.instagramConnection.upsert({
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
  });

  redirect(integrationsUrl(hotelClientId, { ig_connected: "success" }));
}
