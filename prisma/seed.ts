import "dotenv/config";
import { prisma } from "../lib/prisma";
import { buildUtmLink, utmContentFor } from "../lib/utm";
import { encryptToken } from "../lib/encryption";

// ─────────────────────────────────────────────────────────────────────────────
// HotelTrack demo seed
//
// Fills the database with realistic, internally-consistent demo data so every
// page can be tested:
//   • 2 agencies — "Coastal Digital Agency" (rich) + "Mountain Media" (so you can
//     verify multi-tenant isolation: as one agency you never see the other's data)
//   • hotels, content pieces (+ UTM links), 90 days of TrackingEvents, AdSnapshots,
//     SocialSnapshots/PostSnapshots, and CouponRedemptions
//
// Numbers reconcile by construction: every conversion event is tagged to a content
// piece (utm_content = ht-<id>), so the dashboard KPIs, content-performance table,
// and revenue all add up to the same totals.
//
// Re-runnable: deletes the two demo agencies (by name) first — your own onboarded
// agency is untouched. To let you SEE the data, it re-points your signed-in Clerk
// account's membership to Coastal (set SEED_ATTACH=mountain to attach to the other
// agency instead, e.g. to test isolation from Mountain Media's side).
//
//   npm run seed
//   SEED_ATTACH=mountain npm run seed
// ─────────────────────────────────────────────────────────────────────────────

const COASTAL = "Coastal Digital Agency";
const MOUNTAIN = "Mountain Media";

