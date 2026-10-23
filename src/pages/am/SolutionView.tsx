import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { deliveryApi } from "../../services/deliveryApi";
import { discoveryApi, type DesignBaselineView } from "../../services/discoveryApi";
import { technicalApi } from "../../services/technicalApi";
import { saveErrorMessage } from "../../services/saveErrors";
import type { FeedbackReasonCode } from "../../types/domain";
import { AskJadePanel } from "../../components/AskJade";
import { ConfirmDialog } from "../../components/ui";
import { Details, EmptyState, ErrorState, formatDateTime, useSessionInfo } from "../../components/design";
import { IssueList, ResultSummary, WhatNeedsToHappen } from "../../components/work";
import { JadeAtWorkLine, ProcessSwimlane } from "../../components/journey";
import { IntegrityPanel, SolutionArchitectureMap } from "../../components/visualReview";
import { StoryRatingsPanel } from "../../components/StoryRatings";
import { ExactChangeFacts, isChangeSet } from "../../components/ConfigurationItems";
import { StoryProcessPanel } from "../StoryProcess";
import { ROUTE_LABEL, cleanAgentText, type StoryCtx } from "../stories/storyContext";
import { Link } from "../../router";
import { changePath } from "../stories/useStory";

const DECISIONS = new Set(["approve_exact_change", "approve_design", "authorise_handoff"]);

/**
 * The one authoritative solution view of a change (review, changes 1 and 3):
 * the decision first, then JADE's conclusion with the changes before ->
 * after, what needs to happen, the open points with their owners, the process
 * beside the solution, and "Why this solution" on demand. Architecture Review
 * and the change record both show exactly this.
 */
