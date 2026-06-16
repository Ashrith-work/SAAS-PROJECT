import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

// Fully public — hotels and agencies both reach this to grab the PDFs.
export const dynamic = "force-static";

const PUBLIC_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.hoteltrack.in"
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_URL),
  title: "Documentation & Guides — HotelTrack",
  description:
    "Download HotelTrack documentation for your hotel and your team.",
  alternates: { canonical: "/setup-guide/downloads" },
};

type Guide = {
  title: string;
  subtitle: string;
  description: string;
  href: string;
  meta: string;
  icon: React.ReactNode;
};

// Inline SVGs (lucide-react isn't a project dependency — the rest of the app
// uses inline icons, so we stay consistent). Shapes mirror lucide BookOpen /
// PlugZap as the brief requested.
const BookOpen = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
    aria-hidden
  >
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </svg>
);

const PlugZap = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
    aria-hidden
  >
    <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" />
    <path d="m2 22 3-3" />
    <path d="M7.5 13.5 10 11" />
    <path d="M10.5 16.5 13 14" />
    <path d="m18 3-4 4h6l-4 4" />
  </svg>
);

const GUIDES: Guide[] = [
  {
    title: "Hotel Owner Guide",
    subtitle: "For hotel owners reading their dashboard",
    description:
      "A friendly guide explaining how to read your HotelTrack dashboard — Performance Summary, Revenue by Source, OTA Savings, Visitor Journeys, and more. Plain English, no jargon.",
    href: "/docs/HotelTrack_Hotel_Owner_Guide.pdf",
    meta: "PDF • 30 KB • 18 pages",
    icon: BookOpen,
  },
  {
    title: "Integration Setup Guide",
    subtitle: "Step-by-step setup instructions",
    description:
      "Complete walkthrough of installing the HotelTrack snippet, connecting Meta Ads (long-lived token), Instagram (tester invite + OAuth), and Google Analytics 4. Includes troubleshooting.",
    href: "/docs/HotelTrack_Integration_Guide.pdf",
    meta: "PDF • 35 KB • 18 pages",
    icon: PlugZap,
  },
];

const DownloadIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="h-4 w-4"
    aria-hidden
  >
    <path
      d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function GuideCard({ guide }: { guide: Guide }) {
  return (
    <div className="group flex flex-col rounded-2xl border border-line bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-white">
        {guide.icon}
      </span>

      <h2 className="mt-5 text-xl font-bold tracking-tight text-ink">
        {guide.title}
      </h2>
      <p className="mt-1 text-sm font-medium text-brand">{guide.subtitle}</p>

      <p className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-secondary">
        {guide.description}
      </p>

      <div className="mt-6 flex items-center justify-between gap-3">
        <a
          href={guide.href}
          target="_blank"
          rel="noopener"
          className={buttonClass("primary", "md")}
        >
          {DownloadIcon}
          Download PDF
        </a>
        <span className="text-xs text-ink-tertiary">{guide.meta}</span>
      </div>
    </div>
  );
}

export default function DocumentationDownloadsPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      {/* Top bar — matches the setup-guide header */}
      <header className="border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-black text-white">
              H
            </span>
            <span className="text-base font-bold tracking-tight text-ink">
              HotelTrack
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Page header */}
        <div className="max-w-2xl">
          <h1 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">
            Documentation &amp; Guides
          </h1>
          <p className="mt-3 text-lg text-ink-secondary">
            Download HotelTrack documentation for your hotel and your team
          </p>
        </div>

        {/* Cards — side-by-side on desktop, stacked on mobile */}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {GUIDES.map((guide) => (
            <GuideCard key={guide.title} guide={guide} />
          ))}
        </div>

        {/* Footer note */}
        <p className="mt-10 text-sm text-ink-tertiary">
          Can&apos;t find what you need? Contact your agency or email{" "}
          <a
            href="mailto:support@hoteltrack.in"
            className="font-medium text-brand hover:underline"
          >
            support@hoteltrack.in
          </a>
        </p>
      </main>
    </div>
  );
}
