import type { Change } from "../types/domain";

/**
 * Operational measures for the role homes (finding 7). Every figure comes from
 * the canonical lifecycle and recorded event times only: `lifecycle.since` is
 * when the current step began (the latest recorded lifecycle event; for a
 * finished story, when it finished). Nothing is inferred from a record's
 * generic update time. When the data is not there, the figure says so.
 */
const DAY = 86_400_000;

export function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DAY));
}

export function waitingLabel(c: Change): string {
  const d = daysSince(c.lifecycle?.since);
  return d === null ? "" : d === 0 ? "since today" : `waiting ${d} day${d === 1 ? "" : "s"}`;
}

export function isRequestChange(c: Change): boolean {
  return (c.lifecycle?.phase ?? "understand") === "understand";
}

/** Delivered with a recorded finish within the last `days` days. */
export function deliveredWithin(changes: Change[], days: number): Change[] {
  return changes.filter((c) => c.lifecycle?.outcome === "delivered" && (daysSince(c.lifecycle.since) ?? Infinity) <= days);
}

/** Median days from the story being proposed to delivered, for stories delivered in the last `days` days. */
export function medianLeadTime(changes: Change[], days = 90): { days: number | null; n: number } {
  const spans = deliveredWithin(changes, days)
    .map((c) => (Date.parse(c.lifecycle!.since!) - Date.parse(c.createdAt)) / DAY)
    .filter((d) => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a - b);
  if (spans.length === 0) return { days: null, n: 0 };
  const mid = Math.floor(spans.length / 2);
  const m = spans.length % 2 ? spans[mid] : (spans[mid - 1] + spans[mid]) / 2;
  return { days: Math.round(m * 10) / 10, n: spans.length };
}

export function oldestWaiting(changes: Change[]): number | null {
  const ds = changes.map((c) => daysSince(c.lifecycle?.since)).filter((d): d is number => d !== null);
  return ds.length ? Math.max(...ds) : null;
}

export function isException(c: Change): boolean {
  const lc = c.lifecycle;
  return !!lc && lc.phase !== "done" && (lc.health === "blocked" || lc.health === "failed" || !!lc.authorisation?.renewable);
}
