import "dotenv/config";
import { prisma } from "../lib/prisma";
import { encryptToken } from "../lib/encryption";

// Seeds demo organic-social data so the "Social media performance" section on
// the hotel dashboard (/agency/hotel/[id]) is populated without needing a live
// Instagram sync. Writes 60 days of SocialSnapshot (so 30-day growth has a prior
// period to compare against) and a handful of PostSnapshot rows.
//
// Usage:
//   npm run seed:social-demo                 # newest hotel client
//   npm run seed:social-demo -- <hotelId>
//
// Idempotent + non-destructive: SocialSnapshots upsert by date and demo posts
// use "demo_post_*" ids, so re-runs overwrite in place and real synced data
// (real media ids) is never touched.

const WINDOW_DAYS = 60;
const POST_COUNT = 10;
const STORY_COUNT = 8; // last ~7 days of stories
const DAY_MS = 86_400_000;

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const rndInt = (min: number, max: number) => Math.floor(rnd(min, max + 1));
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);
const dateOnly = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const CAPTIONS = [
  "Sunset from the rooftop pool 🌅",
  "Weekend getaway vibes ✨",
  "Behind the scenes at the spa",
  "Our chef's new tasting menu 🍽️",
  "Room with a view 🏝️",
  "Local guide: 5 hidden gems",
  "Influencer takeover recap",
  "Last-minute summer deal 🔥",
  "Morning yoga on the beach 🧘",
  "Guest story of the week 💬",
];

// Cycles through the four normalised types so the dashboard's media-type
// filter has something to show for every value.
const POST_TYPES = ["image", "video", "carousel", "reels"] as const;
const STORY_TYPES = ["image", "video"] as const;

async function main() {
  const hotelId = process.argv[2];
  const hotel = hotelId
    ? await prisma.hotelClient.findUnique({ where: { id: hotelId } })
    : await prisma.hotelClient.findFirst({ orderBy: { createdAt: "desc" } });

  if (!hotel) {
    console.error("No hotel client found. Create one in the app first (or pass a hotel id).");
    process.exit(1);
  }
  const { id: hid, agencyId } = hotel;
  console.log(`Seeding demo social data for hotel "${hotel.name}" (${hid})…`);

  // ── SocialAccount: create (with a demo token) or just refresh lastSyncedAt ──
  const existing = await prisma.socialAccount.findFirst({
    where: { agencyId, hotelClientId: hid, platform: "instagram" },
    select: { id: true },
  });
  if (existing) {
    await prisma.socialAccount.update({
      where: { id: existing.id },
      data: { status: "connected", lastSyncedAt: new Date() },
    });
  } else {
    await prisma.socialAccount.create({
      data: {
        agencyId,
        hotelClientId: hid,
        platform: "instagram",
        igUserId: "demo_ig_user",
        username: "demo_resort",
        encryptedToken: encryptToken("social-demo-token-not-a-real-meta-token"),
        status: "connected",
        lastSyncedAt: new Date(),
      },
    });
  }

  // ── 60 days of account snapshots (followers trend upward toward today) ──
  const baseFollowers = 5000;
  for (let d = 0; d < WINDOW_DAYS; d++) {
    const date = dateOnly(daysAgo(d));
    const followers = Math.round(
      baseFollowers + (WINDOW_DAYS - d) * 14 + rnd(-20, 20),
    );
    const data = {
      agencyId,
      followers,
      reach: rndInt(1200, 6000),
      impressions: rndInt(3000, 12000),
      profileViews: rndInt(80, 600),
      engagement: 0, // account-level engagement isn't synced; lives on posts
    };
    await prisma.socialSnapshot.upsert({
      where: { hotelClientId_date: { hotelClientId: hid, date } },
      create: { hotelClientId: hid, date, ...data },
      update: data,
    });
  }

  // ── Recent posts with per-post metrics (cycles through all media types) ──
  for (let i = 0; i < POST_COUNT; i++) {
    const reach = rndInt(500, 9000);
    const mediaType = POST_TYPES[i % POST_TYPES.length];
    const isVideo = mediaType === "video" || mediaType === "reels";
    const data = {
      agencyId,
      caption: CAPTIONS[i % CAPTIONS.length],
      mediaType,
      permalink: `https://www.instagram.com/p/demo${i}/`,
      postedAt: daysAgo(rndInt(0, 29)),
      impressions: reach + rndInt(200, 4000),
      reach,
      likes: rndInt(20, 1200),
      comments: rndInt(0, 80),
      engagement: Math.round(reach * rnd(0.03, 0.12)),
      saves: rndInt(0, 220),
      shares: rndInt(0, 120),
      videoViews: isVideo ? rndInt(800, 15000) : 0,
      fetchedAt: new Date(),
    };
    await prisma.postSnapshot.upsert({
      where: { hotelClientId_mediaId: { hotelClientId: hid, mediaId: `demo_post_${i}` } },
      create: { hotelClientId: hid, mediaId: `demo_post_${i}`, ...data },
      update: data,
    });
  }

  // ── Stories (within the 30-day dashboard window). Story-completion =
  //    (impressions - exits) / impressions, so we generate exits well below
  //    impressions to land in a realistic 60-90% completion range. ──
  for (let i = 0; i < STORY_COUNT; i++) {
    const impressions = rndInt(400, 4500);
    const exits = Math.round(impressions * rnd(0.08, 0.35));
    const data = {
      agencyId,
      mediaType: STORY_TYPES[i % STORY_TYPES.length],
      postedAt: hoursAgo(rndInt(2, 24 * 14)), // last 14 days
      reach: Math.round(impressions * rnd(0.7, 0.95)),
      impressions,
      tapsForward: rndInt(40, 800),
      tapsBack: rndInt(5, 100),
      exits,
      replies: rndInt(0, 40),
      fetchedAt: new Date(),
    };
    await prisma.storySnapshot.upsert({
      where: { hotelClientId_storyId: { hotelClientId: hid, storyId: `demo_story_${i}` } },
      create: { hotelClientId: hid, storyId: `demo_story_${i}`, ...data },
      update: data,
    });
  }

  console.log(
    `Done: ${WINDOW_DAYS} account snapshots + ${POST_COUNT} posts + ${STORY_COUNT} stories.\n` +
      `Open the dashboard at:  /agency/hotel/${hid}\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
