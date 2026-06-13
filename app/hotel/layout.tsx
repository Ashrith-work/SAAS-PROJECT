import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

// Minimal shell for the hotel-owner area. No agency nav — hotel owners only ever
// see their own hotel's dashboard. Per-hotel access is enforced inside each page.
export default function HotelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-semibold text-ink">HotelTrack</Link>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
