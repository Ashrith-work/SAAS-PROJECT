"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  verifySharePassword,
  signUnlock,
  unlockCookieName,
} from "@/lib/share";

export type UnlockState = { error: string | null };

/**
 * Validates the password for a share link and, on success, drops a signed,
 * HTTP-only unlock cookie scoped to that link's path, then redirects back to it.
 * No auth required — this backs the public password gate at /share/[uuid].
 */
export async function unlockShare(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const token = ((formData.get("token") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";
  if (!token) return { error: "This link is invalid." };
  // Defensive cap so a hostile request can't force expensive hash work.
  if (password.length > 1024) return { error: "Password is too long." };

  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: { passwordHash: true, revokedAt: true, expiresAt: true },
  });

  if (!link || link.revokedAt || link.expiresAt < new Date()) {
    return { error: "This link is no longer available." };
  }
  // No password set — nothing to unlock.
  if (link.passwordHash && !verifySharePassword(password, link.passwordHash)) {
    return { error: "Incorrect password. Please try again." };
  }

  const jar = await cookies();
  jar.set(unlockCookieName(token), signUnlock(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/share/${token}`,
    maxAge: 60 * 60 * 24 * 30, // 30 days, matching the link TTL
  });

  redirect(`/share/${token}`);
}
