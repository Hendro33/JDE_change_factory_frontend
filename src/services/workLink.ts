import type { Change, CompanyRole } from "../types/domain";
import type { SessionInfo } from "../components/design";
import { storyPath } from "../router";
import { gateFor } from "../pages/stories/NextActionCard";
import { changePath } from "../pages/stories/useStory";

/**
 * Where a story opens from a list (finding 1, post-step-3 review): straight
 * into the screen where the person acts, not a summary page with a second
 * "Open in …" button. When the next action is the viewer's own decision or
 * task, that screen; otherwise the view of the person's area -- the
 * application view for Application Management from solutioning on (or always,
 * with `am`), the business view otherwise.
 */
export function workLink(c: Change, info: SessionInfo, opts: { am?: boolean } = {}): string {
  const na = c.lifecycle?.nextAction;
  const inApp = info.appManagement && (opts.am || (c.lifecycle?.phaseIndex ?? 0) >= 2);
  const mine = !!na && na.owner !== "jade" && na.owner !== "none" && info.has(na.owner as CompanyRole);
  if (mine && na!.action) {
    const g = gateFor(na!.action, c.id, inApp);
    if (g) return g.to;
  }
  return inApp ? changePath(c.id) : storyPath(c.id);
}

/** Remember the queue a change was opened from, so its breadcrumb returns there with its filters. */
export function rememberReturn(id: string, label: string, to: string) {
  try {
    sessionStorage.setItem("jade_return", JSON.stringify({ id, label, to }));
  } catch { /* private mode: the breadcrumb falls back to the change's phase */ }
}

export function returnFor(id: string): { label: string; to: string } | null {
  try {
    const r = JSON.parse(sessionStorage.getItem("jade_return") || "null");
    return r && r.id === id && typeof r.to === "string" && r.to.startsWith("/am") ? { label: r.label, to: r.to } : null;
  } catch { return null; }
}
