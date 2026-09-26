import { Details, Section, formatDateTime } from "../../components/design";
import { activityOf } from "./OverviewTab";
import type { StoryCtx } from "./storyContext";

/**
 * Evidence & History: every decision with who, when and why; the source;
 * and the append-only evidence log for anyone who needs to audit it.
 */
export function EvidenceTab({ ctx }: { ctx: StoryCtx }) {
  const { change, domainReview } = ctx;
  const decisions: { when?: string; what: string; who?: string | null; note?: string | null }[] = [];
  if (domainReview?.domainOwnerApproval) decisions.push({ when: domainReview.domainOwnerApproval.approvedAt, what: `Story ${domainReview.domainOwnerApproval.status} by the Domain Owner`, who: domainReview.domainOwnerApproval.approvedBy, note: domainReview.domainOwnerApproval.note });
  if (domainReview?.applicationManagerApproval) decisions.push({ when: domainReview.applicationManagerApproval.approvedAt, what: `Delivery ${domainReview.applicationManagerApproval.status === "approved" ? "authorised" : "not authorised"} by the Product Owner`, who: domainReview.applicationManagerApproval.approvedBy, note: domainReview.applicationManagerApproval.note });
  if (!domainReview?.applicationManagerApproval && change.storyApproval) decisions.push({ when: change.storyApproval.approvedAt, what: `Story ${change.storyApproval.status}`, who: change.storyApproval.approvedBy, note: change.storyApproval.note });
  if (change.changeApproval) decisions.push({ when: change.changeApproval.approvedAt, what: `Exact change ${change.changeApproval.status}`, who: change.changeApproval.approvedBy, note: change.changeApproval.note });
  for (const h of ctx.tech?.human_actions ?? []) {
    decisions.push({ when: typeof h.at === "number" ? new Date(h.at * 1000).toISOString() : h.at, what: h.action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) + (h.simulated ? " (simulated)" : ""), who: h.by, note: h.detail });
  }
  if (change.humanValidation) decisions.push({ when: change.humanValidation.validatedAt, what: "Validated by a person", who: change.humanValidation.validatedBy, note: change.humanValidation.note });
  decisions.sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""));

  return (
    <div className="evidence">
      <Section title="Decisions" description="Every human decision on this story: who made it, when, and why.">
        {decisions.length === 0 ? <p className="muted">No decisions recorded yet.</p> : (
          <ul className="decisionlist">{decisions.map((d, i) => (
            <li key={i}>
              <div className="decision-what">{d.what}</div>
              <div className="decision-meta">{d.who ?? "—"}{d.when ? ` · ${formatDateTime(d.when)}` : ""}</div>
              {d.note && <div className="decision-note">“{d.note}”</div>}
            </li>
          ))}</ul>
        )}
      </Section>

      <Section title="Timeline">
        <ul className="activity">{activityOf(ctx).map((a, i) => (
          <li key={i}><span className="activity-when">{formatDateTime(a.when)}</span> {a.what}{a.who ? <span className="muted"> — {a.who}</span> : null}</li>
        ))}</ul>
      </Section>

      {(change.testSpecification || change.testResult) && (
        <Section title="Test">
          <p>{change.testSpecification?.mode}{change.testSpecification?.orchestrationName ? ` · ${change.testSpecification.orchestrationName}` : ""}</p>
          <p>{change.testResult && change.testResult.outcome !== "not run"
            ? `Test ${change.testResult.outcome === "pass" ? "passed" : "failed"}${change.testResult.ranAt ? ` on ${formatDateTime(change.testResult.ranAt)}` : ""}. ${change.testResult.detail ?? ""}`
            : "Not run yet."}</p>
        </Section>
      )}

      {change.closure && (
        <Section title="Closure">
          <dl className="facts">
            <dt>What changed</dt><dd>{change.closure.whatChanged}</dd>
            <dt>Told the requester</dt><dd>{change.closure.businessFacingResult}</dd>
            <dt>Limitations</dt><dd>{change.closure.limitations || <span className="muted">None stated</span>}</dd>
            <dt>Source system</dt><dd>{change.closure.sourceUpdateStatus}</dd>
            <dt>Requester says</dt><dd><strong>{change.closure.requesterConfirmation}</strong></dd>
          </dl>
        </Section>
      )}

      <Details summary={`Evidence log (${change.evidence.length} entries, append-only)`} tone="technical">
        {change.evidence.length === 0 ? <p className="muted">No entries.</p> : (
          <table className="data">
            <thead><tr><th>#</th><th>Stage</th><th>What happened</th><th>By</th><th>When</th><th>Entry hash</th></tr></thead>
            <tbody>{change.evidence.map((e) => (
              <tr key={e.entryId}><td className="mono">{e.entryId}</td><td>{e.stage}</td><td>{e.detail}</td><td>{e.actor}</td>
                <td className="mono">{formatDateTime(e.capturedAt)}</td><td className="mono muted">{e.entryHash?.slice(0, 12)}</td></tr>
            ))}</tbody>
          </table>
        )}
        <p className="muted">Each entry is hash-chained to the one before it, so any later edit would be detectable.</p>
      </Details>
    </div>
  );
}
