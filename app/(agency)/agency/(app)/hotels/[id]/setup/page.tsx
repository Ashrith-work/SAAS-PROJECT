import { redirect } from "next/navigation";

// The per-hotel integration setup now lives at /agency/hotel/[id]/integrations
// (the single source of truth for the snippet, Meta, Instagram and GA4
// connections). This route is kept as a permanent redirect so old links and
// bookmarks keep working.
export default async function LegacyHotelSetupRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/agency/hotel/${id}/integrations`);
}
