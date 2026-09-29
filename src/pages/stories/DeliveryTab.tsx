import { ReviewDetail, DeliveryRouteIndicator } from "../../components/visualReview";
import { DocumentCitations } from "../../components/RequestDocuments";
import { EvidenceChain, ValidationSummary } from "../../components/workspaceVisuals";
import { EmptyState, Section, formatDateTime, useSessionInfo } from "../../components/design";
import { ExecutionPanel } from "../../components/ExecutionPanel";
import { PackageActions, RecordedSteps } from "../TechnicalPanel";
import { Link, storyPath } from "../../router";
import { AsBuiltPanel } from "../AsBuiltPanel";
import { isoOf } from "./OverviewTab";
import { cleanAgentText, type StoryCtx } from "./storyContext";

const EXEC_WORDS: Record<string, string> = {
  ready: "Not applied yet", in_progress: "Being applied", applied: "Applied in DEV (recorded)", completed: "Test recorded",
  unknown: "Outcome uncertain — needs reconciling", diverged: "DEV differs from what was approved",
};

/**
 * Delivery: the approved solution being built, validated and released --
 * in the same workspace, business summary first. Objects, packages,
 * diffs and traces are one click away in the Technical view.
 */
export function DeliveryTab({ ctx }: { ctx: StoryCtx }) {
  const { change } = ctx;
  const info = useSessionInfo();
  const lc = change.lifecycle;
  const steps = lc?.deliverySteps ?? [];
  if (!lc || lc.phaseIndex < 4 || steps.length === 0) {
    return (
      <EmptyState title="Delivery has not started">
        Delivery begins once the solution is approved. {lc && lc.phase !== "done" ? `Right now: ${lc.nextAction.summary}` : ""}
      </EmptyState>
    );
  }
  const pkg = ctx.tech?.packages.find((p) => !p.superseded_by);
  const ex = change.exactChange?.execution;
  const explanation = cleanAgentText(pkg?.content.explanation);
  const ver = pkg?.approval?.verification;
  const cnc = pkg?.approval?.cnc_activation;
  const functionalTest = ex?.verification && Object.keys(ex.verification).length ? ex.verification as { passed?: boolean; source?: string } : null;
  const functionalApproved = !pkg && !!change.exactChange && change.changeApproval?.status === "approved";

  return (
    <div className="delivery vr-pilot">
      {change.architectDecision && <DeliveryRouteIndicator route={change.architectDecision.recommendedRoute} confidence={change.architectDecision.confidence} />}
      <Section title="Progress">
        <ol className="deliverysteps">
          {steps.map((s) => (
            <li key={s.id} className={s.state}>
              <span className="ds-dot" aria-hidden="true">{s.state === "done" ? "✓" : s.state === "failed" ? "!" : s.state === "current" ? "●" : ""}</span>
              <span className="ds-label">{s.label}</span>
              <span className="ds-state">{s.state === "done" ? "Completed" : s.state === "current" ? "In progress" : s.state === "failed" ? "Needs attention" : "Not started"}</span>
              {s.detail && <ReviewDetail title="Stage details"><span className="ds-detail">{s.detail}</span></ReviewDetail>}
            </li>
          ))}
        </ol>
        <p className="muted">JADE's agents apply an approved configuration change in DEV and read every item back live; people apply only what the agents cannot, and the technical steps (OMW, build, CNC), and record them.</p>
      </Section>

      <EvidenceChain items={[
        {label:"Requirement", detail:change.userStory ? `${change.userStory.acceptanceCriteria.length} acceptance criteria` : "Not recorded",to:storyPath(change.id,"story")},
        {label:"Architecture",detail:change.architectDecision?.recommendedRoute ?? "Not recorded",to:storyPath(change.id,"solution")},
        {label:"Delivered result",detail:pkg ? `Package revision ${pkg.revision}` : ex ? (EXEC_WORDS[ex.writeState] ?? ex.writeState) : "Not recorded"},
        {label:"Test evidence",detail:ver ? `${ver.results.length} recorded results` : functionalTest ? `Test ${functionalTest.passed ? "passed" : "failed"} (${functionalTest.source ?? "recorded"})` : change.testResult?.outcome ?? "Not recorded",to:storyPath(change.id,"evidence")},
      ]} />
      <Section id="implementation" title="Implementation summary"
               actions={info.technical ? <Link to={storyPath(change.id, "technical")}>View technical implementation</Link> : undefined}>
        {pkg ? (
          <>
            <ReviewDetail title="Implementation explanation"><p>{explanation.text || "JADE prepared the implementation package."}</p></ReviewDetail>
            {pkg.content.requirement_trace.length > 0 && (
              <ReviewDetail title="Requirement trace"><ul className="checklist">{pkg.content.requirement_trace.map((t, i) => <li key={i}><strong>{t.requirement}</strong> — {t.how}</li>)}</ul></ReviewDetail>
            )}
            {(pkg.content.document_citations?.length ?? 0) > 0 && (
              <ReviewDetail title="Based on documents"><DocumentCitations citations={pkg.content.document_citations} /></ReviewDetail>
            )}
            <p className="muted">Package revision {pkg.revision}{pkg.approval?.status === "approved" ? `, approved by ${pkg.approval.approved_by}` : pkg.approval?.status === "rejected" ? ", rejected" : ", awaiting approval"}
              {cnc && <> · activated in DEV by {cnc.by} ({cnc.package_name}) on {formatDateTime(isoOf(cnc.at))}</>}.</p>
          </>
        ) : change.exactChange ? (
          <p>{change.exactChange.application} version {change.exactChange.version}, processing option {change.exactChange.option}: <strong>{EXEC_WORDS[ex?.writeState ?? "ready"] ?? ex?.writeState}</strong>
            {ex?.testState && ex.testState !== "ready" && <> · test: <strong>{EXEC_WORDS[ex.testState] ?? ex.testState}</strong></>}.</p>
        ) : <p className="muted">No implementation recorded yet.</p>}
      </Section>

      {functionalApproved && info.appManagement && (
        <Section id="record" title="Delivery in DEV" description="Apply the approved value in JD Edwards DEV, record it here, then test it and record the result.">
          <ExecutionPanel compact showItems changeId={change.id} exactChange={change.exactChange} approvalStatus={change.changeApproval?.status} onChanged={ctx.reload} />
        </Section>
      )}

      {pkg && (
        <Section id="record" title="Recorded delivery steps"
                 description="Each step is performed by a person in DEV and recorded with its evidence; JADE re-checks the approval before recording it.">
          <RecordedSteps p={pkg} />
          {info.appManagement && <div style={{ marginTop: 12 }}><PackageActions storyId={change.id} p={pkg} roles={info.roles} onChanged={ctx.reload} /></div>}
        </Section>
      )}

      {pkg && pkg.content.test_plan.length > 0 && (
        <Section title="Validation">
          <ValidationSummary passed={pkg.content.test_plan.filter((t) => ver?.results.find((r) => r.name === t.name)?.passed === true).length}
            failed={pkg.content.test_plan.filter((t) => ver?.results.find((r) => r.name === t.name)?.passed === false).length}
            pending={pkg.content.test_plan.filter((t) => !ver?.results.some((r) => r.name === t.name)).length} />
          <table className="data">
            <thead><tr><th>Test</th><th>Kind</th><th>Result</th></tr></thead>
            <tbody>{pkg.content.test_plan.map((t) => {
              const r = ver?.results.find((x) => x.name === t.name);
              return <tr key={t.name}><td>{t.name}</td><td>{t.kind}</td>
                <td>{r ? <span className={`tag ${r.passed ? "ok" : "stop"}`}>{r.passed ? "Passed" : "Failed"}</span> : <span className="muted">Not recorded</span>}{r?.note && <div className="muted">{r.note}</div>}</td></tr>;
            })}</tbody>
          </table>
          {ver && <p className="muted">{ver.runtime_is_approved_artifact ? `Tested against exactly the approved, active change (stated by ${ver.by ?? "the recorder"}).` : "The active DEV runtime is not the approved change — the result does not count."}{ver.evidence_reference ? ` Evidence: ${ver.evidence_reference}.` : ""}</p>}
        </Section>
      )}

      <Section id="release" title="Release and as-built record"
               description="The as-built record is what was actually delivered, generated from JADE's own records. Finalising it completes the story; promotion beyond DEV stays with CNC.">
        <AsBuiltPanel storyId={change.id} onChanged={ctx.reload} />
      </Section>
    </div>
  );
}
