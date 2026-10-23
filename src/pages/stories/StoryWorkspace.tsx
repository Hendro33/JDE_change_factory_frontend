import { useEffect } from "react";
import { rememberStory } from "../../services/recent";
import type { WorkspaceTab } from "../../types/domain";
import {
  ErrorState, ImpactIndicator, LifecycleStepper, Loading, HealthIndicator, Tabs,
  businessNeed, formatDate, sourceLabel, storyTitle, useSessionInfo,
} from "../../components/design";
import { Link, navigate, storyPath, useLocation } from "../../router";
import { NextActionCard } from "./NextActionCard";
import { BusinessStoryTab } from "./BusinessStoryTab";
import { EvidenceTab } from "./EvidenceTab";
import { ChangesTab } from "./ChangesTab";
import { ProgressTab } from "./ProgressTab";
import { changePath, useStory } from "./useStory";

/** The business view's tabs (review, change 1). */
const TABS: { key: WorkspaceTab; label: string }[] = [
  { key: "story", label: "Story" },
  { key: "changes", label: "What changes" },
  { key: "progress", label: "Progress and outcome" },
  { key: "evidence", label: "History" },
];
const APP_TABS: WorkspaceTab[] = ["solution", "delivery", "technical", "record"];

/**
 * The business view of a change (Business Demand): the requirement, what
 * changes for the business, progress and the outcome, and its history.
 * Solution, delivery, evidence and technical detail are the application
 * view's (Application Management) and are not copied here; people who work
 * there open it from this page. One record and one state underneath.
 */
export function StoryWorkspace({ storyId, tab }: { storyId: string; tab?: string }) {
  const info = useSessionInfo();
  const { hash } = useLocation();
  const { change, error, ctx } = useStory(storyId);

  // Links to the old story tabs resolve to the matching view.
  const legacy = APP_TABS.includes(tab as WorkspaceTab) ? (tab as WorkspaceTab) : undefined;
  useEffect(() => {
    if (!legacy) return;
    // Deferred: on a first page load the router subscribes to navigation after this effect runs.
    const t = setTimeout(() => navigate(info.appManagement ? changePath(storyId, legacy, hash || undefined)
      : storyPath(storyId, "progress"), { replace: true }), 0);
    return () => clearTimeout(t);
  }, [legacy, info.appManagement, storyId, hash]);

  useEffect(() => {
    if (change) rememberStory(info.session.activeCustomerId, change.id, storyTitle(change));
  }, [change?.id, info.session.activeCustomerId]);

  // A link to #next-action (notifications, My Work) scrolls to the decision.
  useEffect(() => {
    if (!hash || !change) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ block: "start" });
  }, [hash, change?.id]);

  if (legacy) return <Loading what="the change" />;
  if (error) return <ErrorState error={error} title="This story could not be opened" />;
  if (change === undefined || (change && !ctx)) return <Loading what="the story" />;
  if (change === null) {
    return (
      <ErrorState title="This story could not be found"
        error={new Error("It may have been removed, belong to another customer, or you may not have access to it.")} />
    );
  }

  const lc = change.lifecycle;
  const active: WorkspaceTab = tab === "outcome" ? "progress" : (TABS.find((t) => t.key === tab)?.key ?? "story");
  const domain = info.domainName(change.businessDomainId);
  const processPath = ctx!.process?.mapping?.status === "confirmed" ? ctx!.process.mapping.refs[0]?.path.map((p) => p.name) : undefined;
  const need = businessNeed(change);
  const amView = info.appManagement && (lc?.phaseIndex ?? 0) >= 2;

  return (
    <div className="workspace view-business">
      <div className="crumbs">
        <Link to="/stories">Business Demand</Link> <span aria-hidden="true">/</span> <span className="mono">{change.id}</span>
        {info.appManagement && <span className="crumbs-aside"><Link to={changePath(change.id)} className={amView ? "btn small" : undefined}>
          Open in Application Management</Link></span>}
      </div>
      <header className="storyheader">
        <div className="storyheader-context">
          {domain ? <Link to={`/business/${encodeURIComponent(change.businessDomainId!)}`}>{domain}</Link> : <span className="muted">No business domain yet</span>}
          {processPath && processPath.length > 0 && <><span aria-hidden="true"> / </span>{processPath[processPath.length - 1]}</>}
        </div>
        <h1 className="titlebar">{storyTitle(change)}</h1>
        <div className="storyheader-state">
          <span className="phase-strong">{lc?.phaseLabel ?? "—"}</span>
          <HealthIndicator lifecycle={lc} />
          <ImpactIndicator change={change} />
        </div>
        {need && <p className="storyheader-value">{need}</p>}
        <div className="storyheader-meta">
          <span className="mono">{change.id}</span> · {sourceLabel(change)} · updated {formatDate(change.updatedAt)}
        </div>
        <LifecycleStepper lifecycle={lc} />
      </header>

      <NextActionCard ctx={ctx!} />

      <Tabs label="Story sections" active={active} hrefFor={(k) => storyPath(change.id, k === "story" ? undefined : k)} tabs={TABS} />

      <div className="tabpanel">
        {active === "story" && <BusinessStoryTab ctx={ctx!} />}
        {active === "changes" && <ChangesTab ctx={ctx!} />}
        {active === "progress" && <ProgressTab ctx={ctx!} />}
        {active === "evidence" && <EvidenceTab ctx={ctx!} />}
      </div>
    </div>
  );
}
