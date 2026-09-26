import { IS_MOCK_MODE } from "../../services/api";
import { EmptyState, Section, SimulationBadge, formatDateTime, useSessionInfo } from "../../components/design";
import { Link, storyPath } from "../../router";
import { AsBuiltPanel } from "../AsBuiltPanel";
import { isoOf } from "./OverviewTab";
import { cleanAgentText, type StoryCtx } from "./storyContext";

const EXEC_WORDS: Record<string, string> = {
  ready: "Not applied yet", in_progress: "Being applied", applied: "Applied in DEV", completed: "Completed",
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

  return (
    <div className="delivery">
      <Section title="Progress">
        <ol className="deliverysteps">
          {steps.map((s) => (
            <li key={s.id} className={s.state}>
              <span className="ds-dot" aria-hidden="true">{s.state === "done" ? "✓" : s.state === "failed" ? "!" : s.state === "current" ? "●" : ""}</span>
              <span className="ds-label">{s.label}</span>
              <span className="ds-state">{s.state === "done" ? "Completed" : s.state === "current" ? "In progress" : s.state === "failed" ? "Needs attention" : "Not started"}</span>
              {s.detail && <span className="ds-detail">{s.detail}</span>}
            </li>
          ))}
        </ol>
        {lc.simulated && <p className="muted"><SimulationBadge /> Delivered in a simulated JD Edwards DEV environment; no customer system is changed.</p>}
      </Section>

      <Section id="implementation" title="Implementation summary"
               actions={info.technical ? <Link to={storyPath(change.id, "technical")}>View technical implementation</Link> : undefined}>
        {pkg ? (
          <>
            <p>{explanation.text || "JADE prepared the implementation package."}</p>
            {pkg.content.requirement_trace.length > 0 && (
              <ul className="checklist">{pkg.content.requirement_trace.map((t, i) => <li key={i}><strong>{t.requirement}</strong> — {t.how}</li>)}</ul>
            )}
            <p className="muted">Package revision {pkg.revision}{pkg.approval?.status === "approved" ? `, approved by ${pkg.approval.approved_by}` : pkg.approval?.status === "rejected" ? ", rejected" : ", awaiting approval"}
              {cnc && <> · activated in DEV by {cnc.by} ({cnc.package_name}) on {formatDateTime(isoOf(cnc.at))}</>}.</p>
          </>
        ) : change.exactChange ? (
          <p>{change.exactChange.application} version {change.exactChange.version}, processing option {change.exactChange.option}: <strong>{EXEC_WORDS[ex?.writeState ?? "ready"] ?? ex?.writeState}</strong>
            {ex?.testState && ex.testState !== "ready" && <> · test: <strong>{EXEC_WORDS[ex.testState] ?? ex.testState}</strong></>}.</p>
        ) : <p className="muted">No implementation recorded yet.</p>}
      </Section>

      {pkg && pkg.content.test_plan.length > 0 && (
        <Section title="Validation">
          <table className="data">
            <thead><tr><th>Test</th><th>Kind</th><th>Result</th></tr></thead>
            <tbody>{pkg.content.test_plan.map((t) => {
              const r = ver?.results.find((x) => x.name === t.name);
              return <tr key={t.name}><td>{t.name}</td><td>{t.kind}</td>
                <td>{r ? <span className={`tag ${r.passed ? "ok" : "stop"}`}>{r.passed ? "Passed" : "Failed"}</span> : <span className="muted">Not run</span>}</td></tr>;
            })}</tbody>
          </table>
          {ver && <p className="muted">{ver.runtime_is_approved_artifact ? "Tested against exactly the approved, active change." : "The active DEV runtime is not the approved change — the result does not count."}</p>}
        </Section>
      )}

      <Section id="release" title="Release and as-built record"
               description="The as-built record is what was actually delivered, generated from JADE's own records. Finalising it completes the story; promotion beyond DEV stays with CNC.">
        {IS_MOCK_MODE ? <p className="muted">Needs the real backend.</p> : <AsBuiltPanel storyId={change.id} onChanged={ctx.reload} />}
      </Section>
    </div>
  );
}
