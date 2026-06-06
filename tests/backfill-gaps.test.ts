import "dotenv/config";
import { describe, expect, test } from "vitest";
import { computeAdGaps, computeGap, chunkRanges, type Gap } from "@/lib/backfill";

// Pure-function tests for the backfill gap engine — no DB needed. All dates are
// midnight UTC, matching Prisma's @db.Date columns.

const DAY_MS = 86_400_000;
const NOW = new Date("2026-06-06T10:00:00.000Z");
const YESTERDAY = new Date("2026-06-05T00:00:00.000Z");
const HORIZON = new Date(YESTERDAY.getTime() - 364 * DAY_MS); // 2025-06-06

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const daysAgo = (n: number) => new Date(YESTERDAY.getTime() - n * DAY_MS);

describe("computeAdGaps — 12-month coverage windows", () => {
  test("no snapshots → one initial gap covering the full trailing year", () => {
    const gaps = computeAdGaps(null, null, NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe("initial");
    expect(gaps[0].start).toEqual(HORIZON);
    expect(gaps[0].end).toEqual(YESTERDAY);
    expect(gaps[0].days).toBe(365);
  });

  test("current data with short history → head gap only", () => {
    // 10 days of data ending yesterday — the year before it is missing.
    const gaps = computeAdGaps(daysAgo(9), YESTERDAY, NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe("head");
    expect(gaps[0].start).toEqual(HORIZON);
    expect(gaps[0].end).toEqual(daysAgo(10));
    expect(gaps[0].days).toBe(355);
  });

  test("old history but stale data → tail gap only", () => {
    // Data from before the horizon up to 5 days ago — classic reconnect gap.
    const first = new Date(HORIZON.getTime() - 30 * DAY_MS);
    const gaps = computeAdGaps(first, daysAgo(5), NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe("tail");
    expect(gaps[0].start).toEqual(daysAgo(4));
    expect(gaps[0].end).toEqual(YESTERDAY);
    expect(gaps[0].days).toBe(5);
  });

  test("short stale window in the middle → head and tail gaps", () => {
    const gaps = computeAdGaps(daysAgo(20), daysAgo(10), NOW);
    expect(gaps.map((g) => g.kind)).toEqual(["head", "tail"]);
    expect(gaps[0].start).toEqual(HORIZON);
    expect(gaps[0].end).toEqual(daysAgo(21));
    expect(gaps[1].start).toEqual(daysAgo(9));
    expect(gaps[1].end).toEqual(YESTERDAY);
  });

  test("full coverage → no gaps", () => {
    const gaps = computeAdGaps(new Date(HORIZON.getTime() - DAY_MS), YESTERDAY, NOW);
    expect(gaps).toEqual([]);
  });

  test("all data older than the horizon → tail clamped to the horizon", () => {
    const gaps = computeAdGaps(daysAgo(500), daysAgo(400), NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe("tail");
    expect(gaps[0].start).toEqual(HORIZON);
    expect(gaps[0].end).toEqual(YESTERDAY);
    expect(gaps[0].days).toBe(365);
  });
});

describe("computeGap — social repair window (unchanged behavior)", () => {
  test("no baseline → null (no initial import for social)", () => {
    expect(computeGap(null, NOW)).toBeNull();
  });

  test("current data → null", () => {
    expect(computeGap(YESTERDAY, NOW)).toBeNull();
  });

  test("gap is capped at 90 days", () => {
    const gap = computeGap(daysAgo(200), NOW);
    expect(gap).not.toBeNull();
    expect(gap!.days).toBe(90);
    expect(gap!.end).toEqual(YESTERDAY);
  });
});

describe("chunkRanges — ≤90-day chunks, direction-aware", () => {
  const gap: Gap = { start: d("2025-06-06"), end: d("2026-06-05"), days: 365 };

  /** Every chunk is ≤90 days and together they tile the gap exactly once. */
  function expectTiles(chunks: { since: string; until: string }[], g: Gap) {
    const covered = new Set<string>();
    for (const c of chunks) {
      let cursor = d(c.since);
      const until = d(c.until);
      let len = 0;
      while (cursor <= until) {
        const key = cursor.toISOString().slice(0, 10);
        expect(covered.has(key)).toBe(false); // no overlap
        covered.add(key);
        cursor = new Date(cursor.getTime() + DAY_MS);
        len += 1;
      }
      expect(len).toBeLessThanOrEqual(90);
    }
    expect(covered.size).toBe(g.days); // no holes
  }

  test("forward (tail) chunks start at the gap start", () => {
    const chunks = chunkRanges(gap);
    expect(chunks[0].since).toBe("2025-06-06");
    expect(chunks[chunks.length - 1].until).toBe("2026-06-05");
    expectTiles(chunks, gap);
  });

  test("backward (head/initial) chunks anchor at the gap end", () => {
    const chunks = chunkRanges(gap, true);
    // Newest chunk first, so an interrupted run leaves contiguous recent data.
    expect(chunks[0].until).toBe("2026-06-05");
    expect(chunks[chunks.length - 1].since).toBe("2025-06-06");
    expectTiles(chunks, gap);
  });

  test("a gap smaller than one chunk is a single range either way", () => {
    const small: Gap = { start: d("2026-06-01"), end: d("2026-06-05"), days: 5 };
    expect(chunkRanges(small)).toEqual([{ since: "2026-06-01", until: "2026-06-05" }]);
    expect(chunkRanges(small, true)).toEqual([{ since: "2026-06-01", until: "2026-06-05" }]);
  });
});
