import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OnboardingClient } from "./OnboardingClient";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.agencyMember.findUnique({
    where: { clerkId: userId },
  });
  const user = await currentUser();
  const suggestedName = user?.firstName
    ? `${user.firstName}'s Agency`
    : "My Agency";

  return (
    <main className="flex flex-1 items-center justify-center py-12">
      <OnboardingClient
        alreadyMember={Boolean(member)}
        suggestedName={suggestedName}
      />
    </main>
  );
}
