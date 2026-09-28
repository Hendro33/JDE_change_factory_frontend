import type { Mapping } from "../services/processApi";
import { ROUTE_LABEL } from "../pages/stories/storyContext";
import { RatingBadge } from "./StoryRatings";
import "./visualReview.css";
import type { ReactNode } from "react";
import type { AcceptanceCriterion, ArchitectDecision, BusinessImpact, Change, ImplementationSpecification } from "../types/domain";
import { Link } from "../router";

/** Read-only presentation: no inferred scores, permissions, routes or lifecycle states. */
export function ReviewFlow({ steps }: { steps: string[] }) {
  return <ol className="vr-flow" aria-label="Review guide">{steps.map((step, i) => <li key={step}><span className="vr-stepno">{String(i + 1).padStart(2, "0")}</span><span>{step}</span></li>)}</ol>;
}

export function ReviewDetail({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="vr-detail" open={open || undefined}><summary>{title}</summary><div className="vr-detail-body">{children}</div></details>;
}

function shortText(text: string, length = 135) {
  return text.length <= length ? text : `${text.slice(0, length).replace(/\s+\S*$/, "")}…`;
}

export function Signal({ label, text, note, tone = "neutral" }: {label: string; text?: string; note?: string; tone?: "neutral" | "attention"}) {
  return <div className={`vr-signal ${tone}`}><span className="vr-label">{label}</span>
    <div className={text ? "vr-signal-value" : "vr-missing"}>{text ? shortText(text) : "Not stated"}</div>
    {text && text.length > 135 && <ReviewDetail title={`Read full ${label.toLowerCase()}`}>{text}</ReviewDetail>}
    {note && <span className="vr-note">{note}</span>}
  </div>;
}

export function BusinessContextMap({ source, domain, title }: { source: string; domain?: string; title: string }) {
  return <div className="vr-context" aria-label="Business context">
    <div><span className="vr-label">Source</span><strong>{source || "Not stated"}</strong></div>
    <span className="vr-connector" aria-hidden="true">→</span>
    <div><span className="vr-label">Business domain</span><strong>{domain || "Not assigned"}</strong></div>
    <span className="vr-connector" aria-hidden="true">→</span>
    <div><span className="vr-label">Business requirement</span><strong>{title}</strong></div>
  </div>;
}

export const impactFields: {key: keyof BusinessImpact; label: string}[] = [
  {key: "operationalReach", label: "Operations"}, {key: "financialImpact", label: "Financial"},
  {key: "riskCompliance", label: "Risk & compliance"}, {key: "strategicAlignment", label: "Strategic benefit"},
  {key: "urgency", label: "Urgency"},
];
export function BusinessImpactIndicators({ impact }: { impact: BusinessImpact }) {
  return <><div className="vr-impact">{impactFields.map((f) => <Signal key={f.key} label={f.label} text={impact[f.key]} />)}</div>
    <p className="vr-note">As stated in the request. Missing information is not low impact; no scores have been inferred.</p></>;
}

export function AcceptanceChecklist({ items }: { items: AcceptanceCriterion[] }) {
  return <div className="vr-acceptance"><div className="vr-section-meta"><span>{items.length} criteria to confirm</span><span>Requirements · not test results</span></div>
    {items.length ? <ol>{items.map((item) => <li key={item.id}><span className="vr-check-outline" aria-hidden="true" /><div>{item.text}<span className="vr-note">{item.id}</span></div></li>)}</ol> : <p className="vr-missing">No acceptance criteria recorded.</p>}</div>;
}

export function QuestionCards({ questions, assumptions }: { questions: string[]; assumptions: string[] }) {
  if (!questions.length && !assumptions.length) return null;
  return <section className="vr-questions" aria-label="Questions and assumptions">
    <div className="vr-section-meta"><h2>Confirm before deciding</h2><span>{questions.length} questions · {assumptions.length} assumptions</span></div>
    {questions.map((q,i) => <div className="vr-question" key={`q${i}`}><span className="vr-question-mark" aria-hidden="true">?</span><div><span className="vr-label">Open question</span>{q}</div></div>)}
    {assumptions.length > 0 && <ReviewDetail title={`Review ${assumptions.length} assumptions`}><ul>{assumptions.map((a,i) => <li key={i}>{a}</li>)}</ul></ReviewDetail>}
  </section>;
}

export function BacklogComparison({ rows, selectedId, onSelect, domainName }: {rows: Change[]; selectedId: string | null; onSelect: (id: string) => void; domainName: (c: Change) => string}) {
  return <div className="vr-comparison" aria-label="Compare business value and delivery considerations">
    <div className="vr-comparison-head"><span>Business requirement</span><span>Value / impact stated</span><span>Delivery considerations</span></div>
    {rows.length === 0 && <p className="vr-missing">No changes match the current filters.</p>}
    {rows.map((c) => <div key={c.id} className={`vr-comparison-row${c.id === selectedId ? " selected" : ""}`}>
      <div><button type="button" aria-pressed={c.id === selectedId} className="vr-select-story" onClick={() => onSelect(c.id)}>{c.title}<span aria-hidden="true">↗</span></button>
        <span className="vr-note">{domainName(c)} · {c.priority} priority</span><span className="vr-note mono">{c.id}</span></div>
      <div><RatingBadge label="Business benefit" rating={c.ratings?.businessBenefit} /><RatingBadge label="Business impact" rating={c.ratings?.businessImpact} /></div>
      <div><span className="vr-cost"><span className="vr-cost-mark" aria-hidden="true">◈</span>{c.complexitySignal} complexity</span><span className="vr-note">Rough signal · no effort estimate</span>
        <RatingBadge label="Technical impact" rating={c.ratings?.technicalImpact} />
        <span className="vr-label">Dependencies</span><p>{c.architectDecision ? c.architectDecision.dependenciesAndConflicts.join("; ") || "None identified in the assessment" : "Awaiting architecture assessment"}</p></div>
    </div>)}
  </div>;
}

export function DeliveryRouteIndicator({ route, confidence }: {route: string; confidence: number}) {
  return <div className="vr-route"><span className="vr-route-icon" aria-hidden="true">↗</span><div><span className="vr-label">Recommended delivery route</span><strong>{route}</strong><span className="vr-note">Architect confidence {Math.round(confidence * 100)}% · recommendation, not execution approval</span></div></div>;
}

export function SolutionArchitectureMap({ change, decision, spec, domain, mapping }: {change: Change; decision: ArchitectDecision; spec?: ImplementationSpecification; domain?: string; mapping?: Mapping | null}) {
  return <section className="panel vr-architecture"><div className="vr-section-meta"><h2>Solution at a glance</h2><span className="vr-label">Proposed architecture</span></div>
    <div className="vr-architecture-map">
      <div className="vr-map-node"><span className="vr-map-index">01</span><span className="vr-label">Business context</span><strong>{domain || "Business domain not assigned"}</strong><p>{shortText(change.userStory?.statement || change.title, 200)}</p><span className="vr-label">Business process</span>{mapping?.status === "confirmed" ? mapping.refs.map((ref) => <p key={ref.node_key}>{ref.path.map((p) => p.name).join(" › ")}</p>) : <span className="vr-note">{mapping?.status === "no_mapping" ? "No process mapping applies" : "No confirmed process mapping"}</span>}</div>
      <span className="vr-connector" aria-hidden="true">→</span>
      <div className="vr-map-node emphasis"><span className="vr-map-index">02</span><span className="vr-label">Proposed approach</span><strong>{ROUTE_LABEL[decision.recommendedRoute]?.title ?? decision.recommendedRoute}</strong><span className="vr-note">{change.exactChange ? `${change.exactChange.application} · ${change.exactChange.option}` : "See implementation specification"}</span>
        <p>{change.exactChange ? `${change.exactChange.currentValue || "(empty)"} → ${change.exactChange.proposedValue}` : shortText(spec?.sequence[0] || "Implementation details not yet recorded", 180)}</p>
        <span className="vr-note">{change.exactChange?.environment || "Environment not stated here"}</span></div>
      <span className="vr-connector" aria-hidden="true">→</span>
      <div className="vr-map-node"><span className="vr-map-index">03</span><span className="vr-label">Affected ERP scope</span><strong>{decision.objectsAffected.length} recorded object{decision.objectsAffected.length === 1 ? "" : "s"}</strong>
        <div className="vr-object-list">{decision.objectsAffected.slice(0,4).map((o) => <span className="mono" key={o}>{o}</span>)}</div>
        {decision.objectsAffected.length > 4 && <span className="vr-note">+ {decision.objectsAffected.length - 4} in the assessment below</span>}
        <span className="vr-note">{decision.dependenciesAndConflicts.length} dependencies / concerns recorded</span></div>
    </div>
    <DeliveryRouteIndicator route={decision.recommendedRoute} confidence={decision.confidence} />
  </section>;
}

export function IntegrityPanel({ decision }: {decision: ArchitectDecision}) {
  return <section className="panel vr-integrity"><div className="vr-section-meta"><h2>System integrity</h2><span className="vr-note">Architect assessment · not a safety certification</span></div>
    <div className="vr-integrity-grid"><Signal label="Existing functionality" text={decision.existingFunctionalityFound} />
      <Signal label="Rollback strategy" text={decision.rollbackStrategy} note="Recorded plan; availability is not independently verified here." /></div>
    <div className={`vr-dependencies${decision.dependenciesAndConflicts.length ? " attention" : ""}`}><strong>{decision.dependenciesAndConflicts.length ? "! Dependencies & concerns" : "No dependencies or conflicts identified in this assessment"}</strong>
      {decision.dependenciesAndConflicts.length > 0 && <ul>{decision.dependenciesAndConflicts.map((d,i) => <li key={i}>{d}</li>)}</ul>}</div>
    <ReviewDetail title="Scope of this assessment"><p>Interface, data and regression effects are not separately rated. Review the recorded concerns and validation evidence before deciding.</p></ReviewDetail>
  </section>;
}

export function ConnectionHealthCard({ name, status, connected, detail, to, model, checkedAt }: {name: string; status: string; connected: boolean; detail: string; to?: string; model?: string; checkedAt?: string}) {
  return <article className={`vr-connection ${connected ? "connected" : "unconfirmed"}`}>
    <div className="vr-connection-top"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4" /></svg><span className="vr-status"><span aria-hidden="true">{connected ? "●" : "○"}</span> {status}</span></div>
    <h2>{name}</h2><ReviewDetail title="Connection details"><p>{detail}</p></ReviewDetail>
    {model && <div className="vr-connection-fact"><span>Model</span><strong>{model}</strong></div>}
    <div className="vr-connection-fact"><span>Last check</span><strong>{checkedAt ? new Date(checkedAt).toLocaleString("en-GB") : "Not reported"}</strong></div>
    {to ? <Link className="btn small" to={to}>Configure <span aria-hidden="true">→</span></Link> : <span className="vr-note">No configuration screen available</span>}
  </article>;
}
