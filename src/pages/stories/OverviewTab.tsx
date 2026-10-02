import { Link, storyPath } from "../../router";
import {
  EmptyState, Fact, Section, businessNeed, formatDateTime, needText, useSessionInfo,
} from "../../components/design";
import { ROUTE_LABEL, cleanAgentText, type StoryCtx } from "./storyContext";
import { ClassificationFacts } from "../../components/Classification";

/** Seconds-since-epoch (the gate's records) or ISO text, as ISO text. */
export function isoOf(t: string | number): string {
  return typeof t === "number" ? new Date(t * 1000).toISOString() : t;
}

/** Recent activity in business words, newest first (from recorded decisions and the evidence log). */
export function activityOf(ctx: StoryCtx): { when: string; what: string; who?: string }[] {
  const c = ctx.change;
  const out: { when: string; what: string; who?: string }[] = [];
  out.push({ when: c.createdAt, what: `Request received from ${c.source}${c.sourceReference ? ` (${c.sourceReference})` : ""}` });
  const dr = ctx.domainReview;
  if (dr?.domainOwnerApproval?.approvedAt) out.push({ when: dr.domainOwnerApproval.approvedAt, what: "Story approved by the Domain Owner", who: dr.domainOwnerApproval.approvedBy });
  if (dr?.applicationManagerApproval?.approvedAt) out.push({ when: dr.applicationManagerApproval.approvedAt, what: "Delivery authorised by the Application Manager", who: dr.applicationManagerApproval.approvedBy });
  if (c.storyApproval?.approvedAt && !dr?.applicationManagerApproval) out.push({ when: c.storyApproval.approvedAt, what: `Story ${c.storyApproval.status}`, who: c.storyApproval.approvedBy });
  if (c.architectDecision?.decidedAt) out.push({ when: c.architectDecision.decidedAt, what: "JADE proposed a solution" });
  // For a technical route this record is the package approval, already listed from the technical record below.
  if (c.changeApproval?.approvedAt && !ctx.tech) out.push({ when: c.changeApproval.approvedAt, what: `Solution ${c.changeApproval.status}`, who: c.changeApproval.approvedBy });
  for (const h of ctx.tech?.human_actions ?? []) {
    const what = h.action === "design_approval" ? "Solution approved"
      : h.action === "implementation_approved" ? "Implementation approved"
      : h.action === "implementation_rejected" ? "Implementation rejected"
      : h.action === "cnc_activation" ? "Package activated in DEV" : h.action.replace(/_/g, " ");
    if (h.at) out.push({ when: isoOf(h.at), what, who: h.by });
  }
  const pkg = ctx.tech?.packages.find((p) => !p.superseded_by);
  const ver = pkg?.approval?.verification;
  const verifiedAt = (pkg?.approval?.milestones ?? []).filter((m) => m.milestone.startsWith("verif")).map((m) => m.at).pop();
  if (ver) out.push({ when: verifiedAt ? isoOf(verifiedAt) : c.updatedAt,
    what: `Validation: ${ver.results.filter((r) => r.passed).length} of ${ver.results.length} tests passed` });
  return out.filter((a) => a.when).sort((a, b) => b.when.localeCompare(a.when));
}

