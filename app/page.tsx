import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">HotelTrack</h1>
        <p className="mt-2 text-zinc-500">
          Prove your content drives real hotel bookings.
        </p>
      </div>

      <Show when="signed-out">
        <div className="flex gap-3">
          <Link
            href="/sign-up"
            className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Sign in
          </Link>
        </div>
      </Show>

      <Show when="signed-in">
        <div className="flex items-center gap-4">
          <Link
            href="/agency/dashboard"
            className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Go to dashboard
          </Link>
          <UserButton />
        </div>
      </Show>
    </main>
  );
}
