import { useEffect } from "react";
import type { WorkspaceTab } from "../../types/domain";
import {
  Details, ErrorState, HealthIndicator, LifecycleStepper, Loading, Section, Tabs, formatDateTime, storyTitle, useSessionInfo,
} from "../../components/design";
import { WorkItemsList } from "../../components/journey";
import { DesignEvidencePanel } from "../../components/DesignEvidencePanel";
import { Link, navigate, storyPath, useLocation } from "../../router";
import { NextActionCard } from "../stories/NextActionCard";
import { DeliveryTab } from "../stories/DeliveryTab";
import { EvidenceTab } from "../stories/EvidenceTab";
import { TechnicalTab } from "../stories/TechnicalTab";
import { TechnicalWorkPanel } from "../TechnicalPanel";
import { AsBuiltPanel } from "../AsBuiltPanel";
import { ChangeDetail } from "./ChangeDetail";
import { HandoffPanel } from "./HandoffPanel";
import { SolutionView } from "./SolutionView";
import { changePath, useStory } from "../stories/useStory";
import type { StoryCtx } from "../stories/storyContext";

const TABS: { key: WorkspaceTab; label: string }[] = [
  { key: "solution", label: "Solution" },
  { key: "delivery", label: "Delivery" },
  { key: "evidence", label: "Evidence" },
  { key: "technical", label: "Technical" },
  { key: "record", label: "Change record" },
];
const TECHNICAL = new Set(["Technical Agent", "Mixed"]);

/**
 * The application view of a change (Application Management): the solution
 * and its decision, the delivery with who does what, the evidence in three
 * kinds, the technical detail and the full change record. The business view
 * of the same record is the story in Business Demand.
 */
export function ChangeView({ changeId, tab }: { changeId: string; tab?: string }) {
  const info = useSessionInfo();
  const { hash } = useLocation();
  const { change, error, ctx } = useStory(changeId);

  useEffect(() => {
    if (!hash || !change) return;
    const el = document.getElementById(hash);
    if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 50);
  }, [hash, change?.id, tab]);

  if (error) return <ErrorState error={error} title="This change could not be opened" />;
  if (change === undefined || (change && !ctx)) return <Loading what="the change" />;
  if (change === null) return <ErrorState title="This change could not be found" error={new Error("It may have been removed or belong to another customer.")} />;

  const lc = change.lifecycle;
  const active: WorkspaceTab = (TABS.find((t) => t.key === tab)?.key ?? "solution");
  const route = lc?.route ?? change.architectDecision?.recommendedRoute;

  return (
    <div className="workspace view-application">
      <div className="crumbs">
        <Link to="/am">Application Management</Link> <span aria-hidden="true">/</span> <Link to="/am/changes">Changes</Link>{" "}
        <span aria-hidden="true">/</span> <span className="mono">{change.id}</span>
        <span className="crumbs-aside"><Link to={storyPath(change.id)}>Business view</Link></span>
      </div>
      <header className="storyheader compact">
        <h1 className="titlebar">{storyTitle(change)}</h1>
        <div className="storyheader-state">
          <span className="phase-strong">{lc?.phaseLabel ?? "—"}</span>
          <HealthIndicator lifecycle={lc} />
          {route && <span className="muted">{route}</span>}
          <span className="mono muted">{change.id}</span>
          {info.domainName(change.businessDomainId) && <span className="muted">{info.domainName(change.businessDomainId)}</span>}
        </div>
        <LifecycleStepper lifecycle={lc} compact />
      </header>

      {/* On the Solution tab a pending decision is the decision card itself; elsewhere the next step leads. */}
      {!(active === "solution" && ["approve_exact_change", "approve_design", "authorise_handoff"].includes(lc?.nextAction.action ?? "")
        && info.has("product_manager", "admin")) && <NextActionCard ctx={ctx!} inApp />}

      <Tabs label="Change sections" active={active} hrefFor={(k) => changePath(change.id, k as WorkspaceTab)} tabs={TABS} />

      <div className="tabpanel">
        {active === "solution" && <SolutionView ctx={ctx!} />}
        {active === "delivery" && <DeliveryView ctx={ctx!} technical={TECHNICAL.has(route ?? "")} />}
        {active === "evidence" && <EvidenceView ctx={ctx!} />}
        {active === "technical" && <TechnicalTab ctx={ctx!} />}
        {active === "record" && <ChangeDetail embedded changeId={change.id} onBack={() => navigate(changePath(change.id))} />}
      </div>
    </div>
  );
}

