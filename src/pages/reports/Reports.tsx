import { ReviewDetail } from "../../components/visualReview";
import { INSIGHT_PERIODS, inInsightPeriod, type InsightPeriod } from "../../services/insightPeriod";
import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { DeliveryQueueEntry, FactoryMetrics } from "../../types/domain";
import { PHASES } from "../../types/domain";
import {
  EmptyState, ErrorState, HealthIndicator, Loading, PageHeader, PhaseLabel, Section, storyTitle, useAsync, useSessionInfo,
} from "../../components/design";
import { Link, navigate, setQueryParam, useLocation, storyPath } from "../../router";
import { DEFAULT_DASHBOARD_THRESHOLDS, toneForValue } from "../../services/dashboardThresholds";
import { isRequest } from "../stories/Stories";

/** Routes that deliver a change; "Resolve without Change" and "Clarification Required" are outcomes, not routes. */
const DELIVERY_ROUTES = ["Functional Agent", "Technical Agent", "Mixed", "Human Implementation"];

/** One series, one hue: a labelled horizontal bar per row, each a link to the stories behind it. */
function Bars({ rows, onRow, label }: { rows: { label: string; count: number; hint?: string }[]; onRow?: (i: number) => void; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bars" role="table" aria-label={label}>
      {rows.map((r, i) => {
        const Tag = onRow ? "button" : "div";
        return (
          <Tag key={r.label} className="bars-row" role="row" onClick={onRow ? () => onRow(i) : undefined} title={`${r.label}: ${r.count}${r.hint ? ` — ${r.hint}` : ""}`}>
            <span className="bars-label" role="rowheader">{r.label}</span>
            <span className="bars-track" aria-hidden="true"><span className="bars-fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
            <span className="bars-value" role="cell">{r.count}</span>
          </Tag>
        );
      })}
    </div>
  );
}

