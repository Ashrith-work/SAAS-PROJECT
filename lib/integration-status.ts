// Single source of truth for "is this hotel integration connected / broken /
// expiring" logic, shared by the integrations page (badges + summary), the
// hotel-clients list (status dots) and the hotel dashboard (warning banner).
//
// The pure *State helpers are deterministic and side-effect free (take `now` as
// an argument) so they're trivially testable. The load* helpers do the
// agency-scoped DB reads. NOTHING here selects token ciphertext — only status,
// timestamps and ids — so it's safe to call from any server component.

import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { planHasGa4 } from "@/lib/plans";

const DAY_MS = 86_400_000;
const EXPIRY_WARNING_MS = 14 * DAY_MS;

export type IntegrationTone = "gray" | "green" | "yellow" | "red";

export type SnippetState = "not_installed" | "awaiting" | "live";
export type TokenState = "not_connected" | "connected" | "expiring" | "expired";
export type GaState = "not_connected" | "connected" | "broken" | "gated";

// A Meta token stores a year-2999 sentinel for non-expiring (system-user) tokens
// — see settings/actions.ts. Treat anything past ~2900 as "never expires".
function neverExpires(d: Date): boolean {
  return d.getUTCFullYear() >= 2900;
}

function tokenStateFrom(
  status: string,
  tokenExpiresAt: Date | null,
  now: Date,
): TokenState {
  // A row that isn't "connected" means a previously connected token expired or
  // was revoked (we never persist a token that didn't validate).
  if (status !== "connected") return "expired";
  if (!tokenExpiresAt || neverExpires(tokenExpiresAt)) return "connected";
  const ms = tokenExpiresAt.getTime() - now.getTime();
  if (ms <= 0) return "expired";
  if (ms <= EXPIRY_WARNING_MS) return "expiring";
  return "connected";
}

// ── Per-integration state ─────────────────────────────────────────────────────

export function snippetState(
  snippetStatus: string,
  lastEventAt: Date | null,
): SnippetState {
  if (snippetStatus === "live") return "live";
  // We've received events at some point but it isn't "live" yet → awaiting.
  if (lastEventAt) return "awaiting";
  if (snippetStatus === "not_installed") return "not_installed";
  // "error" / any other installed-but-not-firing value → awaiting first event.
  return "awaiting";
}

export function metaState(
  token: { status: string; tokenExpiresAt: Date } | null,
  now: Date,
): TokenState {
  if (!token) return "not_connected";
  return tokenStateFrom(token.status, token.tokenExpiresAt, now);
}

export function instagramState(
  conn: { status: string; tokenExpiresAt: Date | null } | null,
  now: Date,
): TokenState {
  // IGAA connections: "active" is healthy; "error" needs a reconnect; rows from
  // the retired EAA flow ("deprecated_eaa") count as never connected. The
  // weekly refresh cron rolls tokens before expiry, so "expiring" is rare.
  if (!conn || conn.status === "deprecated_eaa") return "not_connected";
  if (conn.status !== "active") return "expired";
  return tokenStateFrom("connected", conn.tokenExpiresAt, now);
}

export function gaState(
  conn: { status: string } | null,
  planAllowsGa4: boolean,
): GaState {
  if (!planAllowsGa4) return "gated";
  if (!conn) return "not_connected";
  return conn.status === "connected" ? "connected" : "broken";
}

// ── Presentation maps ─────────────────────────────────────────────────────────

export function snippetTone(s: SnippetState): IntegrationTone {
  return s === "live" ? "green" : s === "awaiting" ? "yellow" : "gray";
}

export function tokenTone(s: TokenState): IntegrationTone {
  return s === "connected"
    ? "green"
    : s === "expiring"
      ? "yellow"
      : s === "expired"
        ? "red"
        : "gray";
}

export function gaTone(s: GaState): IntegrationTone {
  return s === "connected" ? "green" : s === "broken" ? "red" : "gray";
}

export const SNIPPET_LABELS: Record<SnippetState, string> = {
  not_installed: "Not Installed",
  awaiting: "Installed — Awaiting First Event",
  live: "Live",
};

export const TOKEN_LABELS: Record<TokenState, string> = {
  not_connected: "Not Connected",
  connected: "Connected",
  expiring: "Token Expiring Soon",
  expired: "Token Expired — Reconnect Needed",
};

export const GA_LABELS: Record<GaState, string> = {
  not_connected: "Not Connected",
  connected: "Connected",
  broken: "Broken — Reconnect Needed",
  gated: "Requires Growth",
};

