import "dotenv/config";
import { createClerkClient } from "@clerk/backend";
import { prisma } from "../lib/prisma";

// Attach an existing Clerk user (by email) to a demo agency as admin, without
// disturbing other members. Use after a teammate has signed up via /sign-up,
// when you want them to see the seeded demo data instead of being routed to
// the onboarding flow / their own new agency.
//
// Usage:
//   npx tsx scripts/attach-member.ts <email>                # attach to Coastal Digital Agency
//   npx tsx scripts/attach-member.ts <email> "Mountain Media"
//
// After running, the user should sign out and back in so their session token
// reflects the new membership.

async function main() {
  const email = process.argv[2];
  const agencyName = process.argv[3] ?? "Coastal Digital Agency";

  if (!email) {
    console.error('Usage: npx tsx scripts/attach-member.ts <email> ["Agency Name"]');
    process.exit(1);
  }
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("CLERK_SECRET_KEY is not set in your environment.");
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey });
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });
  const user = data[0];
  if (!user) {
    console.error(
      `No Clerk user found with email ${email}.\n` +
        `  Have them sign up at http://localhost:3001/sign-up first, then re-run this.`,
    );
    process.exit(1);
  }

  const agency = await prisma.agency.findFirst({ where: { name: agencyName }, select: { id: true } });
  if (!agency) {
    console.error(`No agency named "${agencyName}". Run \`npm run seed\` first.`);
    process.exit(1);
  }

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    email.split("@")[0];

  await prisma.agencyMember.upsert({
    where: { clerkId: user.id },
    update: { agencyId: agency.id, role: "admin", email, name },
    create: { clerkId: user.id, agencyId: agency.id, role: "admin", email, name },
  });

  console.log(
    `✓ Attached ${email} (${user.id}) to "${agencyName}" as admin.\n` +
      "  Sign out and back in to refresh the session token, then open /agency.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
