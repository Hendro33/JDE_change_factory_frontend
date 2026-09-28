import { ReviewDetail, SolutionArchitectureMap, IntegrityPanel } from "../../components/visualReview";
import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { discoveryApi, type DesignBaselineView } from "../../services/discoveryApi";
import { AskJadePanel } from "../../components/AskJade";
import { DesignEvidencePanel } from "../../components/DesignEvidencePanel";
import {
  Details, EmptyState, ErrorState, JadeWorking, Section, formatDateTime, useSessionInfo,
} from "../../components/design";
import { ExactChangeSummary } from "./NextActionCard";
import { ROUTE_LABEL, cleanAgentText, type StoryCtx } from "./storyContext";

/**
 * The Solution: one coherent proposal the Application Manager can judge -- what
 * JADE proposes, why it solves the need, what it touches, the risk and the
 * test approach. JADE owns the proposal; which agent wrote which part is
 * not the reader's problem (it is in the Technical view).
 */
export function SolutionTab({ ctx }: { ctx: StoryCtx }) {
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
  }, [change.id, ctx.run?.history.length]);

  if (!decision && change.exactChange) {
    // A proposed exact change without a recorded solution analysis (e.g. proposed directly):
    // the exact change is the whole proposal.
    return (
      <div className="solution vr-pilot">
        <Section title="Proposed solution" description="An exact, reviewable change. No wider solution analysis is recorded for this story.">
          <ExactChangeSummary ctx={ctx} />
        </Section>
        <DecisionSection ctx={ctx} />
      </div>
    );
  }

  if (!decision) {
    if (ctx.run?.stage === "analyzing") return <JadeWorking>JADE is researching the JD Edwards environment and preparing a solution.</JadeWorking>;
    return (
      <EmptyState title={(lc?.phaseIndex ?? 0) < 2 ? "Solutioning starts once the story is approved" : "No solution proposed yet"}>
        {(lc?.phaseIndex ?? 0) < 2
          ? "When the story is approved and delivery is authorised, JADE researches the JD Edwards environment and proposes a solution here."
          : ctx.run?.stage === "failed" ? "The last analysis did not finish. See the next step above." : lc?.nextAction.summary}
      </EmptyState>
    );
  }

  const route = ROUTE_LABEL[decision.recommendedRoute] ?? { title: decision.recommendedRoute, summary: "" };
  const found = cleanAgentText(decision.existingFunctionalityFound);
  const processes = ctx.process?.mapping?.status === "confirmed" ? ctx.process.mapping.refs : [];
  const manifest = evidence?.manifest;
  const basedOn = [
    ...(processes.length ? [`The confirmed business process${processes.length > 1 ? "es" : ""}: ${processes.map((p) => p.path[p.path.length - 1]?.name).join(", ")}`] : []),
    ...(manifest?.observations.length ? [`${manifest.observations.length} reading${manifest.observations.length > 1 ? "s" : ""} of the JD Edwards environment`] : []),
    ...(manifest?.artifacts.length ? [`${manifest.artifacts.length} imported JD Edwards object source${manifest.artifacts.length > 1 ? "s" : ""}`] : []),
    ...(manifest?.documents.length ? [`${manifest.documents.length} customer document${manifest.documents.length > 1 ? "s" : ""}`] : []),
    ...(decision.alternativesConsidered.length ? [`${decision.alternativesConsidered.length} simpler option${decision.alternativesConsidered.length > 1 ? "s" : ""} considered and ruled out`] : []),
  ];
  const uncertainty = [
    ...(manifest?.gaps ?? []).map((g) => g.description),
    ...(manifest?.contradictions ?? []),
    ...(manifest?.confidence_limitations ?? []),
    ...(lc?.openItems ?? []),
  ];
  return (
    <div className="solution vr-pilot">
      <SolutionArchitectureMap change={change} decision={decision} spec={spec} domain={info.domainName(change.businessDomainId)} mapping={ctx.process?.mapping} />
      <IntegrityPanel decision={decision} />
      <ReviewDetail title="Full solution rationale">
      <Section title="Proposed solution">
        <p className="lead-strong">{route.title}</p>
        <p className="muted">{route.summary}</p>
        {found.text && <p>{found.text}</p>}
        {change.exactChange && <ExactChangeSummary ctx={ctx} />}
      </Section>

      </ReviewDetail>
      <div className="solution-grid">
        <ReviewDetail title="Implementation steps & objects">
          {spec?.sequence.length ? <ol className="compactlist">{spec.sequence.map((s, i) => <li key={i}>{s}</li>)}</ol> : <p className="muted">No steps recorded.</p>}
          {decision.objectsAffected.length > 0 && <p className="muted">JD Edwards objects: <span className="mono">{decision.objectsAffected.join(", ")}</span></p>}
        </ReviewDetail>
        <ReviewDetail title="Full risk & rollback notes">
          {decision.dependenciesAndConflicts.length
            ? <ul className="compactlist">{decision.dependenciesAndConflicts.map((d, i) => <li key={i}>{d}</li>)}</ul>
            : <p>No conflicts identified.</p>}
          {decision.rollbackStrategy && <p className="muted">If it needs undoing: {decision.rollbackStrategy}.</p>}
        </ReviewDetail>
        <ReviewDetail title="Validation approach">
          <p>{spec?.validationApproach || <span className="muted">Not stated.</span>}</p>
          {spec?.humanActionsRequired.length ? <p className="muted">People involved: {spec.humanActionsRequired.join("; ")}</p> : null}
        </ReviewDetail>
        <ReviewDetail title="Effort assessment">
          <p>{change.complexitySignal === "Unknown" ? <span className="muted">Not estimated.</span> : `${change.complexitySignal} complexity (JADE's estimate, not a commitment).`}</p>
        </ReviewDetail>
      </div>

      {decision.alternativesConsidered.length > 0 && (
        <Section title="Why this, and not something simpler">
          <table className="data"><thead><tr><th>Considered</th><th>Why it was not chosen</th></tr></thead>
            <tbody>{decision.alternativesConsidered.map((a, i) => <tr key={i}><td>{a.approach}</td><td>{a.whyNot}</td></tr>)}</tbody></table>
        </Section>
      )}

      <Section title="Why JADE proposes this">
        {basedOn.length > 0 && <><div className="minihead">Based on</div><ul className="compactlist">{basedOn.map((b) => <li key={b}>{b}</li>)}</ul></>}
        <div className="minihead">Uncertainty</div>
        {uncertainty.length ? <ul className="compactlist warnlist">{uncertainty.map((u) => <li key={u}>{u}</li>)}</ul> : <p className="muted">Nothing flagged.</p>}
        {ctx.run && ctx.run.history.length > 0 && (
          <Details summary="View supporting evidence" id="evidence">
            <DesignEvidencePanel changeId={change.id} designCount={ctx.run.history.length} />
          </Details>
        )}
      </Section>

      <DecisionSection ctx={ctx} />

      <div id="ask">
        <AskJadePanel
          title="Ask JADE about this solution"
          turns={ctx.run?.conversation ?? []}
          onAsk={async (question) => { ctx.setRun(await api.askAboutSolution(change.id, { question })); }}
          renderRecommendReanalysisActions={() => (
            <button className="btn primary" onClick={async () => {
              await api.retriggerArchitectureReview(change.id);
              ctx.setRun((await api.getArchitectureReview(change.id)) ?? null); ctx.reload();
            }}>Run solutioning again</button>
          )}
        />
      </div>

      {info.has("product_manager", "admin") && (
        <Details summary="Run solutioning again">
          <p className="muted">JADE re-analyses the story and proposes a solution again. Earlier proposals are kept in the history.</p>
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try { await api.retriggerArchitectureReview(change.id); ctx.reload(); } catch (e) { setError(e); } finally { setBusy(false); }
          }}>Run solutioning again</button>
          {error !== null && <ErrorState error={error} title="Not started" />}
        </Details>
      )}

      {ctx.run && ctx.run.history.length > 1 && (
        <Details summary={`Earlier proposals (${ctx.run.history.length - 1})`}>
          <ol className="versions">{[...ctx.run.history].reverse().slice(1).map((v, i) => (
            <li key={i}><strong>{ROUTE_LABEL[v.architectDecision.recommendedRoute]?.title ?? v.architectDecision.recommendedRoute}</strong> · {formatDateTime(v.capturedAt)}
              <div>{cleanAgentText(v.architectDecision.existingFunctionalityFound).text}</div>{v.note && <div className="muted">{v.note}</div>}</li>
          ))}</ol>
        </Details>
      )}
    </div>
  );
}

/** Who approved the solution and its exact change, and when. */
function DecisionSection({ ctx }: { ctx: StoryCtx }) {
  const decided = ctx.change.changeApproval;
  const designApproval = ctx.tech?.assignment?.design_approval;
  if (!decided && !designApproval) return null;
  return (
    <Section title="Decision">
      {designApproval && <p>Solution approved for implementation by <strong>{designApproval.approved_by}</strong> on {formatDateTime(designApproval.approved_at)}.</p>}
      {decided && <p>Exact change <strong>{decided.status}</strong> by {decided.approvedBy}{decided.approvedAt ? ` on ${formatDateTime(decided.approvedAt)}` : ""}.
        {decided.note && <span className="muted"> “{decided.note}”</span>}</p>}
    </Section>
  );
}
