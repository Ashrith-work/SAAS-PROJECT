import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { signOauthState } from "@/lib/signed-state";
import { buildMetaAuthorizeUrl } from "@/lib/meta";

// Step 1 of the Meta (Facebook Login for Business) OAuth flow. The signed-in
// agency member clicks "Connect with Facebook"; we mint a signed 10-minute state
// token and hand the browser to Facebook's authorize screen.
//
// The Meta token is AGENCY-scoped (one per agency, like the manual flow), so the
// hotelClientId query param is OPTIONAL: when present (a per-hotel entry point)
// we verify the hotel belongs to the agency and return there; when absent (the
// agency Settings entry) we return to Settings. Either way the token is saved for
// member.agencyId.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) redirect("/agency/onboarding");

  const url = new URL(request.url);
  const hotelClientId = (url.searchParams.get("hotelClientId") ?? "").trim();

  // Optional multi-tenant guard: never start a flow for another agency's hotel.
  if (hotelClientId) {
    const hotel = await agencyScoped(prisma.hotelClient).findFirst({
      where: { id: hotelClientId },
      select: { id: true },
    });
    if (!hotel) {
      return Response.json({ error: "Hotel not found for your agency." }, { status: 404 });
    }
  }

  // State binds the round-trip to this agency (HMAC-signed, 10-min expiry, nonce).
  // An empty hotelClientId is a valid "agency-level" marker the callback handles.
  const state = signOauthState({ hotelClientId, agencyId: member.agencyId });

  let authorizeUrl: string;
  try {
    authorizeUrl = buildMetaAuthorizeUrl(state);
  } catch (err) {
    console.error(
      "[META-OAUTH] start: buildMetaAuthorizeUrl FAILED:",
      err instanceof Error ? err.message : err,
    );
    return Response.json(
      { error: err instanceof Error ? err.message : "Meta Login is not configured." },
      { status: 500 },
    );
  }

  // Log the PUBLIC OAuth params (client_id, redirect_uri, scope). The redirect_uri
  // here MUST exactly match a "Valid OAuth Redirect URI" in the Meta app, or
  // Facebook rejects the authorize request and never calls our callback back.
  try {
    const au = new URL(authorizeUrl);
    console.log(
      "[META-OAUTH] start → redirecting to Facebook:",
      JSON.stringify({
        authorizeHost: au.host,
        client_id: au.searchParams.get("client_id"),
        redirect_uri: au.searchParams.get("redirect_uri"),
        scope: au.searchParams.get("scope"),
        hotelClientId: hotelClientId || "(agency-level)",
      }),
    );
  } catch {
    // logging must never block the redirect
  }

  redirect(authorizeUrl);
}
