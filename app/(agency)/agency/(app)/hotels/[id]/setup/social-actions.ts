"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/encryption";
import {
  connectInstagramAccount,
  getTokenExpiry,
  InstagramAuthError,
  InstagramSetupError,
  type IgAccount,
} from "@/lib/instagram";
import { syncSocialAccount } from "@/lib/social-sync";

// Verifies the hotel belongs to the signed-in agency (multi-tenant guard).
async function ownedHotel(hotelId: string) {
  const member = await getCurrentMember();
  if (!member) return null;
  const hotel = await prisma.hotelClient.findFirst({
    where: { id: hotelId, agencyId: member.agencyId },
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

  await prisma.socialAccount.upsert({
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

  await prisma.socialAccount.deleteMany({
    where: { agencyId: ctx.agencyId, hotelClientId: ctx.hotelId, platform: "instagram" },
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

  const account = await prisma.socialAccount.findFirst({
    where: { agencyId: ctx.agencyId, hotelClientId: ctx.hotelId, platform: "instagram" },
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
