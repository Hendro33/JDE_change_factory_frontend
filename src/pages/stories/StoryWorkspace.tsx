import { useEffect, useState } from "react";
import { api, IS_MOCK_MODE } from "../../services/api";
import { processApi, type StoryProcessView } from "../../services/processApi";
import { technicalApi, type TechnicalWorkView } from "../../services/technicalApi";
import type { ArchitectureReviewRun, Change, DomainReview, WorkspaceTab } from "../../types/domain";
import {
  ErrorState, ImpactIndicator, LifecycleStepper, Loading, HealthIndicator, SimulationBadge, Tabs,
  businessNeed, formatDate, sourceLabel, storyTitle, useSessionInfo,
} from "../../components/design";
import { Link, storyPath, useLocation } from "../../router";
import { NextActionCard } from "./NextActionCard";
import type { StoryCtx } from "./storyContext";
import { OverviewTab } from "./OverviewTab";
import { BusinessStoryTab } from "./BusinessStoryTab";
import { SolutionTab } from "./SolutionTab";
import { DeliveryTab } from "./DeliveryTab";
import { EvidenceTab } from "./EvidenceTab";
import { TechnicalTab } from "./TechnicalTab";

const TABS: { key: WorkspaceTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "story", label: "Business Story" },
  { key: "solution", label: "Solution" },
  { key: "delivery", label: "Delivery" },
  { key: "evidence", label: "Evidence & History" },
  { key: "technical", label: "Technical" },
];

/**
 * The one place a story lives. Clicking a story anywhere in Jade opens
 * this workspace: what the business needs, where it sits, what JADE
 * proposes, what decision is required, and what happens next -- with
 * every governed control that used to be spread over eight screens.
 */
export function StoryWorkspace({ storyId, tab }: { storyId: string; tab?: string }) {
  const info = useSessionInfo();
  const { hash } = useLocation();
  const [change, setChange] = useState<Change | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [domainReview, setDomainReview] = useState<DomainReview | null>(null);
  const [run, setRun] = useState<ArchitectureReviewRun | null>(null);
  const [process, setProcess] = useState<StoryProcessView | null>(null);
  const [tech, setTech] = useState<TechnicalWorkView | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    api.getChange(storyId).then((c) => { setChange(c ?? null); setError(null); }).catch((e) => setError(e));
  }, [storyId, tick]);

  const isStory = !!change && !["RECEIVED", "REFINING"].includes(change.state);
  useEffect(() => {
    if (!change || !isStory) return;
    api.getDomainReview(storyId).then((r) => setDomainReview(r ?? null)).catch(() => setDomainReview(null));
    api.getArchitectureReview(storyId).then((r) => setRun(r ?? null)).catch(() => setRun(null));
    if (IS_MOCK_MODE) return;
    processApi.story(storyId).then(setProcess).catch(() => setProcess(null));
    const route = change.lifecycle?.route ?? change.architectDecision?.recommendedRoute;
    if (route === "Technical Agent" || route === "Mixed") technicalApi.work(storyId).then(setTech).catch(() => setTech(null));
    else setTech(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, tick, isStory]);

  // While JADE itself is working, keep the page current without a manual refresh.
  const jadeWorking = change?.lifecycle?.nextAction.owner === "jade";
  useEffect(() => {
    if (!jadeWorking) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [jadeWorking]);

  // A link to #next-action (notifications, My Work) scrolls to the decision.
  useEffect(() => {
    if (!hash || !change) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ block: "start" });
  }, [hash, change?.id]);

  if (error) return <ErrorState error={error} title="This story could not be opened" />;
  if (change === undefined) return <Loading what="the story" />;
  if (change === null) {
    return (
      <ErrorState title="This story could not be found"
        error={new Error("It may have been removed, belong to another customer, or you may not have access to it.")} />
    );
  }

  const lc = change.lifecycle;
  const active = (TABS.find((t) => t.key === tab)?.key ?? "overview") as WorkspaceTab;
  const shownTab: WorkspaceTab = active === "technical" && !info.technical ? "overview" : active;
  const domain = info.domainName(change.businessDomainId);
  const processPath = process?.mapping?.status === "confirmed" ? process.mapping.refs[0]?.path.map((p) => p.name) : undefined;
  const need = businessNeed(change);
  const ctx: StoryCtx = { change, reload, domainReview, setDomainReview, run, setRun, process, tech };

  return (
    <div className="workspace">
      <div className="crumbs"><Link to="/stories">Stories</Link> <span aria-hidden="true">/</span> <span className="mono">{change.id}</span></div>
      <header className="storyheader">
        <div className="storyheader-context">
          {domain ? <Link to={`/business/${encodeURIComponent(change.businessDomainId!)}`}>{domain}</Link> : <span className="muted">No business domain yet</span>}
          {processPath && processPath.length > 0 && <><span aria-hidden="true"> / </span>{processPath[processPath.length - 1]}</>}
        </div>
        <h1>{storyTitle(change)}</h1>
        <div className="storyheader-state">
          <span className="phase-strong">{lc?.phaseLabel ?? "—"}</span>
          <HealthIndicator lifecycle={lc} />
          <ImpactIndicator change={change} />
          {lc?.simulated && <SimulationBadge />}
        </div>
        {need && <p className="storyheader-value">{need}</p>}
        <div className="storyheader-meta">
          <span className="mono">{change.id}</span> · {sourceLabel(change)} · updated {formatDate(change.updatedAt)}
        </div>
        <LifecycleStepper lifecycle={lc} />
      </header>

      <NextActionCard ctx={ctx} />

      <Tabs label="Story sections" active={shownTab} hrefFor={(k) => storyPath(change.id, k)}
            tabs={TABS.map((t) => ({ ...t, hidden: t.key === "technical" && !info.technical }))} />

      <div className="tabpanel">
        {shownTab === "overview" && <OverviewTab ctx={ctx} />}
        {shownTab === "story" && <BusinessStoryTab ctx={ctx} />}
        {shownTab === "solution" && <SolutionTab ctx={ctx} />}
        {shownTab === "delivery" && <DeliveryTab ctx={ctx} />}
        {shownTab === "evidence" && <EvidenceTab ctx={ctx} />}
        {shownTab === "technical" && <TechnicalTab ctx={ctx} />}
      </div>
    </div>
  );
}
