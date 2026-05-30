"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { encryptToken, decryptToken } from "@/lib/encryption";
import {
  connectInstagramAccount,
  getTokenExpiry,
  InstagramAuthError,
  InstagramSetupError,
  isInstagramLoginToken,
  testInstagramConnection,
  type IgAccount,
} from "@/lib/instagram";
import { syncSocialAccount } from "@/lib/social-sync";

// Tokens beginning with "IGAA" come from the "Instagram API with Instagram
// Login" flow (graph.instagram.com) and are not compatible with our Graph API
// client. Reject before any network call so the agency gets a clear, actionable
// error instead of an opaque Graph failure. See lib/instagram.ts header.
const IGAA_REJECTION =
  "This looks like an \"Instagram API with Instagram Login\" token (starts with " +
  "\"IGAA…\"). That flow uses graph.instagram.com and isn't compatible with " +
  "HotelTrack. Please generate a Facebook Graph API token instead, from " +
  "Meta for Developers → your Facebook app → Tools → Graph API Explorer. " +
  "The token will start with \"EAA…\". See the \"How to get this token\" guide " +
  "on this page for the full steps.";

// Verifies the hotel belongs to the signed-in agency (multi-tenant guard).
async function ownedHotel(hotelId: string) {
  const member = await getCurrentMember();
  if (!member) return null;
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelId },
    select: { id: true },
  });
  return hotel ? { agencyId: member.agencyId, hotelId: hotel.id } : null;
}

// Maps an Instagram client error to a user-facing message (never leaks token).
function igErrorMessage(err: unknown): string {
  if (err instanceof InstagramSetupError) return err.message;
  if (err instanceof InstagramAuthError) return err.message;
  if (err instanceof Error) return err.message;
  return "Couldn't reach Instagram. Please try again.";
}

// ── Phase 1: resolve the IG accounts a pasted token can manage ───────────────

export type IgAccountOption = {
  igUserId: string;
  username: string;
  pageName: string;
  followersCount: number;
};

export type FindAccountsState = {
  error: string | null;
  accounts: IgAccountOption[];
};

export async function findInstagramAccounts(
  _prev: FindAccountsState,
  formData: FormData,
): Promise<FindAccountsState> {
  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const token = ((formData.get("token") as string | null) ?? "").trim();

  const ctx = await ownedHotel(hotelId);
  if (!ctx) return { error: "That hotel wasn't found for your agency.", accounts: [] };
  if (!token) return { error: "Paste an access token first.", accounts: [] };
  if (isInstagramLoginToken(token)) return { error: IGAA_REJECTION, accounts: [] };

  try {
    const accounts = await connectInstagramAccount(token);
    return {
      error: null,
      accounts: accounts.map((a) => ({
        igUserId: a.igUserId,
        username: a.username,
        pageName: a.pageName,
        followersCount: a.followersCount,
      })),
    };
  } catch (err) {
    return { error: igErrorMessage(err), accounts: [] };
  }
}

// ── Phase 2: store the chosen account (encrypted) ────────────────────────────

export type LinkState = { error: string | null; ok: boolean };

export async function linkInstagramAccount(
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const token = ((formData.get("token") as string | null) ?? "").trim();
  const igUserId = ((formData.get("igUserId") as string | null) ?? "").trim();

  const ctx = await ownedHotel(hotelId);
  if (!ctx) return { error: "That hotel wasn't found for your agency.", ok: false };
  if (!token || !igUserId) return { error: "Missing token or account selection.", ok: false };
  if (isInstagramLoginToken(token)) return { error: IGAA_REJECTION, ok: false };

  // Re-resolve server-side; never trust the client's igUserId — it must be one
  // this token actually manages.
  let chosen: IgAccount | undefined;
  try {
    const accounts = await connectInstagramAccount(token);
    chosen = accounts.find((a) => a.igUserId === igUserId);
  } catch (err) {
    return { error: igErrorMessage(err), ok: false };
  }
  if (!chosen) {
    return { error: "That Instagram account isn't available on this token.", ok: false };
  }

  const tokenExpiresAt = await getTokenExpiry(token);

  await agencyScoped(prisma.socialAccount).upsert({
    // Compound unique key, ownership-verified above — tenant-safe for upsert.
    where: { hotelClientId_platform: { hotelClientId: ctx.hotelId, platform: "instagram" } },
    create: {
      agencyId: ctx.agencyId,
      hotelClientId: ctx.hotelId,
      platform: "instagram",
      igUserId: chosen.igUserId,
      username: chosen.username,
      encryptedToken: encryptToken(token),
      tokenExpiresAt,
      status: "connected",
    },
    update: {
      igUserId: chosen.igUserId,
      username: chosen.username,
      encryptedToken: encryptToken(token),
      tokenExpiresAt,
      status: "connected",
    },
  });

  revalidatePath(`/agency/hotels/${ctx.hotelId}/setup`);
  return { error: null, ok: true };
}

// ── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectSocialAccount(formData: FormData): Promise<void> {
  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const ctx = await ownedHotel(hotelId);
  if (!ctx) return;

  await agencyScoped(prisma.socialAccount).deleteMany({
    where: { hotelClientId: ctx.hotelId, platform: "instagram" },
  });
  revalidatePath(`/agency/hotels/${ctx.hotelId}/setup`);
}

// ── Sync now: fetch insights and store snapshots ─────────────────────────────

export type SyncState = { error: string | null; ok: boolean; message: string | null };

export async function syncSocialInsights(
  _prev: SyncState,
  formData: FormData,
): Promise<SyncState> {
  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const ctx = await ownedHotel(hotelId);
  if (!ctx) return { error: "That hotel wasn't found for your agency.", ok: false, message: null };

  const account = await agencyScoped(prisma.socialAccount).findFirst({
    where: { hotelClientId: ctx.hotelId, platform: "instagram" },
    select: {
      id: true,
      agencyId: true,
      hotelClientId: true,
      igUserId: true,
      encryptedToken: true,
    },
  });
  if (!account) {
    return { error: "Connect an Instagram account first.", ok: false, message: null };
  }

  // Reuse the shared engine (also used by the cron). One account, so no spacing.
  const res = await syncSocialAccount(account, { perRequestDelayMs: 0 });
  revalidatePath(`/agency/hotels/${ctx.hotelId}/setup`);

  if (res.ok) {
    return {
      error: null,
      ok: true,
      message: `Synced ${(res.followers ?? 0).toLocaleString()} followers and ${res.postsSynced ?? 0} recent posts.`,
    };
  }
  return { error: res.error ?? "Sync failed.", ok: false, message: null };
}

// ── Test connection: live Graph call from the stored token ───────────────────

export type TestConnectionState = {
  error: string | null;
  ok: boolean;
  username: string | null;
  followersCount: number | null;
};

export async function testInstagramConnectionAction(
  _prev: TestConnectionState,
  formData: FormData,
): Promise<TestConnectionState> {
  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const ctx = await ownedHotel(hotelId);
  if (!ctx) {
    return {
      error: "That hotel wasn't found for your agency.",
      ok: false,
      username: null,
      followersCount: null,
    };
  }

  const account = await agencyScoped(prisma.socialAccount).findFirst({
    where: { hotelClientId: ctx.hotelId, platform: "instagram" },
    select: { igUserId: true, encryptedToken: true },
  });
  if (!account) {
    return {
      error: "Connect an Instagram account first.",
      ok: false,
      username: null,
      followersCount: null,
    };
  }

  let token: string;
  try {
    token = decryptToken(account.encryptedToken);
  } catch {
    return {
      error: "Stored token could not be decrypted. Please reconnect.",
      ok: false,
      username: null,
      followersCount: null,
    };
  }

  try {
    const probe = await testInstagramConnection(token, account.igUserId);
    return {
      error: null,
      ok: true,
      username: probe.username,
      followersCount: probe.followersCount,
    };
  } catch (err) {
    return {
      error: igErrorMessage(err),
      ok: false,
      username: null,
      followersCount: null,
    };
  }
}
