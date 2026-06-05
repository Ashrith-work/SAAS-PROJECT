import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Next.js 16 renamed Middleware -> Proxy. Clerk's clerkMiddleware() works here
// unchanged. This guards every non-public route and enforces the three platform
// roles by URL prefix.

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Public, UUID-addressed hotel report links. No login: access is gated by the
  // unguessable token (and an optional password) inside the route itself.
  "/share(.*)",
  // The tracking endpoints are called cross-origin by the snippet on hotel
  // websites with no auth — they must stay public (scoped by the public siteId).
  "/api/track(.*)",
  // The scheduled Meta sync is called by Vercel Cron (no Clerk session); it
  // enforces its own CRON_SECRET bearer-token check.
  "/api/meta/sync(.*)",
  // Same pattern: cron-style trigger, gated by CRON_SECRET inside the route.
  "/api/alerts/run(.*)",
  "/api/instagram/sync(.*)",
  "/api/instagram/refresh-tokens(.*)",
  "/api/ga/sync(.*)",
  // Instagram OAuth callback: the browser arrives from instagram.com; the
  // signed 10-minute state token (bound to agency + hotel) is the auth.
  "/api/auth/instagram/callback(.*)",
  // Razorpay posts webhooks with no Clerk session; the route verifies the
  // Razorpay HMAC-SHA256 signature instead.
  "/api/webhooks/razorpay(.*)",
  // Renewal-reminder cron, gated by CRON_SECRET inside the route.
  "/api/billing/renewal-reminders(.*)",
]);
const isAgencyRoute = createRouteMatcher(["/agency(.*)"]);
const isOnboardingRoute = createRouteMatcher(["/agency/onboarding(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isHotelRoute = createRouteMatcher(["/hotel(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const { userId, sessionClaims, redirectToSignIn } = await auth();

  // Unauthenticated users hitting a protected route -> sign in.
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  // Prefer the role from the session token. This requires the Clerk dashboard
  // session token to carry `{"metadata": "{{user.public_metadata}}"}` (see
  // types/globals.d.ts). If that claim isn't configured, the token won't have
  // it and `role` would be undefined — which would bounce an onboarded
  // agency_admin between /agency/dashboard and /agency/onboarding forever. To be
  // resilient, fall back to reading publicMetadata directly from Clerk.
  let role = sessionClaims?.metadata?.role;
  if (!role) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    role = user.publicMetadata?.role;
  }
  const home = new URL("/", req.url);

  if (isAgencyRoute(req)) {
    // A freshly signed-up user has no role yet; let them reach onboarding to
    // provision their Agency (which then sets role = agency_admin).
    if (isOnboardingRoute(req)) return NextResponse.next();
    if (role !== "agency_admin") {
      return NextResponse.redirect(
        role ? home : new URL("/agency/onboarding", req.url),
      );
    }
    // Pass the pathname through so the agency app layout can allow the billing +
    // settings pages even when the subscription is inactive (see its gate).
    const headers = new Headers(req.headers);
    headers.set("x-pathname", req.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  }

  if (isAdminRoute(req)) {
    if (role !== "super_admin") return NextResponse.redirect(home);
    return NextResponse.next();
  }

  if (isHotelRoute(req)) {
    if (role !== "hotel_client") return NextResponse.redirect(home);
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