const DAYS = 90;
const DAY_MS = 86_400_000;

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const rndInt = (min: number, max: number) => Math.floor(rnd(min, max + 1));
const pick = <T,>(arr: readonly T[]): T => arr[rndInt(0, arr.length - 1)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
const startOfUTCDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const inr = (n: number) => n.toFixed(2);

// Weekends are busier — bias the day a session lands on toward Sat/Sun.
function pickDayOffset(): number {
  for (let i = 0; i < 8; i++) {
    const off = rndInt(0, DAYS - 1);
    const dow = daysAgo(off).getUTCDay();
    const accept = dow === 0 || dow === 6 ? 1 : 0.62;
    if (Math.random() < accept) return off;
  }
  return rndInt(0, DAYS - 1);
}

// A timestamp at a random time on the calendar day `off` days ago (never future).
function tsOnDay(off: number): Date {
  const base = startOfUTCDay(daysAgo(off)).getTime() + Math.floor(rnd(0, DAY_MS));
  return new Date(Math.min(base, Date.now() - rndInt(0, 3_600_000)));
}

const DEVICES = ["mobile", "mobile", "mobile", "desktop", "desktop", "tablet"] as const;

// ── Content templates ────────────────────────────────────────────────────────

type ContentType = "organic" | "paid_ad" | "influencer" | "story";
type Platform = "instagram" | "facebook";

type ContentSpec = {
  title: string;
  contentType: ContentType;
  platform: Platform;
  influencerName?: string;
  couponCode?: string;
};

// Performance tiers shape how many sessions a piece earns + its conversion rate,
// so some content clearly outperforms the rest (a couple of "stars", a few duds).
const TIERS = [
  { sessions: [260, 440], conv: [0.045, 0.07], weight: 1 }, // star
  { sessions: [120, 240], conv: [0.03, 0.05], weight: 3 }, // solid
  { sessions: [40, 130], conv: [0.012, 0.03], weight: 4 }, // average
  { sessions: [15, 60], conv: [0.005, 0.018], weight: 2 }, // dud
] as const;

function pickTier() {
  const total = TIERS.reduce((s, t) => s + t.weight, 0);
  let r = rnd(0, total);
  for (const t of TIERS) {
    if ((r -= t.weight) <= 0) return t;
  }
  return TIERS[2];
}

const INFLUENCERS = [
  { name: "Aanya Kapoor", code: "AANYA15" },
  { name: "Rohan Mehta", code: "ROHAN10" },
  { name: "Diya Nair", code: "DIYA20" },
  { name: "Kabir Singh", code: "KABIR12" },
] as const;

function contentSpecsFor(hotelShort: string): ContentSpec[] {
  const specs: ContentSpec[] = [
    { title: `${hotelShort} · Sunset Reel`, contentType: "organic", platform: "instagram" },
    { title: `${hotelShort} · Rooms Walkthrough`, contentType: "organic", platform: "facebook" },
    { title: `${hotelShort} · Local Food Guide`, contentType: "organic", platform: "instagram" },
    { title: `${hotelShort} · Monsoon Escape Ad`, contentType: "paid_ad", platform: "facebook" },
    { title: `${hotelShort} · Weekend Deal Ad`, contentType: "paid_ad", platform: "instagram" },
    { title: `${hotelShort} · Spa Package Ad`, contentType: "paid_ad", platform: "facebook" },
    { title: `${hotelShort} · Story: Pool Day`, contentType: "story", platform: "instagram" },
    { title: `${hotelShort} · Story: Breakfast`, contentType: "story", platform: "instagram" },
  ];
  // Two influencer collabs with coupon codes.
  const a = pick(INFLUENCERS);
  let b = pick(INFLUENCERS);
  while (b.code === a.code) b = pick(INFLUENCERS);
  specs.push({
    title: `${hotelShort} · Collab with ${a.name}`,
    contentType: "influencer",
    platform: "instagram",
    influencerName: a.name,
    couponCode: `${a.code}-${hotelShort.slice(0, 3).toUpperCase()}`,
  });
  specs.push({
    title: `${hotelShort} · Collab with ${b.name}`,
    contentType: "influencer",
    platform: "instagram",
    influencerName: b.name,
    couponCode: `${b.code}-${hotelShort.slice(0, 3).toUpperCase()}`,
  });
  // Trim to a random 8–12 (the first 8 are fixed types; add the 2 influencers).
  const extra = rndInt(0, 2);
  return specs.slice(0, 8 + extra).concat(specs.slice(8));
}

const POST_CAPTIONS = [
  "Sunset from the rooftop 🌅",
  "Weekend getaway vibes ✨",
  "Behind the scenes at the spa 💆",
  "Our chef's new tasting menu 🍽️",
  "Room with a view 🏝️",
  "5 hidden gems nearby",
  "Influencer takeover recap 🎥",
  "Last-minute monsoon deal 🔥",
  "Morning yoga by the water 🧘",
  "Guest story of the week 💬",
  "New infinity pool is open 🏊",
  "Festive season is here 🪔",
] as const;

// ── Hotel definitions ──────────────────────────────────────────────────────

type HotelDef = {
  name: string;
  short: string;
  websiteUrl: string;
  contactName: string;
  contactEmail: string;
  siteId: string;
  hasPaidAds: boolean;
  hasSocial: boolean;
};

const COASTAL_HOTELS: HotelDef[] = [
  {
    name: "Taj Backwater Retreat",
    short: "Taj Backwater",
    websiteUrl: "https://tajbackwaterretreat.example.in",
    contactName: "Meera Pillai",
    contactEmail: "meera@tajbackwaterretreat.example.in",
    siteId: "site_coastal_tajbackwater",
    hasPaidAds: true,
    hasSocial: true,
  },
  {
    name: "Goa Sands Resort",
    short: "Goa Sands",
    websiteUrl: "https://goasandsresort.example.in",
    contactName: "Ryan Fernandes",
    contactEmail: "ryan@goasandsresort.example.in",
    siteId: "site_coastal_goasands",
    hasPaidAds: true,
    hasSocial: true,
  },
  {
    name: "Himalayan View Lodge",
    short: "Himalayan View",
    websiteUrl: "https://himalayanviewlodge.example.in",
    contactName: "Tenzin Dorje",
    contactEmail: "tenzin@himalayanviewlodge.example.in",
    siteId: "site_coastal_himalayan",
    hasPaidAds: true,
    hasSocial: true,
  },
  {
    name: "Jaipur Heritage Palace",
    short: "Jaipur Heritage",
    websiteUrl: "https://jaipurheritagepalace.example.in",
    contactName: "Aditi Rathore",
    contactEmail: "aditi@jaipurheritagepalace.example.in",
    siteId: "site_coastal_jaipur",
    hasPaidAds: true,
    hasSocial: true,
  },
];

const MOUNTAIN_HOTELS: HotelDef[] = [
  {
    name: "Shimla Pine Resort",
    short: "Shimla Pine",
    websiteUrl: "https://shimlapineresort.example.in",
    contactName: "Vikram Thakur",
    contactEmail: "vikram@shimlapineresort.example.in",
    siteId: "site_mountain_shimla",
    hasPaidAds: true,
    hasSocial: true,
  },
  {
    name: "Rishikesh Riverside Camp",
    short: "Rishikesh Camp",
    websiteUrl: "https://rishikeshriverside.example.in",
    contactName: "Sneha Bisht",
    contactEmail: "sneha@rishikeshriverside.example.in",
    siteId: "site_mountain_rishikesh",
    hasPaidAds: false,
    hasSocial: true,
  },
];

// ── Per-hotel seeding ────────────────────────────────────────────────────────

type Totals = { hotels: number; content: number; visits: number; bookings: number; revenue: number };

async function seedHotel(
  agencyId: string,
  def: HotelDef,
  scale: number, // multiplier on session volume (Coastal=1, Mountain=0.5)
  totals: Totals,
) {
  const hotel = await prisma.hotelClient.create({
    data: {
      agencyId,
      name: def.name,
      websiteUrl: def.websiteUrl,
      contactName: def.contactName,
      contactEmail: def.contactEmail,
      siteId: def.siteId,
      conversionMethod: "url_change",
      thankYouUrlPattern: "/booking/confirmation",
      snippetStatus: "live",
      metaAdAccountId: def.hasPaidAds ? `act_${rndInt(100000000, 999999999)}` : null,
      lastEventAt: daysAgo(0),
      lastSyncedAt: def.hasPaidAds || def.hasSocial ? daysAgo(0) : null,
    },
    select: { id: true },
  });
  totals.hotels += 1;

  const dest = `${def.websiteUrl}/rooms`;
  const specs = contentSpecsFor(def.short);

  type EventRow = {
    agencyId: string;
    hotelClientId: string;
    eventType: "visit" | "conversion";
    utmSource: string;
    utmMedium: string;
    utmCampaign: string | null;
    utmContent: string;
    utmTerm: string;
    pageUrl: string;
    conversionValue: string | null;
    sessionId: string;
    deviceType: string;
    createdAt: Date;
  };
  const events: EventRow[] = [];
  const redemptions: {
    agencyId: string;
    contentPieceId: string;
    redemptionDate: Date;
    orderValue: string;
  }[] = [];

  for (const spec of specs) {
    const created = await prisma.contentPiece.create({
      data: {
        agencyId,
        hotelClientId: hotel.id,
        title: spec.title,
        contentType: spec.contentType,
        platform: spec.platform,
        destinationUrl: dest,
        utmLink: "",
        influencerName: spec.influencerName ?? null,
        couponCode: spec.couponCode ?? null,
      },
      select: { id: true },
    });
    const utmLink = buildUtmLink({
      destinationUrl: dest,
      source: spec.platform,
      medium: spec.contentType,
      title: spec.title,
      contentPieceId: created.id,
      agencyId,
    });
    await prisma.contentPiece.update({ where: { id: created.id }, data: { utmLink } });
    totals.content += 1;

    const utmContent = utmContentFor(created.id);
    const campaign = new URL(utmLink).searchParams.get("utm_campaign");
    const tier = pickTier();
    const sessions = Math.round(rndInt(tier.sessions[0], tier.sessions[1]) * scale);
    const convRate = rnd(tier.conv[0], tier.conv[1]);

    for (let s = 0; s < sessions; s++) {
      const off = pickDayOffset();
      const at = tsOnDay(off);
      const sessionId = uid();
      const device = pick(DEVICES);
      const common = {
        agencyId,
        hotelClientId: hotel.id,
        utmSource: spec.platform,
        utmMedium: spec.contentType,
        utmCampaign: campaign,
        utmContent,
        utmTerm: agencyId,
        pageUrl: dest,
        sessionId,
        deviceType: device,
      };
      events.push({ ...common, eventType: "visit", conversionValue: null, createdAt: at });
      totals.visits += 1;

      if (Math.random() < convRate) {
        const value = rndInt(3500, 38000);
        const convAt = new Date(Math.min(at.getTime() + rndInt(2, 45) * 60_000, Date.now()));
        events.push({
          ...common,
          eventType: "conversion",
          conversionValue: inr(value),
          createdAt: convAt,
        });
        totals.bookings += 1;
        totals.revenue += value;
      }
    }

    // Influencer collabs also drive coupon redemptions (separate from web bookings).
    if (spec.contentType === "influencer") {
      const count = rndInt(4, 11);
      for (let r = 0; r < count; r++) {
        redemptions.push({
          agencyId,
          contentPieceId: created.id,
          redemptionDate: tsOnDay(pickDayOffset()),
          orderValue: inr(rndInt(4000, 30000)),
        });
      }
    }
  }

  // Bulk insert events in chunks.
  for (let i = 0; i < events.length; i += 1000) {
    await prisma.trackingEvent.createMany({ data: events.slice(i, i + 1000) });
  }
  if (redemptions.length) await prisma.couponRedemption.createMany({ data: redemptions });

  if (def.hasPaidAds) await seedAds(agencyId, hotel.id, scale);
  if (def.hasSocial) await seedSocial(agencyId, hotel.id, def);

  return hotel.id;
}

async function seedAds(agencyId: string, hotelClientId: string, scale: number) {
  const account = `act_${rndInt(100000000, 999999999)}`;
  const rows = [];
  for (let d = 0; d < DAYS; d++) {
    const date = startOfUTCDay(daysAgo(d));
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const spend = rnd(800, 6000) * scale * (weekend ? 1.25 : 1);
    const impressions = Math.round(rndInt(6000, 60000) * scale * (weekend ? 1.2 : 1));
    const clicks = rndInt(60, 1300);
    const conversions = rndInt(0, 8);
    const roas = Number(rnd(1.6, 5.4).toFixed(2));
    rows.push({
      agencyId,
      hotelClientId,
      metaAccountId: account,
      date,
      spend: inr(spend),
      impressions,
      reach: Math.round(impressions * rnd(0.6, 0.85)),
      clicks,
      ctr: Number(((clicks / impressions) * 100).toFixed(4)),
      cpc: (spend / Math.max(clicks, 1)).toFixed(4),
      cpm: ((spend / impressions) * 1000).toFixed(4),
      conversions,
      roas,
      pixelPurchases: conversions,
      pixelLeads: rndInt(0, 15),
      pixelPageViews: rndInt(100, 900),
    });
  }
  await prisma.adSnapshot.createMany({ data: rows });
}

async function seedSocial(agencyId: string, hotelClientId: string, def: HotelDef) {
  const username = def.short.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  await prisma.instagramConnection.create({
    data: {
      agencyId,
      hotelClientId,
      tokenType: "igaa_direct",
      igUserId: `demo_ig_${uid()}`,
      username,
      igAccountType: "BUSINESS",
      encryptedToken: encryptToken("demo-social-token-not-a-real-ig-token"),
      tokenExpiresAt: daysAgo(-50), // ~50 days out
      status: "active",
      lastSyncedAt: daysAgo(0),
    },
  });

  // Daily account snapshots — followers trend gradually upward toward today.
  const base = rndInt(8000, 26000);
  const growth = rndInt(8, 55);
  const snaps = [];
  for (let d = 0; d < DAYS; d++) {
    const dayIndex = DAYS - 1 - d; // 0 = oldest, DAYS-1 = today
    const date = startOfUTCDay(daysAgo(d));
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const followers = Math.round(base + dayIndex * growth + rnd(-25, 25));
    snaps.push({
      agencyId,
      hotelClientId,
      date,
      followers,
      reach: Math.round(rndInt(1500, 16000) * (weekend ? 1.25 : 1)),
      impressions: rndInt(4000, 30000),
      profileViews: rndInt(120, 1500),
      engagement: rndInt(250, 4200),
    });
  }
  await prisma.socialSnapshot.createMany({ data: snaps });

  // A spread of recent posts (several within the last 30 days).
  const posts = [];
  for (let i = 0; i < 12; i++) {
    const reach = rndInt(900, 26000);
    const isVideo = i % 3 === 0;
    posts.push({
      agencyId,
      hotelClientId,
      mediaId: `demo_post_${hotelClientId}_${i}`,
      caption: POST_CAPTIONS[i % POST_CAPTIONS.length],
      mediaType: isVideo ? "VIDEO" : i % 3 === 1 ? "CAROUSEL_ALBUM" : "IMAGE",
      permalink: `https://www.instagram.com/p/demo_${hotelClientId.slice(-5)}_${i}/`,
      postedAt: tsOnDay(rndInt(0, 78)),
      impressions: reach + rndInt(300, 9000),
      reach,
      engagement: Math.round(reach * rnd(0.03, 0.13)),
      saves: rndInt(5, 420),
      shares: rndInt(0, 220),
      videoViews: isVideo ? rndInt(1200, 42000) : 0,
      fetchedAt: daysAgo(0),
    });
  }
  await prisma.postSnapshot.createMany({ data: posts });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding HotelTrack demo data…\n");

  // Capture the real signed-in user's Clerk id BEFORE clearing, so we can
  // re-attach their membership to a demo agency afterwards. Placeholder demo
  // members use clerkId "seed-*", so we exclude those.
  const realMember = await prisma.agencyMember.findFirst({
    where: { NOT: { clerkId: { startsWith: "seed-" } } },
    orderBy: { createdAt: "desc" },
    select: { clerkId: true, email: true, name: true },
  });

  // ── Clear prior demo data (by agency name) — your own agency is untouched ──
  const cleared = await prisma.agency.deleteMany({ where: { name: { in: [COASTAL, MOUNTAIN] } } });
  if (cleared.count) console.log(`Cleared ${cleared.count} existing demo agency(ies).`);

  // ── Coastal Digital Agency — active Growth, rich data ──
  const coastal = await prisma.agency.create({
    data: {
      name: COASTAL,
      email: "hello@coastaldigital.example",
      plan: "growth",
      subscriptionStatus: "active",
      members: {
        create: {
          clerkId: "seed-coastal-admin",
          email: "hello@coastaldigital.example",
          name: "Coastal Admin",
          role: "admin",
        },
      },
    },
    select: { id: true },
  });

  const coastalTotals: Totals = { hotels: 0, content: 0, visits: 0, bookings: 0, revenue: 0 };
  for (const def of COASTAL_HOTELS) {
    process.stdout.write(`  Coastal · ${def.name}… `);
    await seedHotel(coastal.id, def, 1, coastalTotals);
    console.log("done");
  }

  // ── Mountain Media — active Starter, lighter data (isolation check) ──
  const mountain = await prisma.agency.create({
    data: {
      name: MOUNTAIN,
      email: "team@mountainmedia.example",
      plan: "starter",
      subscriptionStatus: "active",
      members: {
        create: {
          clerkId: "seed-mountain-admin",
          email: "team@mountainmedia.example",
          name: "Mountain Admin",
          role: "admin",
        },
      },
    },
    select: { id: true },
  });

  const mountainTotals: Totals = { hotels: 0, content: 0, visits: 0, bookings: 0, revenue: 0 };
  for (const def of MOUNTAIN_HOTELS) {
    process.stdout.write(`  Mountain · ${def.name}… `);
    await seedHotel(mountain.id, def, 0.5, mountainTotals);
    console.log("done");
  }

  // ── Attach your Clerk account so you can view the data ──
  const attachToMountain = process.env.SEED_ATTACH === "mountain";
  const attachId = attachToMountain ? mountain.id : coastal.id;
  const attachName = attachToMountain ? MOUNTAIN : COASTAL;

  let attachNote: string;
  if (realMember) {
    await prisma.agencyMember.upsert({
      where: { clerkId: realMember.clerkId },
      update: { agencyId: attachId, role: "admin" },
      create: {
        clerkId: realMember.clerkId,
        agencyId: attachId,
        email: realMember.email,
        name: realMember.name,
        role: "admin",
      },
    });
    attachNote = `Attached your account (${realMember.email}) to "${attachName}". Sign in to see it.`;
  } else {
    attachNote =
      "No existing signed-in user found to attach. Sign in to the app and complete onboarding once,\n" +
      "  then re-run `npm run seed` — it will attach your account to the demo agency.";
  }

  const fmt = (n: number) => n.toLocaleString("en-IN");
  console.log("\n── Summary ───────────────────────────────────────────────");
  console.log(
    `Coastal Digital Agency: ${coastalTotals.hotels} hotels, ${coastalTotals.content} content pieces, ` +
      `${fmt(coastalTotals.visits)} visits, ${fmt(coastalTotals.bookings)} bookings, ₹${fmt(coastalTotals.revenue)} revenue`,
  );
  console.log(
    `Mountain Media:         ${mountainTotals.hotels} hotels, ${mountainTotals.content} content pieces, ` +
      `${fmt(mountainTotals.visits)} visits, ${fmt(mountainTotals.bookings)} bookings, ₹${fmt(mountainTotals.revenue)} revenue`,
  );
  console.log(`\n${attachNote}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
