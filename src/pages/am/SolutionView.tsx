import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { deliveryApi } from "../../services/deliveryApi";
import { discoveryApi, type DesignBaselineView } from "../../services/discoveryApi";
import { technicalApi } from "../../services/technicalApi";
import { saveErrorMessage } from "../../services/saveErrors";
import type { Change, FeedbackReasonCode } from "../../types/domain";
import { AskJadePanel } from "../../components/AskJade";
import { ConfirmDialog } from "../../components/ui";
import { Details, EmptyState, ErrorState, formatDateTime, useSessionInfo } from "../../components/design";
import { IssueList, ResultSummary, WhatNeedsToHappen, openLabel } from "../../components/work";
import { JadeAtWorkLine, ProcessSwimlane } from "../../components/journey";
import { IntegrityPanel, SolutionArchitectureMap } from "../../components/visualReview";
import { StoryRatingsPanel } from "../../components/StoryRatings";
import { ExactChangeFacts, isChangeSet } from "../../components/ConfigurationItems";
import { StoryProcessPanel } from "../StoryProcess";
import { ROUTE_LABEL, cleanAgentText, type StoryCtx } from "../stories/storyContext";
import { Link } from "../../router";
import { changePath } from "../stories/useStory";
import { IconTile } from "../../components/icons";

