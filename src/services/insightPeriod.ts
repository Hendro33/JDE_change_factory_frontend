export type InsightPeriod = "week" | "month" | "year" | "lifetime";
export const INSIGHT_PERIODS: {key: InsightPeriod; label: string}[] = [
  {key: "week", label: "Past week"}, {key: "month", label: "Past month"},
  {key: "year", label: "Past year"}, {key: "lifetime", label: "Lifetime"},
];
export function inInsightPeriod(createdAt: string, period: InsightPeriod, now = Date.now()): boolean {
  if (period === "lifetime") return true;
  const days = {week: 7, month: 30, year: 365}[period];
  const at = Date.parse(createdAt);
  return Number.isFinite(at) && at >= now - days * 86400000 && at <= now;
}
