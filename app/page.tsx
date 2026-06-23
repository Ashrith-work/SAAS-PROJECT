import Link from "next/link";
import { redirect } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import { Show, UserButton } from "@clerk/nextjs";
import {
  Unplug,
  EyeOff,
  HelpCircle,
  TrendingUp,
  Route,
  Filter,
  BadgePercent,
  Target,
  Code2,
  PlugZap,
  LayoutDashboard,
  ArrowRight,
  Mail,
} from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getPlatformRole } from "@/lib/auth";

// Public marketing landing page for HotelTrack. This is the ONLY app surface that
// renders for logged-out visitors (it sits in the proxy's isPublicRoute list).
// It is fully driven by the design tokens in globals.css (blue brand + gold
// accent), so it follows light/dark like the rest of the app. Deep panels use the
// `band` tokens, which stay dark in both themes; small gold text uses `accent-soft`
// (a lighter gold) so it holds WCAG AA on the band.
//
// Hotel owners (hotel_client) who reach here — directly or after being bounced
// off an agency-only route by the proxy — are forwarded to their own hotel
// dashboard, carrying any "agency-restricted" notice so the dashboard can explain
// why they were redirected. Everyone else (signed-out OR agency/admin) sees the
// landing page; signed-in users get a "Go to dashboard" link in place of Sign in.

export const dynamic = "force-dynamic";

// Serif display face for headlines (Playfair) — scoped to this page via the CSS
// variable below, so the rest of the app's Inter typography is untouched.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});