// Tailwind dot colors for the list rows. Full literals so Tailwind keeps them.
export const TONE_DOT: Record<IntegrationTone, string> = {
  gray: "bg-zinc-300 dark:bg-zinc-600",
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

// ── Aggregate per-hotel status ────────────────────────────────────────────────

export type HotelStates = {
  snippet: SnippetState;
  meta: TokenState;
  instagram: TokenState;
  ga: GaState;
  /** Snippet hidden in Pixel mode (no /t.js snippet to install). */
  snippetApplies: boolean;
  planAllowsGa4: boolean;
};

export type HotelStatusSummary = HotelStates & {
  connectedCount: number;
  total: number;
  /** Drives the dashboard warning banner — "broken or expired" only. */
  anyBrokenOrExpired: boolean;
};

export function summarize(states: HotelStates): HotelStatusSummary {
  const connected: boolean[] = [];
  // Snippet counts only when applicable (i.e. not in Pixel mode).
  if (states.snippetApplies) connected.push(states.snippet === "live");
  connected.push(states.meta === "connected" || states.meta === "expiring");
  connected.push(
    states.instagram === "connected" || states.instagram === "expiring",
  );
  // GA4 only counts toward the total when the plan includes it.
  if (states.planAllowsGa4) connected.push(states.ga === "connected");

  const anyBrokenOrExpired =
    states.meta === "expired" ||
    states.instagram === "expired" ||
    (states.planAllowsGa4 && states.ga === "broken");

  return {
    ...states,
    connectedCount: connected.filter(Boolean).length,
    total: connected.length,
    anyBrokenOrExpired,
  };
}

// ── Loaders ───────────────────────────────────────────────────────────────────

/**
 * Loads the four integration states for a single hotel. Used by the dashboard
 * (banner) and as the badge source for the integrations page. `snippetApplies`
 * is false in Pixel mode. All reads are agency-scoped (multi-tenant safe).
 */
export async function loadHotelStates(opts: {
  hotelId: string;
  snippetStatus: string;
  lastEventAt: Date | null;
  plan: string;
  pixelMode: boolean;
}): Promise<HotelStatusSummary> {
  const { hotelId, snippetStatus, lastEventAt, plan, pixelMode } = opts;
  const planAllowsGa4 = planHasGa4(plan);
  const now = new Date();

  const [token, social, ga] = await Promise.all([
    agencyScoped(prisma.metaToken).findFirst({
      where: { hotelClientId: hotelId },
      select: { status: true, tokenExpiresAt: true },
    }),
    agencyScoped(prisma.instagramConnection).findFirst({
      where: { hotelClientId: hotelId, tokenType: "igaa_direct" },
      select: { status: true, tokenExpiresAt: true },
    }),
    agencyScoped(prisma.googleAnalyticsConnection).findFirst({
      where: { hotelClientId: hotelId },
      select: { status: true },
    }),
  ]);

  return summarize({
    snippet: snippetState(snippetStatus, lastEventAt),
    meta: metaState(token, now),
    instagram: instagramState(social, now),
    ga: gaState(ga, planAllowsGa4),
    snippetApplies: !pixelMode,
    planAllowsGa4,
  });
}

/**
 * Batched per-hotel states for the hotel-clients list, avoiding N+1: the Meta
 * token is agency-wide (one query), Instagram + GA are loaded for all listed
 * hotels at once. Returns a map keyed by hotel id.
 */
export async function loadListStates(
  hotels: { id: string; snippetStatus: string; lastEventAt: Date | null }[],
  plan: string,
  pixelMode: boolean,
): Promise<Map<string, HotelStatusSummary>> {
  const planAllowsGa4 = planHasGa4(plan);
  const now = new Date();
  const ids = hotels.map((h) => h.id);

  const [tokens, socials, gas] =
    ids.length === 0
      ? [[], [], []]
      : await Promise.all([
          // Meta tokens are hotel-scoped now: load one per hotel in a single
          // batched query (no N+1) instead of a single agency-wide token.
          agencyScoped(prisma.metaToken).findMany({
            where: { hotelClientId: { in: ids } },
            select: { hotelClientId: true, status: true, tokenExpiresAt: true },
          }),
          agencyScoped(prisma.instagramConnection).findMany({
            where: { hotelClientId: { in: ids }, tokenType: "igaa_direct" },
            select: { hotelClientId: true, status: true, tokenExpiresAt: true },
          }),
          agencyScoped(prisma.googleAnalyticsConnection).findMany({
            where: { hotelClientId: { in: ids } },
            select: { hotelClientId: true, status: true },
          }),
        ]);

  const tokenByHotel = new Map(tokens.map((t) => [t.hotelClientId, t]));
  const socialByHotel = new Map(socials.map((s) => [s.hotelClientId, s]));
  const gaByHotel = new Map(gas.map((g) => [g.hotelClientId, g]));

  const out = new Map<string, HotelStatusSummary>();
  for (const h of hotels) {
    out.set(
      h.id,
      summarize({
        snippet: snippetState(h.snippetStatus, h.lastEventAt),
        meta: metaState(tokenByHotel.get(h.id) ?? null, now),
        instagram: instagramState(socialByHotel.get(h.id) ?? null, now),
        ga: gaState(gaByHotel.get(h.id) ?? null, planAllowsGa4),
        snippetApplies: !pixelMode,
        planAllowsGa4,
      }),
    );
  }
  return out;
}
