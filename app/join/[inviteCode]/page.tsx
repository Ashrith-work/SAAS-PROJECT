import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { JoinSignupForm } from "./JoinSignupForm";

// Public hotel self-signup page. No login required to view; resolves the agency
// from the invite code and renders the signup form. Disabled / unknown codes get
// a neutral error (we never reveal which agency a bad code might belong to).

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Join your agency · HotelTrack",
  robots: { index: false, follow: false },
};

function InvalidInvite() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-disabled">HotelTrack</p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">This invite link is invalid or disabled</h1>
      <p className="mt-2 text-sm text-ink-tertiary">
        Please double-check the link, or contact your marketing agency for a new one.
      </p>
    </main>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = await params;

  const agency = await prisma.agency.findUnique({
    where: { inviteCode },
    select: { name: true, inviteCodeStatus: true, suspendedAt: true },
  });
  if (!agency || agency.inviteCodeStatus === "DISABLED" || agency.suspendedAt) {
    return <InvalidInvite />;
  }

  const { userId } = await auth();

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-10 sm:py-14">
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-disabled">HotelTrack</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
          You&apos;ve been invited by {agency.name}
        </h1>
        <p className="mt-2 text-sm text-ink-tertiary">
          {agency.name} uses HotelTrack to track marketing performance for hotels. Sign up to access
          your hotel&apos;s dashboard, see your booking attribution, and stay connected with your agency.
        </p>
      </div>
      <JoinSignupForm inviteCode={inviteCode} agencyName={agency.name} alreadyAuthed={!!userId} />
    </main>
  );
}
