import { ExecutionPanel } from "../../components/ExecutionPanel";
import { DesignEvidencePanel } from "../../components/DesignEvidencePanel";
import { CAPABILITY_STATUS_LABEL, CapabilityStatusBadge } from "../../components/ui";
import { Details, EmptyState, Section, formatDateTime, useSessionInfo } from "../../components/design";
import { TechnicalWorkPanel } from "../TechnicalPanel";
import type { StoryCtx } from "./storyContext";

/**
 * Technical: for people who build and operate. JD Edwards objects and
 * operations, packages, diffs, execution states, reconciliation, the
 * design evidence baseline and raw agent/run errors -- all of it, never
 * hidden, but never in a business reader's way.
 */
export function TechnicalTab({ ctx }: { ctx: StoryCtx }) {
  const { change } = ctx;
  const info = useSessionInfo();
  const decision = ctx.run?.architectDecision ?? change.architectDecision;
  const spec = ctx.run?.implementationSpec ?? change.implementationSpec;
  const route = change.lifecycle?.route ?? decision?.recommendedRoute;
  const ec = change.exactChange;

  return (
    <div className="technical">
      {(change.processingError || change.architectureReviewError || ctx.run?.error) && (
        <Section title="Run errors">
          {change.processingError && <p><strong>Story analysis:</strong> <code className="mono">{change.processingError}</code></p>}
          {(change.architectureReviewError || ctx.run?.error) && <p><strong>Solutioning:</strong> <code className="mono">{change.architectureReviewError ?? ctx.run?.error}</code></p>}
        </Section>
      )}

      {decision ? (
        <Section title="Architect decision">
          <dl className="facts">
            <dt>Route</dt><dd>{decision.recommendedRoute}</dd>
            <dt>Model-stated confidence</dt><dd>{Math.round(decision.confidence * 100)}% <span className="muted">(the Architect's own figure; not shown to business readers)</span></dd>
            <dt>Objects affected</dt><dd className="mono">{decision.objectsAffected.join(", ") || "none"}</dd>
            <dt>Decided</dt><dd>{formatDateTime(decision.decidedAt)}</dd>
            {spec && <><dt>MCP operations</dt><dd className="mono">{spec.requiredMcpOperations.join(", ") || "none"}</dd>
              <dt>Sequence</dt><dd><ol style={{ margin: 0, paddingLeft: 18 }}>{spec.sequence.map((s, i) => <li key={i}>{s}</li>)}</ol></dd></>}
          </dl>
        </Section>
      ) : <EmptyState title="No design yet">The Architect has not produced a design for this story.</EmptyState>}

      {ctx.run && ctx.run.history.length > 0 && (
        <Section title="Design evidence baseline">
          <DesignEvidencePanel changeId={change.id} designCount={ctx.run.history.length} />
        </Section>
      )}

      {ec && (
        <Section title="Exact change and delivery">
          <dl className="facts">
            <dt>Operation</dt><dd className="mono">{ec.tool}</dd>
            <dt>Target</dt><dd className="mono">{ec.application} / {ec.version} / option {ec.option}</dd>
            <dt>Value</dt><dd className="mono">{ec.currentValue || "?"} → <strong>{ec.proposedValue}</strong></dd>
            <dt>Environment</dt><dd className="mono">{ec.environment}</dd>
            <dt>Test orchestration</dt><dd className="mono">{ec.testOrchestration || "—"}</dd>
            {ec.capabilityId && <><dt>Capability</dt><dd><span className="mono">{ec.capabilityId}</span> {ec.capabilityStatus && <CapabilityStatusBadge status={ec.capabilityStatus} />}</dd></>}
            {change.changeApproval?.changeHash && <><dt>Approval bound to</dt><dd className="mono">{change.changeApproval.changeHash}</dd></>}
          </dl>
          {ec.capabilityId && ec.capabilityExecutable === false && (
            <div className="callout" style={{ marginTop: 12, borderColor: "var(--warn)" }}>
              <strong>This change is not delivered</strong>
              The capability is {CAPABILITY_STATUS_LABEL[ec.capabilityStatus!]}. A Restricted or Suspended capability is not
              delivered, even when approved, until the catalogue entry itself is changed.
            </div>
          )}
          <ExecutionPanel changeId={change.id} exactChange={ec} approvalStatus={change.changeApproval?.status} onChanged={ctx.reload} />
        </Section>
      )}

      {(route === "Technical Agent" || route === "Mixed") && (
        <Section title="Technical implementation">
          <TechnicalWorkPanel storyId={change.id} roles={info.roles} onChanged={ctx.reload} />
        </Section>
      )}

      <Details summary="Raw lifecycle (for support)" tone="technical">
        <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify({ state: change.state, domainReviewStage: change.domainReviewStage,
          architectureReviewStage: change.architectureReviewStage, processingStage: change.processingStage, lifecycle: change.lifecycle }, null, 2)}</pre>
      </Details>
    </div>
  );
}
