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
  // The tracking endpoints are called cross-origin by the snippet on hotel
  // websites with no auth — they must stay public (scoped by the public siteId).
  "/api/track(.*)",
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
    return NextResponse.next();
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
