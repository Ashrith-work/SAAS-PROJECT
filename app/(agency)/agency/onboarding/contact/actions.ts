"use server";

import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agencyScoped } from "@/lib/tenant";
import { validateAgencyContact, type ContactFormState } from "@/lib/agency-validation";

/**
 * Required contact step for new signups. Validates + normalizes all five fields,
 * saves them to the caller's agency, then signals the client to continue to the
 * dashboard. Agency-scoped: only ever updates the signed-in member's own agency.
 */
export async function saveAgencyContactSignup(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const member = await getCurrentMember();
  if (!member) {
    return { ok: false, formError: "Your session has expired — please sign in again." };
  }

  const result = validateAgencyContact({
    mobile: String(formData.get("mobile") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    whatsappNumber: String(formData.get("whatsappNumber") ?? ""),
    address: String(formData.get("address") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
  });
  if (!result.ok) return { ok: false, errors: result.errors };

  await agencyScoped(prisma.agency).update({
    where: { id: member.agencyId },
    data: result.data,
  });

  return { ok: true, redirectTo: "/agency/dashboard" };
}