/** A count that turns orange or red above the customer's saved thresholds (Administration › Organisation). */
function AlertStat({ value, label, to, thresholds }: { value: number; label: string; to: string; thresholds: { warnAt: number; criticalAt: number } }) {
  const tone = toneForValue(value, thresholds);
  return (
    <Link to={to} className={`statcard${tone ? ` ${tone}` : ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}{tone && <> · <strong>{tone === "stop" ? "above the alert level" : "above the warning level"}</strong></>}</span>
    </Link>
  );
}

/**
 * Reports: where demand comes from, where stories sit and how delivery
 * performs -- moved off the landing page. Every number comes from the
 * same canonical lifecycle each story shows, so a report can never
 * disagree with the story it counts.
 */
export function ReportsPage() {
  const info = useSessionInfo();
  const { query } = useLocation();
  const period = (INSIGHT_PERIODS.find((p) => p.key === query.get("period"))?.key ?? "month") as InsightPeriod;
  const { data: metrics, error, loading: metricsLoading } = useAsync<FactoryMetrics>(() => api.getMetrics(period), [period]);
  const { data: allChanges } = useAsync(() => api.listChanges(), []);
  const { data: thresholds } = useAsync(() => api.getDashboardThresholds().catch(() => DEFAULT_DASHBOARD_THRESHOLDS), []);
  const [queue, setQueue] = useState<DeliveryQueueEntry[]>([]);
  useEffect(() => { api.listDeliveryQueue().then(setQueue).catch(() => setQueue([])); }, []);

  if (error) return <ErrorState error={error} title="Insights could not be loaded" />;
  if (metricsLoading || !metrics || !allChanges) return <Loading what="insights" />;

  const changes = allChanges.filter((c) => inInsightPeriod(c.createdAt, period));
  const phases = metrics.phases?.length ? metrics.phases : PHASES.map((p) => ({ stage: p.label, count: changes.filter((c) => c.lifecycle?.phase === p.key).length }));
  const health = (metrics.health ?? []).filter((h) => h.count > 0);
  const byId = new Map(changes.map((c) => [c.id, c]));
  const perf = metrics.performance;
  // The delivery queue holds what the Application Manager authorised; only the
  // part past solution review is in delivery (finding 8).
  const queued = queue.filter((e) => byId.has(e.changeId));
  const inDelivery = queued.filter((e) => ["delivery", "validation", "release"].includes(byId.get(e.changeId)?.lifecycle?.phase ?? ""));
  const inArchitecture = queued.filter((e) => ["solutioning", "solution_review"].includes(byId.get(e.changeId)?.lifecycle?.phase ?? "")).length;

  return (
    <div className="reports vr-pilot">
      <PageHeader title="Insights" subtitle="Demand, flow and delivery for this customer." />
      <div className="toolbar"><label htmlFor="insight-period">Period</label><select id="insight-period" value={period} onChange={(e) => setQueryParam("period", e.target.value)}>
        {INSIGHT_PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select></div>
      <ReviewDetail title="How to read these insights"><p className="muted">Stories created in the selected period (7, 30 or 365 days, or lifetime), shown at their current lifecycle status. This is a story cohort, not a count of events during that period.</p></ReviewDetail>

      <div className="statrow">
        <Link to={`/stories?period=${period}`} className="statcard"><span className="stat-value">{changes.filter((c) => c.lifecycle?.phase !== "done" && !isRequest(c)).length}</span><span className="stat-label">user stories in progress</span></Link>
        <Link to={`/stories?phase=understand&period=${period}`} className="statcard"><span className="stat-value">{changes.filter(isRequest).length}</span><span className="stat-label">incoming requests (not a story yet)</span></Link>
        <AlertStat to={`/stories?health=waiting_decision&period=${period}`} value={changes.filter((c) => c.lifecycle?.health === "waiting_decision").length}
                   label="waiting for a decision" thresholds={thresholds ?? DEFAULT_DASHBOARD_THRESHOLDS} />
        <AlertStat to={`/stories?health=stuck&period=${period}`} value={changes.filter((c) => c.lifecycle?.health === "failed" || c.lifecycle?.health === "blocked").length}
                   label="blocked or needing attention" thresholds={thresholds ?? DEFAULT_DASHBOARD_THRESHOLDS} />
        <div className="statcard"><span className="stat-value">{changes.filter((c) => c.lifecycle?.outcome === "delivered").length}</span><span className="stat-label">delivered</span></div>
      </div>

      <div className="reportgrid">
        <Section title="Requests and stories by lifecycle phase" description="Click a phase to see its stories.">
          <Bars label="Stories and requests by phase" rows={phases.map((p) => ({ label: p.stage === "Understand" ? "Requests (not a story yet)" : p.stage, count: p.count }))}
                onRow={(i) => navigate(`/stories?period=${period}&phase=${PHASES[i].key}${PHASES[i].key === "done" ? "&done=1" : ""}`)} />
        </Section>
        <Section title="Health of open work">
          {health.length === 0 ? <EmptyState title="No open work" /> : <Bars label="Stories by health" rows={health.map((h) => ({ label: h.stage, count: h.count }))} />}
        </Section>
        <Section title="Demand by business domain" description="Backlog and delivery in this cohort. Click a domain to see its stories.">
          {metrics.businessDomainBreakdown.length === 0 ? <EmptyState title="No domain data yet" /> : (
            <Bars label="Demand by business domain" rows={metrics.businessDomainBreakdown.map((d) => ({ label: d.domainName, count: d.count }))}
                  onRow={(i) => { const d = metrics.businessDomainBreakdown[i]; navigate(`/stories?done=1&period=${period}&domain=${encodeURIComponent(d.domainId ?? "none")}`); }} />
          )}
        </Section>
        <Section title="Expected business benefit (rated, not achieved)" description="The expected benefit as rated when the story was reviewed and confirmed by a person. This is not benefit achieved: JADE does not measure realised benefit.">
          <Bars label="Expected business benefit (confirmed rating)" rows={["High","Medium","Small"].map((level) => ({label:level,count:changes.filter((c) => c.ratings?.businessBenefit.confirmed === level).length}))} />
          <span className="vr-note">{changes.filter((c) => !isRequest(c) && !c.ratings?.businessBenefit.confirmed).length} stories without a confirmed expected benefit</span>
        </Section>
        <Section title="Expected business impact (rated, not measured)" description="The impact of the business problem as rated and confirmed by a person; not a measured result.">
          <Bars label="Expected business impact (confirmed rating)" rows={["High","Medium","Low"].map((level) => ({label:level,count:changes.filter((c) => c.ratings?.businessImpact.confirmed === level).length}))} />
          <ReviewDetail title="Original impact coverage"><Bars label="Business impact stated" rows={metrics.businessImpactBreakdown.map((b) => ({label:b.category,count:b.count}))} /><p>Counts stated narrative impact, not its severity.</p></ReviewDetail>
        </Section>
        <Section title="Recommended delivery routes" description="The route the Architect recommends for stories that need a change in JD Edwards. Recommendations, not completed deliveries.">
          <Bars label="Recommended delivery routes" rows={DELIVERY_ROUTES.map((route) => ({ label: route, count: changes.filter((c) => c.architectDecision?.recommendedRoute === route).length })).filter((r) => r.count > 0)} />
          <p className="vr-note">
            {changes.filter((c) => c.architectDecision?.recommendedRoute === "Resolve without Change").length} resolved without a change ·{" "}
            {changes.filter((c) => c.architectDecision?.recommendedRoute === "Clarification Required").length} waiting for clarification ·{" "}
            {changes.filter((c) => !isRequest(c) && !c.architectDecision).length} stories not analysed by the Architect yet
          </p>
        </Section>
      </div>

      <Section title="Change types"><Bars label="Change types" rows={metrics.changeTypes.map((t) => ({label: t.type, count: t.count}))} /></Section>
      <Section title="Quality and governance">
        <div className="statrow">
          <div className="statcard plain"><span className="stat-value">{perf.firstTimeSuccessRate}%</span><span className="stat-label">stories that passed JADE's quality check without a revision</span></div>
          <div className="statcard plain"><span className="stat-value">{perf.humanApprovals}</span><span className="stat-label">human approvals recorded ({perf.humanRejections} rejected)</span></div>
          <div className="statcard plain"><span className="stat-value">{perf.changeVolume}</span><span className="stat-label">requests and stories in total</span></div>
          <div className="statcard plain"><span className="stat-value">{perf.deliveredCount ? `${perf.averageCycleTimeDays} days` : "no data"}</span>
            <span className="stat-label">average cycle time, request received to as-built record finalised ({perf.deliveredCount} delivered in this period)</span></div>
        </div>
      </Section>

      {info.appManagement && <Section title="Delivery queue" description="Approved changes in delivery, validation or release, in queue order. Stories authorised but still in architecture are counted below the table."
        actions={<Link to="/am/delivery">Open Delivery</Link>}>
        {inDelivery.length === 0 ? <EmptyState title="Nothing in delivery yet" /> : (
          <table className="data">
            <thead><tr><th>#</th><th>Story</th><th>Phase</th><th>Health</th><th>Authorised by</th></tr></thead>
            <tbody>{inDelivery.map((e) => {
              const c = byId.get(e.changeId);
              return (
                <tr key={e.changeId}>
                  <td>{e.position}</td>
                  <td><Link to={storyPath(e.changeId)}>{c ? storyTitle(c) : e.changeId}</Link>{e.blockedReason && <div className="muted small">Blocked: {e.blockedReason}</div>}</td>
                  <td><PhaseLabel lifecycle={c?.lifecycle} /></td>
                  <td><HealthIndicator lifecycle={c?.lifecycle} /></td>
                  <td>{e.addedBy}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
        {inArchitecture > 0 && <p className="vr-note">{inArchitecture} authorised stor{inArchitecture === 1 ? "y is" : "ies are"} still in architecture (solutioning or solution review): <Link to="/am/architecture-review">Architecture Review</Link>.</p>}
      </Section>}

      {info.has("admin") && (
        <p className="muted">AI usage, agent health and run history are under <Link to="/admin/operations">Administration › Operations</Link>.</p>
      )}
    </div>
  );
}

