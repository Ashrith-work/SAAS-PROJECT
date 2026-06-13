// Client-safe channel-view types + constants. NO "server-only", no prisma — so
// client components (ChannelSelector, ChannelView) can import these without
// pulling the server query graph into the browser bundle. The server loaders
// live in lib/channel-view.ts (which re-exports everything here for callers).

export const CHANNEL_KEYS = [
  "all",
  "meta_ads",
  "google_ads",
  "instagram_organic",
  "facebook_organic",
  "influencer",
  "direct",
  "other",
] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

export function isChannelKey(v: unknown): v is ChannelKey {
  return typeof v === "string" && (CHANNEL_KEYS as readonly string[]).includes(v);
}

export type TrendPoint = Record<string, number | string>;

export type PaidKpis = {
  totalSpend: number; impressions: number; reach: number; frequency: number;
  cpc: number; cpm: number; ctr: number; linkClicks: number;
  // Meta-reported conversions (AdSnapshot.conversions) + cost per conversion.
  conversions: number;
  costPerConversion: number | null;
  // Tracked bookings/revenue (from TrackingEvent classified meta_ads) drive ROAS.
  bookings: number; revenue: number; roas: number | null;
  costPerBooking: number | null; conversionRate: number | null;
};
// Per-ad-account spend breakdown (a hotel can have >1 Meta account).
export type PaidAccount = { accountId: string; spend: number; impressions: number; clicks: number };
export type PaidChannelView = {
  channelType: "paid_ads";
  channelName: string;
  hasData: boolean;
  integrationStatus?: "not_connected";
  kpis?: PaidKpis;
  accounts?: PaidAccount[];          // included (non-archived) accounts, by spend desc
  archivedAccountIds?: string[];     // archived accounts excluded from the totals
  topCampaigns?: { campaignName: string; spend: number; revenue: number; bookings: number; roas: number | null; ctr: number }[];
  topCreatives?: null;
  trend?: { date: string; spend: number; revenue: number; bookings: number }[];
};

export type InstagramChannelView = {
  channelType: "organic_social";
  channelName: "Instagram Organic";
  hasData: boolean;
  kpis: {
    profileVisits: number; postReach: number; postImpressions: number; engagementRate: number;
    likes: number; comments: number; saves: number; shares: number;
    websiteClicks: number; sessionsFromInstagram: number; bookings: number; revenue: number;
  };
  topPosts:
    | { postId: string; caption: string; reach: number; saves: number; websiteClicks: number; bookings: number | null; revenue: number | null }[]
    | null;
  trend: { date: string; sessions: number; bookings: number; revenue: number }[];
};

export type FacebookChannelView = {
  channelType: "organic_social";
  channelName: "Facebook Organic";
  hasData: boolean;
  kpis: { pageVisits: number; pageFollows: number; postReach: number; websiteClicks: number; sessionsFromFacebook: number; bookings: number; revenue: number };
  trend: { date: string; sessions: number; bookings: number; revenue: number }[];
};

export type InfluencerChannelView = {
  channelType: "influencer";
  channelName: "Influencer";
  hasData: boolean;
  kpis: { activeInfluencers: number; activeCouponCodes: number; totalRedemptions: number; totalRevenue: number; averageRevenuePerInfluencer: number };
  topInfluencers: { influencerName: string; instagramHandle: string; activeCodesCount: number; redemptionsCount: number; revenue: number; avgBookingValue: number }[];
  redemptionSourceBreakdown: { snippetAuto: number; manualEntry: number };
  trend: { date: string; redemptions: number; revenue: number }[];
};

export type DirectChannelView = {
  channelType: "direct";
  channelName: "Direct";
  hasData: boolean;
  kpis: { sessions: number; bookings: number; revenue: number; avgBookingValue: number; conversionRate: number | null };
  topLandingPages: { pagePath: string; sessions: number; bookings: number }[];
  trend: { date: string; sessions: number; bookings: number; revenue: number }[];
};

export type OtherChannelView = {
  channelType: "other";
  channelName: "Other";
  hasData: boolean;
  kpis: { sessions: number; bookings: number; revenue: number };
  unknownSources: { utmSource: string; utmMedium: string; sessions: number; bookings: number; revenue: number }[];
  trend: { date: string; sessions: number; bookings: number; revenue: number }[];
};

export type ChannelView =
  | PaidChannelView | InstagramChannelView | FacebookChannelView
  | InfluencerChannelView | DirectChannelView | OtherChannelView;