export function OverviewTab({ ctx }: { ctx: StoryCtx }) {
  const { change } = ctx;
  const info = useSessionInfo();
  const lc = change.lifecycle;
  const us = change.userStory;
  const need = needText(change);
  const benefit = businessNeed(change);
  const decision = ctx.run?.architectDecision ?? change.architectDecision;
  const route = decision ? ROUTE_LABEL[decision.recommendedRoute] : undefined;
  const found = cleanAgentText(decision?.existingFunctionalityFound);
  const processes = ctx.process?.mapping?.status === "confirmed" ? ctx.process.mapping.refs : [];
  const am = info.appManagement;
  const risks = [
    ...(am ? lc?.openItems ?? [] : []),
    ...(us?.openQuestions ?? []).map((q) => `Open question: ${q}`),
    ...(am ? decision?.dependenciesAndConflicts ?? [] : []).map((d) => `Could affect: ${d}`),
  ];
  const activity = activityOf(ctx).slice(0, 5);
  const inDelivery = (lc?.phaseIndex ?? 0) >= 4 && (lc?.deliverySteps.length ?? 0) > 0;

  return (
    <div className="overview">
      <div className="overview-main">
        <Section title="Business need">
          <p className="lead">{need}</p>
          {!us && <p className="muted">JADE has not written the user story yet.</p>}
        </Section>

        {benefit && (
          <Section title="Expected benefit">
            <p>{benefit}</p>
          </Section>
        )}

        {!am ? (
          (lc?.phaseIndex ?? 0) >= 2 && (
            <Section title="With Application Management">
              <p>The approved story is with the Application Manager, who takes it through solution, delivery and release. Current phase: <strong>{lc?.phaseLabel}</strong>.</p>
            </Section>
          )
        ) : <>
        <Section title="Proposed solution" actions={decision ? <Link to={storyPath(change.id, "solution")}>Full proposal</Link> : undefined}>
          {!decision ? (
            <EmptyState title={(lc?.phaseIndex ?? 0) < 2 ? "Not yet — the story comes first" : "JADE has not proposed a solution yet"}>
              {(lc?.phaseIndex ?? 0) < 2 ? "Once the story is approved and authorised, JADE researches the JD Edwards environment and proposes a solution." : lc?.nextAction.summary}
            </EmptyState>
          ) : (
            <>
              <p className="lead-strong">{route?.title ?? decision.recommendedRoute}</p>
              {found.text && <p className="clamp-4">{found.text}</p>}
              {(ctx.run?.implementationSpec ?? change.implementationSpec)?.sequence.length ? (
                <ol className="compactlist">{(ctx.run?.implementationSpec ?? change.implementationSpec)!.sequence.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}</ol>
              ) : null}
            </>
          )}
        </Section>

        {inDelivery && (
          <Section title="Delivery" actions={<Link to={storyPath(change.id, "delivery")}>Delivery details</Link>}>
            <ol className="deliverysteps compact">
              {lc!.deliverySteps.map((s) => (
                <li key={s.id} className={s.state}>
                  <span className="ds-dot" aria-hidden="true">{s.state === "done" ? "✓" : s.state === "failed" ? "!" : s.state === "current" ? "●" : ""}</span>
                  <span className="ds-label">{s.label}</span>
                  {s.detail && <span className="ds-detail">{s.detail}</span>}
                </li>
              ))}
            </ol>
          </Section>
        )}
        </>}
      </div>

      <aside className="overview-side">
        <Section title="Business context" quiet>
          <Fact label="Business domain">
            {change.businessDomainId && info.domainName(change.businessDomainId)
              ? <Link to={`/business/${encodeURIComponent(change.businessDomainId)}`}>{info.domainName(change.businessDomainId)}</Link>
              : <span className="muted">Not placed yet</span>}
          </Fact>
          <Fact label="Business process">
            {processes.length ? processes.map((r) => (
              <div key={r.node_key}><Link to={`/business?node=${encodeURIComponent(r.node_key)}`}>{r.path.map((p) => p.name).slice(-2).join(" › ")}</Link></div>
            )) : <span className="muted">Not confirmed yet</span>}
          </Fact>
          <Fact label="Source">{change.source}{change.sourceReference ? ` · ${change.sourceReference}` : ""}</Fact>
          <ClassificationFacts change={change} onSaved={ctx.reload} />
        </Section>

        <Section title="Risks and open questions" quiet>
          {risks.length === 0 ? <p className="muted">None recorded.</p> : <ul className="compactlist">{risks.map((r) => <li key={r}>{r}</li>)}</ul>}
        </Section>

        <Section title="Recent activity" quiet actions={<Link to={storyPath(change.id, "evidence")}>Full history</Link>}>
          <ul className="activity">
            {activity.map((a, i) => (
              <li key={i}><span className="activity-when">{formatDateTime(a.when)}</span> {a.what}{a.who ? <span className="muted"> — {a.who}</span> : null}</li>
            ))}
          </ul>
        </Section>
      </aside>
    </div>
  );
}