const serif = { fontFamily: "var(--font-playfair), Georgia, 'Times New Roman', serif" };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { userId } = await auth();
  if (userId) {
    const role = await getPlatformRole();
    if (role === "hotel_client") {
      const hotel = await prisma.hotelClient.findFirst({
        where: { createdByUserId: userId, deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (hotel) {
        const sp = await searchParams;
        const notice = sp.notice === "agency-restricted" ? "?notice=agency-restricted" : "";
        redirect(`/hotel/${hotel.id}/dashboard${notice}`);
      }
    }
  }

  return (
    <div className={`${playfair.variable} min-h-screen bg-page text-ink`}>
      {/* Local keyframes for the hero's animated grid + glow. Scoped by the ht-*
          prefix; colors reference the accent/brand tokens so they follow theme. */}
      <style>{HERO_STYLES}</style>

      {/* ── Top nav ─────────────────────────────────────────────────────────── */}
      <header className="absolute inset-x-0 top-0 z-20">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-8"
        >
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-band-ink"
            aria-label="HotelTrack home"
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-base font-bold text-on-accent"
            >
              H
            </span>
            <span style={serif} className="text-xl">
              HotelTrack
            </span>
          </Link>

          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="rounded-full border border-accent/70 px-5 py-2 text-sm font-medium text-band-ink transition hover:bg-accent hover:text-on-accent"
            >
              Sign in
            </Link>
          </Show>

          <Show when="signed-in">
            <div className="flex items-center gap-4">
              <Link
                href="/agency/dashboard"
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
              >
                Go to dashboard
              </Link>
              <UserButton />
            </div>
          </Show>
        </nav>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-band">
        {/* Animated background: gold grid + two slow-drifting glows. */}
        <div aria-hidden="true" className="ht-hero-bg absolute inset-0 -z-10" />
        <div
          aria-hidden="true"
          className="ht-glow ht-glow-1 absolute -z-10 rounded-full"
        />
        <div
          aria-hidden="true"
          className="ht-glow ht-glow-2 absolute -z-10 rounded-full"
        />

        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-36 text-center sm:px-8 sm:pb-32 sm:pt-44">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-medium tracking-wide text-accent-soft sm:text-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
            Marketing attribution built for hotels
          </span>

          <h1
            style={serif}
            className="mt-8 text-balance text-4xl font-semibold leading-[1.1] text-band-ink sm:text-5xl md:text-6xl"
          >
            Prove which marketing actually drives your{" "}
            <span className="text-accent">direct bookings</span>.
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-band-ink-muted sm:text-lg">
            One dashboard for your website, Meta Ads, Instagram, and Google
            Analytics — see what drives real bookings, and how much OTA commission
            you save.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="#contact"
              className="w-full rounded-full bg-accent px-7 py-3.5 text-center text-sm font-semibold text-on-accent shadow-lg shadow-accent/20 transition hover:-translate-y-0.5 hover:bg-accent-hover sm:w-auto"
            >
              Book a demo
            </Link>
            <Show when="signed-out">
              <Link
                href="/sign-in"
                className="w-full rounded-full border border-band-ink/30 px-7 py-3.5 text-center text-sm font-medium text-band-ink transition hover:border-band-ink/60 hover:bg-white/5 sm:w-auto"
              >
                Sign in
              </Link>
            </Show>
          </div>
        </div>
      </section>

      {/* ── 1. The problem ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>The problem</SectionEyebrow>
          <h2 style={serif} className="mt-4 text-3xl font-semibold sm:text-4xl">
            Hotels can&apos;t connect bookings to the marketing that created them.
          </h2>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PROBLEMS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-line bg-card p-7 shadow-sm"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-tertiary">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 2. What HotelTrack measures ─────────────────────────────────────── */}
      <section className="bg-band text-band-ink">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <SectionEyebrow tone="onBand">What HotelTrack measures</SectionEyebrow>
            <h2 style={serif} className="mt-4 text-3xl font-semibold sm:text-4xl">
              The full picture, from first touch to confirmed revenue.
            </h2>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MEASURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-accent/20 bg-white/[0.04] p-7 transition hover:border-accent/50 hover:bg-white/[0.07]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/15 text-accent">
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-band-ink-muted">{body}</p>
              </div>
            ))}
          </div>

          {/* Product preview — placeholder until a real screenshot is dropped in. */}
          <div className="mt-16">
            <div
              role="img"
              aria-label="HotelTrack attribution dashboard preview (placeholder)"
              className="mx-auto flex aspect-[16/9] max-w-4xl items-center justify-center rounded-2xl border border-dashed border-accent/40 bg-band-ink/5 p-8 text-center text-sm text-band-ink-muted"
            >
              [REPLACE WITH REAL HOTELTRACK SCREENSHOT]
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. How it works ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2 style={serif} className="mt-4 text-3xl font-semibold sm:text-4xl">
            Up and running in three steps.
          </h2>
        </div>
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className="relative rounded-2xl border border-line bg-card p-7 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/15 text-brand">
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span
                  style={serif}
                  aria-hidden="true"
                  className="text-4xl font-semibold text-ink/10"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-tertiary">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 4. OTA commission savings ───────────────────────────────────────── */}
      <section className="bg-elevated">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">
          <div>
            <SectionEyebrow>OTA commission savings</SectionEyebrow>
            <h2 style={serif} className="mt-4 text-3xl font-semibold sm:text-4xl">
              Every direct booking is commission you keep.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-ink-secondary">
              Online travel agencies typically charge hotels{" "}
              <strong className="font-semibold text-ink">15–25% commission</strong>{" "}
              per reservation (industry range, India 2026). When your own marketing
              wins the booking on your website instead, that commission stays with
              the hotel — HotelTrack shows exactly how much each direct booking
              saved.
            </p>
            <p className="mt-4 text-xs text-ink-tertiary">
              Commission range is an industry benchmark, not a hotel-specific figure.
              Your dashboard reports real savings from your own bookings.
            </p>
          </div>
          <div className="rounded-3xl bg-band p-8 text-band-ink shadow-sm sm:p-10">
            <div className="flex items-baseline gap-3">
              <span style={serif} className="text-6xl font-bold text-accent">
                15–25%
              </span>
              <BadgePercent
                aria-hidden="true"
                className="h-7 w-7 text-accent"
                strokeWidth={1.75}
              />
            </div>
            <p className="mt-2 text-sm font-medium text-band-ink">
              Typical OTA commission avoided per direct booking
            </p>
            <hr className="my-7 border-band-ink/15" />
            <dl className="space-y-4">
              <div className="flex items-center justify-between">
                <dt className="text-sm text-band-ink-muted">Commission saved this period</dt>
                <dd className="text-sm font-semibold text-band-ink">[PLACEHOLDER]</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-band-ink-muted">Direct bookings attributed</dt>
                <dd className="text-sm font-semibold text-band-ink">[PLACEHOLDER]</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ── 5. Final CTA + contact ──────────────────────────────────────────── */}
      <section id="contact" className="scroll-mt-20 bg-band text-band-ink">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center sm:px-8 sm:py-32">
          <SectionEyebrow tone="onBand">Book a demo</SectionEyebrow>
          <h2 style={serif} className="mt-4 text-3xl font-semibold sm:text-5xl">
            See your bookings traced back to the marketing that made them.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-band-ink-muted">
            Walk through HotelTrack with your own hotel&apos;s setup. We&apos;ll show
            you content-to-revenue attribution, channel ROAS, and OTA commission
            saved — live.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="mailto:[PLACEHOLDER]?subject=HotelTrack%20demo%20request"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-on-accent shadow-lg shadow-accent/20 transition hover:-translate-y-0.5 hover:bg-accent-hover sm:w-auto"
            >
              <Mail aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              Book a demo
            </a>
            <Show when="signed-out">
              <Link
                href="/sign-in"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-band-ink/30 px-7 py-3.5 text-sm font-medium text-band-ink transition hover:border-band-ink/60 hover:bg-white/5 sm:w-auto"
              >
                Sign in
                <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              </Link>
            </Show>
          </div>
          <p className="mt-8 text-sm text-band-ink-muted">
            Prefer email? Reach us at{" "}
            <span className="font-medium text-accent-soft">[PLACEHOLDER]</span>.
          </p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-band text-band-ink-muted">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm sm:flex-row sm:px-8">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-on-accent"
            >
              H
            </span>
            <span style={serif} className="text-base font-semibold text-band-ink">
              HotelTrack
            </span>
          </div>
          <p className="text-xs text-band-ink-muted">
            Marketing attribution built for hotels.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ── Section data ──────────────────────────────────────────────────────────────

