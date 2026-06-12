"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { isFunnelStage, type FunnelRule } from "@/lib/funnel";

export type FunnelRulesState = { error: string | null; ok: boolean };

/**
 * Saves a hotel's funnel-stage URL rules (HotelClient.funnelStageRules). Rules
 * arrive as a JSON string in the form's `rules` field; each must have a non-empty
 * urlPattern and a valid stage. Multi-tenant: the hotel is verified against the
 * caller's agency.
 */
export async function saveFunnelRules(
  _prev: FunnelRulesState,
  formData: FormData,
): Promise<FunnelRulesState> {
  const member = await getCurrentMember();
  if (!member) return { error: "Your session has expired — please sign in again.", ok: false };

  const hotelId = ((formData.get("hotelId") as string | null) ?? "").trim();
  const hotel = await agencyScoped(prisma.hotelClient).findFirst({
    where: { id: hotelId },
    select: { id: true },
  });
  if (!hotel) return { error: "That hotel client wasn't found for your agency.", ok: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse((formData.get("rules") as string | null) ?? "[]");
  } catch {
    return { error: "Couldn't read the funnel rules. Please try again.", ok: false };
  }
  if (!Array.isArray(parsed)) return { error: "Funnel rules must be a list.", ok: false };

  const rules: FunnelRule[] = [];
  for (const raw of parsed) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const urlPattern = typeof r.urlPattern === "string" ? r.urlPattern.trim().slice(0, 200) : "";
    const stage = r.stage;
    if (!urlPattern) return { error: "Every rule needs a non-empty URL pattern.", ok: false };
    if (!isFunnelStage(stage)) return { error: "Every rule needs a valid stage.", ok: false };
    rules.push({ urlPattern, stage });
  }
  if (rules.length > 50) return { error: "Too many rules (max 50).", ok: false };

  await agencyScoped(prisma.hotelClient).update({
    where: { id: hotel.id },
    // Empty list clears the rules (SQL NULL so the funnel falls back cleanly).
    data: { funnelStageRules: rules.length ? rules : Prisma.DbNull },
  });

  revalidatePath(`/agency/hotel/${hotel.id}/integrations`);
  revalidatePath(`/agency/hotel/${hotel.id}`);
  revalidatePath(`/agency/hotel/${hotel.id}/journeys`);
  return { error: null, ok: true };
}
