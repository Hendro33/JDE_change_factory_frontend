/**
 * Dashboard KPI alert-colour thresholds (UI polish increment). Stored in
 * this browser only, via localStorage — not yet a shared, per-customer
 * backend setting like EngagementScope. Deliberately said out loud on the
 * Customer Setup screen rather than presented as more durable than it is.
 */
const STORAGE_KEY = "jade_dashboard_thresholds";

export interface DashboardThresholds {
  /** A KPI count strictly above this turns orange. */
  warnAt: number;
  /** A KPI count strictly above this turns red (takes precedence over warnAt). */
  criticalAt: number;
}

export const DEFAULT_DASHBOARD_THRESHOLDS: DashboardThresholds = { warnAt: 10, criticalAt: 25 };

export function getDashboardThresholds(): DashboardThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DASHBOARD_THRESHOLDS;
    const parsed = JSON.parse(raw);
    const warnAt = Number(parsed.warnAt);
    const criticalAt = Number(parsed.criticalAt);
    if (!Number.isFinite(warnAt) || !Number.isFinite(criticalAt)) return DEFAULT_DASHBOARD_THRESHOLDS;
    return { warnAt, criticalAt };
  } catch {
    return DEFAULT_DASHBOARD_THRESHOLDS;
  }
}

export function setDashboardThresholds(t: DashboardThresholds): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    // Best-effort only — a private window or blocked storage just keeps defaults.
  }
}

export function toneForValue(value: number, t: DashboardThresholds): "warn" | "stop" | undefined {
  if (value > t.criticalAt) return "stop";
  if (value > t.warnAt) return "warn";
  return undefined;
}
