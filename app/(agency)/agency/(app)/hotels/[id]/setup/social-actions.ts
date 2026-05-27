"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptToken, decryptToken } from "@/lib/encryption";
import {
  connectInstagramAccount,
  getAccountInsights,
  getMediaInsights,
  getTokenExpiry,
  InstagramAuthError,
  InstagramSetupError,
  type IgAccount,
} from "@/lib/instagram";

const DAY_MS = 86_400_000;

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
    select: { id: true, igUserId: true, encryptedToken: true },
  });
  if (!account) {
    return { error: "Connect an Instagram account first.", ok: false, message: null };
  }

  let token: string;
  try {
    token = decryptToken(account.encryptedToken);
  } catch {
    return { error: "Stored token couldn't be read. Please reconnect.", ok: false, message: null };
  }

  const until = new Date();
  const since = new Date(until.getTime() - 29 * DAY_MS);

  try {
    const insights = await getAccountInsights(token, account.igUserId, { since, until });
    for (const day of insights.daily) {
      const date = new Date(`${day.date}T00:00:00.000Z`);
      const data = {
        followers: day.followers,
        reach: day.reach,
        impressions: day.impressions,
        profileViews: day.profileViews,
        engagement: 0, // account-level engagement isn't fetched; it lives on posts
      };
      await prisma.socialSnapshot.upsert({
        where: { hotelClientId_date: { hotelClientId: ctx.hotelId, date } },
        create: { agencyId: ctx.agencyId, hotelClientId: ctx.hotelId, date, ...data },
        update: data,
      });
    }

    const posts = await getMediaInsights(token, account.igUserId, 12);
    for (const p of posts) {
      const data = {
        agencyId: ctx.agencyId,
        caption: p.caption,
        mediaType: p.mediaType,
        permalink: p.permalink,
        postedAt: p.timestamp ? new Date(p.timestamp) : null,
        impressions: p.impressions,
        reach: p.reach,
        engagement: p.engagement,
        saves: p.saves,
        shares: p.shares,
        videoViews: p.videoViews,
        fetchedAt: new Date(),
      };
      await prisma.postSnapshot.upsert({
        where: { hotelClientId_mediaId: { hotelClientId: ctx.hotelId, mediaId: p.mediaId } },
        create: { hotelClientId: ctx.hotelId, mediaId: p.mediaId, ...data },
        update: data,
      });
    }

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), status: "connected" },
    });

    revalidatePath(`/agency/hotels/${ctx.hotelId}/setup`);
    return {
      error: null,
      ok: true,
      message: `Synced ${insights.followers.toLocaleString()} followers and ${posts.length} recent posts.`,
    };
  } catch (err) {
    if (err instanceof InstagramAuthError) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: "disconnected" },
      });
      return { error: err.message, ok: false, message: null };
    }
    return { error: igErrorMessage(err), ok: false, message: null };
  }
}
