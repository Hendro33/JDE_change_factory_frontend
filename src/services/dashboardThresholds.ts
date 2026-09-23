/**
 * Dashboard KPI alert-colour thresholds. Saved per company on the
 * server (GET/PUT /admin/dashboard-thresholds, Admin-only writes) --
 * see DashboardThresholds in types/domain.ts.
 *
 * Earlier builds kept these in this browser's localStorage only. The
 * legacy helpers below exist so an Admin can see such a value and
 * choose to import it once; it is never applied automatically and
 * never overwrites a value already saved on the server.
 */
import type { DashboardThresholds } from "../types/domain";

const LEGACY_STORAGE_KEY = "jade_dashboard_thresholds";

export const DEFAULT_DASHBOARD_THRESHOLDS: DashboardThresholds = {
  warnAt: 10,
  criticalAt: 25,
  configured: false,
  revision: 0,
};

export function toneForValue(
  value: number,
  t: Pick<DashboardThresholds, "warnAt" | "criticalAt">
): "warn" | "stop" | undefined {
  if (value > t.criticalAt) return "stop";
  if (value > t.warnAt) return "warn";
  return undefined;
}

/** A value an earlier build saved in this browser, or null. */
export function readLegacyLocalThresholds(): { warnAt: number; criticalAt: number } | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const warnAt = Number(parsed.warnAt);
    const criticalAt = Number(parsed.criticalAt);
    if (!Number.isFinite(warnAt) || !Number.isFinite(criticalAt) || warnAt < 0 || criticalAt < warnAt) return null;
    return { warnAt, criticalAt };
  } catch {
    return null;
  }
}

export function clearLegacyLocalThresholds(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Blocked storage -- nothing to clear.
  }
}