/** Delivery: who does what, in order; the hand-offs; then the governed delivery controls. */
function DeliveryView({ ctx, technical }: { ctx: StoryCtx; technical: boolean }) {
  const info = useSessionInfo();
  const lc = ctx.change.lifecycle;
  return (
    <div className="deliveryview">
      <div id="work" />
      {lc && lc.workItems.length > 0 && <section className="panel"><WorkItemsList items={lc.workItems} title="Who does what, in order" /></section>}
      <HandoffPanel change={ctx.change} onChanged={ctx.reload} />
      {technical ? (
        <>
          <Section title="Technical implementation">
            <TechnicalWorkPanel storyId={ctx.change.id} roles={info.roles} onChanged={ctx.reload} />
          </Section>
          <Section id="release" title="Release and as-built record"
                   description="Finalising the as-built record hands the change over for release; promotion beyond DEV stays with CNC.">
            <AsBuiltPanel storyId={ctx.change.id} onChanged={ctx.reload} />
          </Section>
        </>
      ) : <DeliveryTab ctx={ctx} />}
    </div>
  );
}

/** Evidence in three kinds: what the design rests on, what was changed, what was verified; then decisions and history. */
function EvidenceView({ ctx }: { ctx: StoryCtx }) {
  const { change } = ctx;
  const lc = change.lifecycle;
  const delivered = (lc?.workItems ?? []).filter((w) => w.state === "done" && ["configuration", "development", "handoff"].includes(w.group));
  const tests = (lc?.workItems ?? []).filter((w) => w.group === "verification");
  return (
    <div className="evidenceview">
      <Section title="Design basis" description="What JADE's recommendation rests on: its readings of the JD Edwards environment, the documents and the process context.">
        {ctx.run && ctx.run.history.length > 0
          ? <DesignEvidencePanel changeId={change.id} designCount={ctx.run.history.length} />
          : <p className="muted">No design yet.</p>}
      </Section>
      <Section title="Delivery evidence" description="What was changed, by whom, with what evidence.">
        {delivered.length === 0 ? <p className="muted">Nothing delivered yet.</p> : (
          <ul className="evidence-list">{delivered.map((w) => (
            <li key={w.id}><strong>{w.title}</strong> — {w.completedBy || w.who}{w.completedAt ? `, ${formatDateTime(w.completedAt)}` : ""}
              {(w.evidenceReference || w.detail) && <span className="muted"> · {w.evidenceReference ? `evidence: ${w.evidenceReference}` : w.detail}</span>}</li>
          ))}</ul>
        )}
      </Section>
      <Section title="Test results" description="What was verified in DEV. Verified in DEV is not accepted by the business, and not released.">
        {tests.length === 0 ? <p className="muted">No verification yet.</p> : (
          <ul className="evidence-list">{tests.map((w) => (
            <li key={w.id}><strong>{w.title}</strong>: {w.state === "done" ? "passed" : w.state === "failed" ? "did not pass" : "not run yet"}{w.detail ? <span className="muted"> · {w.detail}</span> : null}</li>
          ))}</ul>
        )}
        {lc?.outcomeCard && <p>Business acceptance: <strong>{lc.outcomeCard.businessAccepted.done ? `accepted by ${lc.outcomeCard.businessAccepted.by}` : lc.outcomeCard.notAccepted ? "not accepted" : "not yet"}</strong></p>}
      </Section>
      <Details summary="Decisions, timeline and the evidence log" open>
        <EvidenceTab ctx={ctx} />
      </Details>
    </div>
  );
}