/** standalone: shown without the change's next-action card (Architecture Review), so it says what the change waits for itself. */
export function SolutionView({ ctx, standalone = false }: { ctx: StoryCtx; standalone?: boolean }) {
  const { change } = ctx;
  const info = useSessionInfo();
  const lc = change.lifecycle;
  const decision = ctx.run?.architectDecision ?? change.architectDecision;
  const spec = ctx.run?.implementationSpec ?? change.implementationSpec;
  const [evidence, setEvidence] = useState<DesignBaselineView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!decision) return;
    discoveryApi.designEvidence(change.id).then((b) => setEvidence(b[0] ?? null)).catch(() => setEvidence(null));
  }, [change.id, ctx.run?.history.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rerun() {
    setBusy(true); setError(null);
    try { await api.retriggerArchitectureReview(change.id); ctx.reload(); } catch (e) { setError(e); } finally { setBusy(false); }
  }

  if (!decision && !change.exactChange) {
    return (
      <div className="solutionview">
        <JadeAtWorkLine lifecycle={lc} />
        {lc?.nextAction.owner !== "jade" && (
          <EmptyState title={(lc?.phaseIndex ?? 0) < 2 ? "Solutioning starts once the story is admitted to architecture" : "No solution proposed yet"}>
            {ctx.run?.stage === "failed" ? "The last analysis did not finish. See the next step above." : lc?.nextAction.summary}
          </EmptyState>
        )}
      </div>
    );
  }

  const route = decision ? ROUTE_LABEL[decision.recommendedRoute] ?? { title: decision.recommendedRoute, summary: "" } : undefined;
  const manifest = evidence?.manifest;
  const openPoints = (lc?.issues ?? []).filter((i) => !i.resolution && i.kind !== "jade").length;
  const basis = evidence ? `Based on ${manifest?.observations.length ?? 0} reading${manifest?.observations.length === 1 ? "" : "s"} of the JD Edwards environment on ${formatDateTime(evidence.createdAt)}`
    + `${manifest?.documents.length ? `, ${manifest.documents.length} document${manifest.documents.length > 1 ? "s" : ""}` : ""}; ${openPoints} open point${openPoints === 1 ? "" : "s"}.` : "";

  return (
    <div className="solutionview">
      <JadeAtWorkLine lifecycle={lc} />
      <DecisionPanel ctx={ctx} showWaiting={standalone} />

      <section className="panel solution-main">
        {route && <div className="route-line"><span className="route-title">{route.title}</span><span className="muted"> · {route.summary}</span></div>}
        <ResultSummary change={change} hideConclusion={DECISIONS.has(lc?.nextAction.action ?? "") && info.has("product_manager", "admin")} />
        {basis && <p className="designbasis">{basis} <Link to={changePath(change.id, "evidence")}>Design basis</Link></p>}
        {standalone && <WhatNeedsToHappen lifecycle={lc} changeId={change.id} />}
        <IssueList change={change} onChange={() => ctx.reload()} empty="No open points: nothing is waiting on anyone." />
      </section>

      <section className="panel">
        <ProcessSwimlane process={ctx.process} storyId={change.id} criteria={change.userStory?.acceptanceCriteria ?? []}
          empty="No current or proposed process map is recorded for this change. Add them under “Process mapping and maps” below; JADE uses them in the next design." />
        <Details summary="Process mapping and maps" id="process-edit">
          <StoryProcessPanel storyId={change.id} onChanged={ctx.reload} />
        </Details>
      </section>

      {decision && (
        <Details summary="Why this solution" id="why">
          <SolutionArchitectureMap change={change} decision={decision} spec={spec} domain={info.domainName(change.businessDomainId)} mapping={ctx.process?.mapping} />
          <IntegrityPanel decision={decision} />
          {cleanAgentText(decision.existingFunctionalityFound).text && (
            <><h4>What exists today</h4><p>{cleanAgentText(decision.existingFunctionalityFound).text}</p></>
          )}
          {decision.alternativesConsidered.length > 0 && (
            <><h4>Why this, and not something simpler</h4>
              <table className="data"><thead><tr><th>Considered</th><th>Why it was not chosen</th></tr></thead>
                <tbody>{decision.alternativesConsidered.map((a, i) => <tr key={i}><td>{a.approach}</td><td>{a.whyNot}</td></tr>)}</tbody></table></>
          )}
          <div className="solution-grid">
            <div><h4>Implementation steps</h4>
              {spec?.sequence.length ? <ol className="compactlist">{spec.sequence.map((s, i) => <li key={i}>{s}</li>)}</ol> : <p className="muted">No steps recorded.</p>}
              {decision.objectsAffected.length > 0 && <p className="muted">JD Edwards objects: <span className="mono">{decision.objectsAffected.join(", ")}</span></p>}
              {spec?.humanActionsRequired.length ? <p className="muted">People involved: {spec.humanActionsRequired.join("; ")}</p> : null}
            </div>
            <div><h4>Risk and rollback</h4>
              {decision.dependenciesAndConflicts.length ? <ul className="compactlist">{decision.dependenciesAndConflicts.map((d, i) => <li key={i}>{d}</li>)}</ul> : <p>No conflicts identified.</p>}
              {decision.rollbackStrategy && <p className="muted">If it needs undoing: {decision.rollbackStrategy}</p>}
            </div>
            <div><h4>How it will be validated</h4><p>{spec?.validationApproach || <span className="muted">Not stated.</span>}</p></div>
            <div><h4>Effort</h4><p>{change.complexitySignal === "Unknown" ? <span className="muted">Not estimated.</span> : `${change.complexitySignal} complexity (JADE's estimate, not a commitment).`}</p>
              {spec && spec.requiredMcpOperations.length > 0 && <p className="muted">Operations: <span className="mono">{spec.requiredMcpOperations.join(", ")}</span></p>}</div>
          </div>
          <StoryRatingsPanel key={change.id} change={change} mode="technical" onChanged={ctx.reload} />
        </Details>
      )}

      <div id="ask">
        <AskJadePanel
          title="Discuss the solution with JADE"
          turns={ctx.run?.conversation ?? []}
          onAsk={async (question) => { ctx.setRun(await api.askAboutSolution(change.id, { question })); }}
          renderRecommendReanalysisActions={() => info.has("product_manager", "admin") ? (
            <button className="btn primary" disabled={busy || lc?.nextAction.owner === "jade"} onClick={rerun}>Run the Architect again</button>
          ) : null}
        />
      </div>

      {ctx.domainReview && (
        <Details summary="Discuss the requirement">
          <AskJadePanel
            title="Ask JADE about this requirement"
            turns={ctx.domainReview.conversation}
            currentStory={change.userStory ?? undefined}
            onAsk={async (question) => { ctx.setDomainReview(await api.askAboutRequirement(change.id, { question })); }}
            renderAmendmentActions={(turn) => (
              <button className="btn" onClick={async () => {
                ctx.setDomainReview(await api.requestRequirementReconsideration(change.id, {
                  note: `Flagged from Ask JADE about this requirement: "${turn.question}"` }));
              }}>Flag for Domain Owner reconsideration</button>
            )}
          />
        </Details>
      )}

      {info.has("product_manager", "admin") && change.changeApproval?.status !== "approved" && (
        <div className="btnrow rerun-row">
          <button className="btn" disabled={busy || lc?.nextAction.owner === "jade"} onClick={rerun}>
            {lc?.nextAction.owner === "jade" ? "The Architect is at work…" : busy ? "Starting…" : "Run the Architect again"}</button>
          <span className="hint">Earlier designs and the conversation are kept.</span>
        </div>
      )}
      {error !== null && <ErrorState error={error} title="Not started" />}

      {ctx.run && ctx.run.history.length > 1 && (
        <Details summary={`Earlier designs (${ctx.run.history.length - 1})`}>
          <ol className="versions">{[...ctx.run.history].reverse().slice(1).map((v, i) => (
            <li key={i}><strong>{ROUTE_LABEL[v.architectDecision.recommendedRoute]?.title ?? v.architectDecision.recommendedRoute}</strong> · {formatDateTime(v.capturedAt)}
              <div>{v.architectDecision.result?.conclusion || cleanAgentText(v.architectDecision.existingFunctionalityFound).text}</div>
              {v.note && <div className="muted">{v.note}</div>}</li>
          ))}</ol>
        </Details>
      )}
    </div>
  );
}