const DECISIONS = new Set(["approve_exact_change", "approve_design", "authorise_handoff", "confirm_no_change"]);

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
        {standalone && <JadeAtWorkLine lifecycle={lc} />}
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
  // Counted as listed below: an expired authorisation is the decision above, not an open point.
  const openList = (lc?.issues ?? []).filter((i) => !i.resolution
    && !(lc?.authorisation?.renewable && i.source === "delivery_gate" && i.actionId === "approve_exact_change"));
  // Re-running is the Application Manager's call (review 23 Oct evening): the
  // button sits at the top and says how many answers came in since the design.
  const architectAtWork = lc?.nextAction.owner === "jade" && lc?.automation?.state !== "scheduled";
  const canRerun = info.has("product_manager", "admin") && change.changeApproval?.status !== "approved";
  const decidedAt = decision?.decidedAt ?? "";
  const newAnswers = (lc?.issues ?? []).filter((i) => i.resolution?.answer && i.resolution.at > decidedAt).length;
  const stillOpen = (lc?.issues ?? []).filter((i) => !i.resolution && i.kind !== "jade" && i.source !== "delivery_gate").length;
  const basis = evidence ? `Based on ${manifest?.observations.length ?? 0} reading${manifest?.observations.length === 1 ? "" : "s"} of the JD Edwards environment on ${formatDateTime(evidence.createdAt)}`
    + `${manifest?.documents.length ? `, ${manifest.documents.length} document${manifest.documents.length > 1 ? "s" : ""}` : ""}; open points: ${openLabel(openList)}.` : "";

  return (
    <div className="solutionview">
      {/* The next-step line above already says JADE is at work; said once. */}
      {standalone && <JadeAtWorkLine lifecycle={lc} />}
      {/* The rerun asks for attention only when answers came in since the design; otherwise it is a quiet button on the solution. */}
      {canRerun && newAnswers > 0 && (
        <div className="rerunbar ready card" role="region" aria-label="Run the Architect again">
          <div className="rerunbar-text">
            <strong>{newAnswers} answer{newAnswers === 1 ? "" : "s"} since this design</strong>
            <span>{stillOpen > 0 ? `${stillOpen} still open.` : "Nothing else is open."}</span>
          </div>
          <button className="btn primary" disabled={busy || architectAtWork} onClick={rerun}>
            {architectAtWork ? "The Architect is at work…" : busy ? "Starting…" : "Run the Architect again"}</button>
        </div>
      )}
      {error !== null && <ErrorState error={error} title="Not started" />}
      <DecisionPanel ctx={ctx} showWaiting={standalone} />

      <section className="solution-main card">
        {route && (
          <div className="route-head">
            <IconTile name="delivery" size="lg" />
            <div className="route-text"><h2 className="route-title">{route.title}</h2><span className="muted">{route.summary}</span></div>
            {canRerun && newAnswers === 0 && (
              <button className="btn small" disabled={busy || architectAtWork} onClick={rerun}>
                {architectAtWork ? "At work…" : busy ? "Starting…" : "Run the Architect again"}</button>
            )}
          </div>
        )}
        <ResultSummary change={change} hideConclusion={DECISIONS.has(lc?.nextAction.action ?? "") && info.has("product_manager", "admin")} />
      </section>
      {/* Who builds it, the risk and the effort: three small cards, as on consultiq.nl. */}
      {decision && (
        <ul className="glancecards">
          <li className="card"><IconTile name="run" size="sm" /><span className="gc-label">Who builds it</span>
            <span className="gc-value">{route?.title}</span>
            {spec?.humanActionsRequired.length ? <span className="gc-note">{spec.humanActionsRequired.length} step{spec.humanActionsRequired.length === 1 ? "" : "s"} by people</span> : null}</li>
          <li className="card"><IconTile name="blocked" size="sm" /><span className="gc-label">Risk</span>
            <span className="gc-value">{decision.dependenciesAndConflicts.length ? `${decision.dependenciesAndConflicts.length} dependenc${decision.dependenciesAndConflicts.length === 1 ? "y" : "ies"}` : "No dependencies"}</span>
            <span className="gc-note">{decision.rollbackStrategy ? "Rollback described" : "No rollback described"}</span></li>
          <li className="card"><IconTile name="test" size="sm" /><span className="gc-label">Effort</span>
            <span className="gc-value">{change.complexitySignal === "Unknown" ? "Not estimated" : change.complexitySignal}</span>
            <span className="gc-note">JADE's estimate</span></li>
        </ul>
      )}
      {/* Repair brief P3: the design and its basis come first; the conversation follows it. */}
        <AskJadePanel
          title="Ask JADE about this solution"
          turns={ctx.run?.conversation ?? []}
          onAsk={async (question) => { ctx.setRun(await api.askAboutSolution(change.id, { question })); }}
          renderProposeQuestionActions={(t) => info.has("product_manager", "admin") ? (
            <button className="btn small" disabled={busy} onClick={async () => {
              ctx.setRun(await api.applySolutionProposal(change.id, t.turnId)); ctx.reload();
            }}>Send the question</button>
          ) : null}
          renderRecommendReanalysisActions={() => info.has("product_manager", "admin") ? (
            <button className="btn primary" disabled={busy || architectAtWork} onClick={rerun}>Run the Architect again</button>
          ) : null}
        />
      {standalone && <WhatNeedsToHappen lifecycle={lc} changeId={change.id} skipPrimary title="Also open" limit={3} />}
      <IssueList change={change} onChange={() => ctx.reload()} skipNextAction={!DECISIONS.has(lc?.nextAction.action ?? "")}
        empty="No open points: nothing is waiting on anyone." />

      {ctx.process && (latestMap(ctx.process.maps.to_be.versions) || latestMap(ctx.process.maps.as_is.versions)) ? (
        <section className="panel">
          <ProcessSwimlane process={ctx.process} storyId={change.id} criteria={change.userStory?.acceptanceCriteria ?? []} />
          <Details summary="Process mapping and maps" id="process-edit">
            <StoryProcessPanel storyId={change.id} onChanged={ctx.reload} />
          </Details>
        </section>
      ) : (
        <Details summary="Business process — no map recorded (JADE uses one in the next design if you add it)" id="process-edit">
          <StoryProcessPanel storyId={change.id} onChanged={ctx.reload} />
        </Details>
      )}

      {decision && (
        <Details summary="Why this solution" id="why">
          {basis && <p className="designbasis">{basis} <Link to={changePath(change.id, "evidence")}>Design basis</Link></p>}
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
          <StoryRatingsPanel key={change.id} change={change} mode="technical" onChanged={ctx.reload} />
          {/* One supporting-detail section (register E16): the technical detail sits here too. */}
          <h4 id="technical-detail">Technical detail: objects, steps, risk, validation</h4>
          <TechnicalDetail change={change} decision={decision} spec={spec} />
        </Details>
      )}


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
  // The CURRENT authorisation, never the bare record: an expired or invalidated
  // approval asks for a decision again; the earlier approval stays as history.
  const auth = lc.authorisation;
  if (auth?.renewable) {
    const a = change.changeApproval;
    return (
      <section className="decision" id="decision" aria-label="Decision needed">
        <div className="decision-kicker">{auth.label}</div>
        <p className="decision-title">{auth.detail}</p>
        <Details summary="Earlier approvals">
          <ul className="compactlist">
            {a && <li>Approved by {a.approvedBy}{a.approvedAt ? ` on ${formatDateTime(a.approvedAt)}` : ""}{a.expiresAt ? `, valid until ${formatDateTime(a.expiresAt)}` : ""}{a.note ? ` — “${a.note}”` : ""}</li>}
            {auth.history.map((h, i) => <li key={i}>Approved by {h.by}{h.at ? ` on ${formatDateTime(h.at)}` : ""}; superseded{h.supersededAt ? ` on ${formatDateTime(h.supersededAt)}` : ""}: {h.reason}</li>)}
          </ul>
        </Details>
        {ec && <Details summary="The exact change"><ExactChangeFacts ec={ec} showDelivery={false} /></Details>}
        {canDecide ? (
          <div className="btnrow">
            <button className="btn primary" disabled={busy} onClick={() => setDialog("approve")}>Authorise again</button>
          </div>
        ) : <p className="muted">The Application Manager decides this.</p>}
        {error && <div className="callout" role="alert" style={{ borderColor: "var(--stop)", marginTop: 12 }}><strong>Not recorded</strong>{error}</div>}
        {dialog && (
          <ConfirmDialog title="Authorise this exact change again?"
            intro={<><p style={{ marginTop: 0 }}><strong>{change.title}</strong> <span className="mono muted">{change.id}</span></p>{ec && <ExactChangeFacts ec={ec} showDelivery={false} />}</>}
            whatHappensNext="A new approval is recorded under the current approval policy; the earlier one stays in the history. JADE re-checks everything against DEV before it is applied."
            confirmLabel="Authorise again" tone="primary" requireNote={false}
            onCancel={() => setDialog(null)}
            onConfirm={async (note) => {
              setBusy(true); setError(null);
              try { await api.approveExactChange(change.id, { note }); ctx.reload(); }
              catch (e) { setError(saveErrorMessage(e, "The decision could not be recorded.")); }
              finally { setBusy(false); setDialog(null); }
            }} />
        )}
      </section>
    );
  }
  if (change.changeApproval && change.changeApproval.status !== "pending") {
    const a = change.changeApproval;
    return <section className="decision decided" id="decision"><div className="decision-kicker">Decision</div>
      <p>Implementation <strong>{a.status === "approved" ? "authorised" : "rejected"}</strong> by {a.approvedBy}{a.approvedAt ? ` on ${formatDateTime(a.approvedAt)}` : ""}{a.status === "approved" && auth?.state === "valid" && a.expiresAt ? `, valid until ${formatDateTime(a.expiresAt)}` : ""}{auth?.state === "used" ? "; applied in DEV" : ""}.{a.note ? <span className="muted"> “{a.note}”</span> : null}</p>
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
  const label = na.action === "confirm_no_change" ? "Confirm: resolved without a change"
    : route === "Human Implementation" ? "Authorise implementation by a person" : route === "Technical Agent" || route === "Mixed"
    ? "Authorise the design" : "Authorise implementation";

  async function decide(note: string, reason?: string) {
    setBusy(true); setError(null);
    try {
      if (dialog === "reject") await api.rejectExactChange(change.id, { note, rejectionReason: reason as FeedbackReasonCode | undefined });
      else if (na!.action === "approve_exact_change") await api.approveExactChange(change.id, { note });
      else if (na!.action === "approve_design") await technicalApi.approveDesign(change.id, ctx.tech!.assignment!.design_revision, note);
      else if (na!.action === "authorise_handoff") await deliveryApi.authoriseHandoff(change.id, note);
      else if (na!.action === "confirm_no_change") await api.confirmResolvedWithoutChange(change.id, { note });
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
          {na.action === "confirm_no_change" && <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true); try { await api.retriggerArchitectureReview(change.id); ctx.reload(); }
            catch (e) { setError(saveErrorMessage(e, "The Architect could not be started.")); } finally { setBusy(false); } }}>Ask the Architect to look again</button>}
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

function latestMap<T>(versions: T[] | undefined): T | undefined {
  return versions && versions.length ? versions[versions.length - 1] : undefined;
}

/**
 * The solution's technical content, structured (finding 4): an aligned table of
 * JD Edwards objects, the exact change, the steps, dependencies, rollback,
 * validation and the operations JADE uses -- the agent's fields, each in its
 * own row at full width, never narrative squeezed into columns.
 */
function TechnicalDetail({ change, decision, spec }: { change: Change; decision: NonNullable<Change["architectDecision"]>; spec: Change["implementationSpec"] }) {
  const ec = change.exactChange;
  const none = <span className="muted">None recorded</span>;
  return (
    <dl className="techdetail">
      <dt>JD Edwards objects</dt>
      <dd>{decision.objectsAffected.length ? <ul className="monolist">{decision.objectsAffected.map((o) => <li key={o} className="mono">{o}</li>)}</ul> : none}</dd>
      {ec && <><dt>The exact change</dt><dd><ExactChangeFacts ec={ec} showDelivery={false} /></dd></>}
      <dt>Implementation steps</dt>
      <dd>{spec?.sequence.length ? <ol className="steplist">{spec.sequence.map((st, i) => <li key={i}>{st}</li>)}</ol> : none}</dd>
      <dt>Done by people</dt>
      <dd>{spec?.humanActionsRequired.length ? <ul className="steplist">{spec.humanActionsRequired.map((h, i) => <li key={i}>{h}</li>)}</ul> : "Nothing; JADE's agents apply it"}</dd>
      <dt>Dependencies and conflicts</dt>
      <dd>{decision.dependenciesAndConflicts.length ? <ul className="steplist">{decision.dependenciesAndConflicts.map((d, i) => <li key={i}>{d}</li>)}</ul> : "None identified"}</dd>
      <dt>Rollback</dt>
      <dd>{decision.rollbackStrategy || none}</dd>
      <dt>Validation</dt>
      <dd>{spec?.validationApproach || none}</dd>
      <dt>Operations JADE uses</dt>
      <dd>{spec?.requiredMcpOperations.length ? <ul className="monolist">{spec.requiredMcpOperations.map((o) => <li key={o} className="mono">{o}</li>)}</ul> : none}</dd>
    </dl>
  );
}
