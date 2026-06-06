import {
  attributeConversions,
  UNATTRIBUTED_KEY,
  type CampaignDay,
  type ConversionEvent,
  type VisitEvent,
} from "../lib/campaign-attribution";

// Quick rule-by-rule check of the pure matching layer. Exits 1 on any failure.
//   npx tsx scripts/test-attribution-rules.ts

const day = (offset: number) => new Date(Date.UTC(2026, 5, 1 + offset));

const campaigns: CampaignDay[] = [
  { date: "2026-06-01", campaignId: "c1", campaignName: "Monsoon Promo", spend: 100, conversions: 3, purchaseValue: 900 },
  { date: "2026-06-01", campaignId: "c2", campaignName: "Diwali Festive", spend: 50, conversions: 1, purchaseValue: 200 },
];

const conv = (id: string, over: Partial<ConversionEvent>): ConversionEvent => ({
  id,
  sessionId: `s-${id}`,
  utmCampaign: null,
  utmContent: null,
  pageUrl: "https://hotel.example/book",
  conversionValue: 1000,
  createdAt: day(1),
  ...over,
});

const visits: VisitEvent[] = [
  // first-touch visit for rule 3 (session s-r3, tagged, 2 days before conversion)
  { sessionId: "s-r3", utmCampaign: "MONSOON PROMO", utmContent: null, pageUrl: "https://hotel.example/?utm_campaign=monsoon", createdAt: day(-1) },
];

const results = attributeConversions(
  [
    conv("r1", { utmCampaign: "monsoon promo" }), // rule 1: exact, case-insensitive
    conv("r2", { utmContent: "ht-diwali festive-001" }), // rule 2: content contains exactly one name
    conv("r3", {}), // rule 3: no UTMs → session first-touch
    conv("r4", { utmCampaign: "Summer Sale" }), // rule 4: unknown campaign → unattributed
    conv("r5", { utmContent: "ht-monsoon promo-diwali festive" }), // ambiguous tag (2 names) → unattributed
  ],
  visits,
  campaigns,
);

let failed = 0;
function expect(id: string, key: string, reason: string) {
  const r = results.find((x) => x.conversion.id === id)!;
  const ok = r.campaignKey === key && r.reason === reason;
  console.log(`${ok ? "✅" : "❌"} ${id}: got ${r.campaignKey} (${r.reason}), want ${key} (${reason})`);
  if (!ok) failed++;
}

expect("r1", "monsoon promo", "exact_utm_campaign");
expect("r2", "diwali festive", "utm_content_tag");
expect("r3", "monsoon promo", "first_touch_session");
expect("r4", UNATTRIBUTED_KEY, "unattributed");
expect("r5", UNATTRIBUTED_KEY, "unattributed");

// No double-counting: 5 conversions in → exactly 5 attributed out, one bucket each.
if (results.length !== 5) {
  console.log(`❌ expected 5 results, got ${results.length}`);
  failed++;
}

process.exit(failed === 0 ? 0 : 1);