const PROBLEMS = [
  {
    icon: EyeOff,
    title: "Bookings with no origin",
    body: "A reservation lands on the hotel website, but there's no way to tell which post, ad, or reel actually sent that guest.",
  },
  {
    icon: Unplug,
    title: "Siloed channels",
    body: "Meta Ads, Instagram, and Google Analytics each live in their own tab — never joined into a single revenue view.",
  },
  {
    icon: HelpCircle,
    title: "ROI by guesswork",
    body: "When the marketing budget is questioned, the answer is a hunch instead of booking-level proof of what worked.",
  },
];

const MEASURES = [
  {
    icon: TrendingUp,
    title: "Revenue by source",
    body: "Attribute confirmed booking revenue back to the exact channel, campaign, and piece of content that drove it.",
  },
  {
    icon: Route,
    title: "Visitor journeys",
    body: "Follow each visitor page by page — from the first content touch to the booking they complete.",
  },
  {
    icon: Filter,
    title: "Funnel drop-off",
    body: "See where prospective guests fall out of the booking flow so you can fix the leaks that cost reservations.",
  },
  {
    icon: BadgePercent,
    title: "OTA commission saved",
    body: "Quantify the commission kept every time a direct booking replaces one that would have come through an OTA.",
  },
  {
    icon: Target,
    title: "Campaign ROAS",
    body: "Tie Meta ad spend to real bookings for true return on ad spend — not platform-reported conversions.",
  },
];

const STEPS = [
  {
    icon: Code2,
    title: "Install the snippet",
    body: "Add one lightweight tracking script to the hotel's website. It captures which content sent each visitor and when a booking happens.",
  },
  {
    icon: PlugZap,
    title: "Connect Meta, Instagram & GA4",
    body: "Securely link Meta Ads, Instagram, and Google Analytics. Access tokens are encrypted — never exposed to the browser.",
  },
  {
    icon: LayoutDashboard,
    title: "See unified attribution",
    body: "Watch content → visit → booking → revenue come together in one dashboard, per hotel, with ad ROI and OTA savings.",
  },
];

// ── Small presentational helpers (server-rendered) ────────────────────────────

function SectionEyebrow({
  children,
  tone = "onLight",
}: {
  children: React.ReactNode;
  tone?: "onLight" | "onBand";
}) {
  // Gold fails AA as small text on light surfaces, so on light sections the
  // eyebrow uses the brand blue; on the deep band it uses the AA-safe light gold.
  const color = tone === "onBand" ? "text-accent-soft" : "text-brand";
  return (
    <span
      className={`text-xs font-semibold uppercase tracking-[0.18em] ${color}`}
    >
      {children}
    </span>
  );
}

const HERO_STYLES = `
  .ht-hero-bg {
    background-image:
      linear-gradient(to right, color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: radial-gradient(ellipse 80% 70% at 50% 35%, #000 40%, transparent 100%);
    -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 35%, #000 40%, transparent 100%);
  }
  .ht-glow {
    filter: blur(90px);
    opacity: 0.5;
    will-change: transform;
  }
  .ht-glow-1 {
    top: -8rem;
    left: -6rem;
    height: 26rem;
    width: 26rem;
    background: radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent), transparent 70%);
    animation: ht-drift-1 22s ease-in-out infinite alternate;
  }
  .ht-glow-2 {
    bottom: -10rem;
    right: -8rem;
    height: 30rem;
    width: 30rem;
    background: radial-gradient(circle, color-mix(in srgb, var(--brand) 55%, transparent), transparent 70%);
    animation: ht-drift-2 26s ease-in-out infinite alternate;
  }
  @keyframes ht-drift-1 {
    from { transform: translate3d(0, 0, 0) scale(1); }
    to   { transform: translate3d(3rem, 2rem, 0) scale(1.12); }
  }
  @keyframes ht-drift-2 {
    from { transform: translate3d(0, 0, 0) scale(1); }
    to   { transform: translate3d(-3rem, -2rem, 0) scale(1.1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ht-glow-1, .ht-glow-2 { animation: none; }
  }
`;
