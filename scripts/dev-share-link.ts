import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";

// Inlined here (rather than imported from lib/hotel-share) because that module is
// "server-only" and can't load under tsx. Mirrors generateShareToken/hotelShareUrl.
const generateShareToken = () => randomBytes(32).toString("hex");
const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.hoteltrack.in").replace(/\/+$/, "");
const hotelShareUrl = (token: string) => `${baseUrl}/h/${token}`;

// Dev helper for the hotel-owner share link.
//   tsx scripts/dev-share-link.ts                 → list hotels + their tokens
//   tsx scripts/dev-share-link.ts gen <hotelId>   → (re)generate a share token
//   tsx scripts/dev-share-link.ts revoke <hotelId>→ revoke the current token
async function main() {
  const [cmd, hotelId] = process.argv.slice(2);

  if (cmd === "gen" && hotelId) {
    const token = generateShareToken();
    await prisma.hotelClient.update({
      where: { id: hotelId },
      data: { shareToken: token, shareTokenCreatedAt: new Date(), shareTokenRevoked: false },
    });
    console.log("Generated share link:");
    console.log("  " + hotelShareUrl(token));
    return;
  }

  if (cmd === "revoke" && hotelId) {
    await prisma.hotelClient.update({
      where: { id: hotelId },
      data: { shareTokenRevoked: true },
    });
    console.log("Revoked share token for hotel " + hotelId);
    return;
  }

  const hotels = await prisma.hotelClient.findMany({
    select: {
      id: true,
      name: true,
      agency: { select: { name: true } },
      shareToken: true,
      shareTokenRevoked: true,
      showAdSpendToHotel: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${hotels.length} hotel(s):`);
  for (const h of hotels) {
    console.log(
      `  ${h.id}  ${h.name}  [agency: ${h.agency.name}]  token: ${
        h.shareToken ? (h.shareTokenRevoked ? "revoked" : "active") : "none"
      }  adSpend: ${h.showAdSpendToHotel}`,
    );
    if (h.shareToken && !h.shareTokenRevoked) console.log(`      ${hotelShareUrl(h.shareToken)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
