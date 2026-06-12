// Pure aggregation for the Phase 3 dashboards — no DB, no "server-only", so the
// journeys page and the tests can both import it. Turns raw ClickEvent /
// FormFieldEvent rows into the per-target click table and the per-field form
// abandonment funnel.

// ── Clicks Analytics (Part 4) ────────────────────────────────────────────────

export type ClickRow = {
  target: string;
  totalClicks: number;
  /** Distinct sessions that fired this click. */
  uniqueSessions: number;
  /** Of those sessions, how many converted in the range. */
  convertedSessions: number;
  /** convertedSessions / uniqueSessions; null when uniqueSessions = 0. */
  conversionRate: number | null;
};

/**
 * Per-`clickTarget` totals + conversion rate. A target's conversion rate is the
 * share of its UNIQUE clicking sessions that also converted — so "Book Now: 200
 * clicks, 2%" vs "Check Availability: 800 clicks, 25%" is directly comparable.
 * Sorted by total clicks desc.
 */
export function computeClickAnalytics(
  clicks: { clickTarget: string; sessionId: string }[],
  convertedSessionIds: Set<string>,
): ClickRow[] {
  const byTarget = new Map<string, { total: number; sessions: Set<string> }>();
  for (const c of clicks) {
    const e = byTarget.get(c.clickTarget) ?? { total: 0, sessions: new Set<string>() };
    e.total += 1;
    if (c.sessionId) e.sessions.add(c.sessionId);
    byTarget.set(c.clickTarget, e);
  }

  const rows: ClickRow[] = [];
  for (const [target, e] of byTarget) {
    let converted = 0;
    for (const s of e.sessions) if (convertedSessionIds.has(s)) converted += 1;
    rows.push({
      target,
      totalClicks: e.total,
      uniqueSessions: e.sessions.size,
      convertedSessions: converted,
      conversionRate: e.sessions.size > 0 ? converted / e.sessions.size : null,
    });
  }
  return rows.sort((a, b) => b.totalClicks - a.totalClicks || a.target.localeCompare(b.target));
}

// ── Form Abandonment (Part 5) ────────────────────────────────────────────────

export type FormFieldRow = {
  field: string;
  /** Sessions that interacted with the field (focused, or blurred). */
  focusedSessions: number;
  /** Sessions that left the field WITH content (blurred + hasValue). */
  filledSessions: number;
  /** focusedSessions − filledSessions: focused but never filled. */
  abandonedSessions: number;
  /** abandonedSessions / focusedSessions; null when focusedSessions = 0. */
  abandonmentRate: number | null;
};

function add(map: Map<string, Set<string>>, key: string, val: string) {
  const s = map.get(key) ?? new Set<string>();
  s.add(val);
  map.set(key, s);
}

/**
 * Per-field abandonment funnel. A session "focused" a field if it fired any
 * focus/blur event for it; it "filled" the field if it blurred it with content
 * (hasValue=true). Abandoned = focused but never filled. Sorted by focused desc
 * so the stacked bar reads as a funnel through the form (most-entered first).
 */
export function computeFormAbandonment(
  events: { fieldName: string; sessionId: string; action: string; hasValue: boolean | null }[],
): FormFieldRow[] {
  const focused = new Map<string, Set<string>>();
  const filled = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.sessionId) continue;
    add(focused, e.fieldName, e.sessionId); // any interaction ⇒ the field was entered
    if (e.action === "blurred" && e.hasValue === true) add(filled, e.fieldName, e.sessionId);
  }

  const rows: FormFieldRow[] = [];
  for (const [field, fSet] of focused) {
    const filledSet = filled.get(field) ?? new Set<string>();
    let filledCount = 0;
    for (const s of fSet) if (filledSet.has(s)) filledCount += 1;
    const focusedSessions = fSet.size;
    const abandoned = focusedSessions - filledCount;
    rows.push({
      field,
      focusedSessions,
      filledSessions: filledCount,
      abandonedSessions: abandoned,
      abandonmentRate: focusedSessions > 0 ? abandoned / focusedSessions : null,
    });
  }
  return rows.sort((a, b) => b.focusedSessions - a.focusedSessions || a.field.localeCompare(b.field));
}