/**
 * The decision in one card: what is decided, what it means, and the buttons.
 * "Authorise implementation" exists only once nothing blocks it (the scope
 * is defined); until then the card says what the change is waiting for.
 */
function DecisionPanel({ ctx, showWaiting }: { ctx: StoryCtx; showWaiting: boolean }) {
  const { change } = ctx;
  const info = useSessionInfo();
  const lc = change.lifecycle;
  const na = lc?.nextAction;
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!lc || !na) return null;
  const route = change.architectDecision?.recommendedRoute;
  const ec = change.exactChange;
  const canDecide = info.has("product_manager", "admin");

  // Already decided: who authorised it, and when.
  const designApproval = ctx.tech?.assignment?.design_approval;
  if (change.changeApproval && change.changeApproval.status !== "pending") {
    const a = change.changeApproval;
    return <section className="decision decided" id="decision"><div className="decision-kicker">Decision</div>
      <p>Implementation <strong>{a.status === "approved" ? "authorised" : "rejected"}</strong> by {a.approvedBy}{a.approvedAt ? ` on ${formatDateTime(a.approvedAt)}` : ""}.{a.note ? <span className="muted"> “{a.note}”</span> : null}</p>
      {ec && <Details summary={a.status === "approved" ? "The exact change, as authorised" : "The exact change"}><ExactChangeFacts ec={ec} showDelivery={false} /></Details>}</section>;
  }
  if (designApproval && (route === "Technical Agent" || route === "Mixed")) {
    return <section className="decision decided" id="decision"><div className="decision-kicker">Decision</div>
      <p>Design <strong>authorised</strong> for implementation by {designApproval.approved_by} on {formatDateTime(designApproval.approved_at)}. The exact package is approved separately in Delivery.</p></section>;
  }
  if (route === "Human Implementation" && lc.handoffAuthorised) {
    return <section className="decision decided" id="decision"><div className="decision-kicker">Decision</div>
      <p>Implementation by a person <strong>authorised</strong>. The specification and the hand-off items are in <Link to={changePath(change.id, "delivery", "handoff")}>Delivery</Link>.</p></section>;
  }

  const blocked = lc.phase === "solution_review" && lc.health === "blocked";
  if (!DECISIONS.has(na.action ?? "") && !blocked) return null;

  if (blocked) {
    if (!showWaiting) return null;
    return (
      <section className="decision waiting" id="decision" aria-label="Decision">
        <div className="decision-kicker">Waiting for {na.ownerLabel || "an answer"}</div>
        <p className="decision-title">{na.summary}</p>
        <p className="decision-effect">Authorising the implementation becomes available once the open points that block it are answered. JADE then reassesses the solution.</p>
      </section>
    );
  }

  const conclusion = change.architectDecision?.result?.conclusion || na.summary;
  const label = route === "Human Implementation" ? "Authorise implementation by a person" : route === "Technical Agent" || route === "Mixed"
    ? "Authorise the design" : "Authorise implementation";

  async function decide(note: string, reason?: string) {
    setBusy(true); setError(null);
    try {
      if (dialog === "reject") await api.rejectExactChange(change.id, { note, rejectionReason: reason as FeedbackReasonCode | undefined });
      else if (na!.action === "approve_exact_change") await api.approveExactChange(change.id, { note });
      else if (na!.action === "approve_design") await technicalApi.approveDesign(change.id, ctx.tech!.assignment!.design_revision, note);
      else if (na!.action === "authorise_handoff") await deliveryApi.authoriseHandoff(change.id, note);
      ctx.reload();
    } catch (e) { setError(saveErrorMessage(e, "The decision could not be recorded.")); } finally { setBusy(false); setDialog(null); }
  }

  return (
    <section className="decision" id="decision" aria-label="Decision needed">
      <div className="decision-kicker">Decision needed</div>
      <p className="decision-title">{conclusion}</p>
      {na.effect && <p className="decision-effect"><strong>If authorised: </strong>{na.effect}</p>}
      {ec && na.action === "approve_exact_change" && <Details open summary={isChangeSet(ec) ? `The exact change you authorise (${ec.items?.length} items)` : "The exact change you authorise"}>
        <ExactChangeFacts ec={ec} showDelivery={false} /></Details>}
      {canDecide ? (
        <div className="btnrow">
          <button className="btn primary" disabled={busy || (na.action === "approve_design" && !ctx.tech?.assignment)} onClick={() => setDialog("approve")}>{label}</button>
          {na.action === "approve_exact_change" && <button className="btn" disabled={busy} onClick={() => setDialog("reject")}>Reject</button>}
          {na.action === "authorise_handoff" && <button className="btn" onClick={() => deliveryApi.downloadSpecification(change.id).catch((e) => setError(saveErrorMessage(e, "The specification could not be downloaded.")))}>Download the specification (PDF)</button>}
          <a className="btn quiet" href="#ask">Discuss the solution</a>
        </div>
      ) : <p className="muted">The Application Manager decides this.</p>}
      {error && <div className="callout" role="alert" style={{ borderColor: "var(--stop)", marginTop: 12 }}><strong>Not recorded</strong>{error}</div>}
      {dialog && (
        <ConfirmDialog
          title={dialog === "approve" ? `${label}?` : "Reject this exact change?"}
          intro={<><p style={{ marginTop: 0 }}><strong>{change.title}</strong> <span className="mono muted">{change.id}</span></p>
            {ec && na.action === "approve_exact_change" && <ExactChangeFacts ec={ec} showDelivery={false} />}</>}
          whatHappensNext={dialog === "reject" ? "This exact change is refused. Nothing changes in JD Edwards; JADE can propose a different solution."
            : na.effect || "Exactly this is authorised; anything different is refused."}
          confirmLabel={dialog === "approve" ? label : "Reject exact change"}
          tone={dialog === "approve" ? "primary" : "danger"}
          requireNote={dialog === "reject"} showReasonCode={dialog === "reject"}
          onCancel={() => setDialog(null)}
          onConfirm={(note, reason) => decide(note, reason)}
        />
      )}
    </section>
  );
}
