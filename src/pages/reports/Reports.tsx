import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { DeliveryQueueEntry, FactoryMetrics } from "../../types/domain";
import { PHASES } from "../../types/domain";
import {
  EmptyState, ErrorState, HealthIndicator, Loading, PageHeader, PhaseLabel, Section, storyTitle, useAsync, useSessionInfo,
} from "../../components/design";
import { Link, navigate, storyPath } from "../../router";
import { DEFAULT_DASHBOARD_THRESHOLDS, toneForValue } from "../../services/dashboardThresholds";

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
  const { data: metrics, error } = useAsync<FactoryMetrics>(() => api.getMetrics(), []);
  const { data: changes } = useAsync(() => api.listChanges(), []);
  const { data: thresholds } = useAsync(() => api.getDashboardThresholds().catch(() => DEFAULT_DASHBOARD_THRESHOLDS), []);
  const [queue, setQueue] = useState<DeliveryQueueEntry[]>([]);
  useEffect(() => { api.listDeliveryQueue().then(setQueue).catch(() => setQueue([])); }, []);

  if (error) return <ErrorState error={error} title="Reports could not be loaded" />;
  if (!metrics || !changes) return <Loading what="reports" />;

  const phases = metrics.phases?.length ? metrics.phases : PHASES.map((p) => ({ stage: p.label, count: changes.filter((c) => c.lifecycle?.phase === p.key).length }));
  const health = (metrics.health ?? []).filter((h) => h.count > 0);
  const byId = new Map(changes.map((c) => [c.id, c]));
  const perf = metrics.performance;

  return (
    <div className="reports">
      <PageHeader title="Reports" subtitle="Demand, flow and delivery across all stories for this customer." />

      <div className="statrow">
        <div className="statcard"><span className="stat-value">{changes.filter((c) => c.lifecycle?.phase !== "done").length}</span><span className="stat-label">stories in progress</span></div>
        <AlertStat to="/stories?health=waiting_decision" value={changes.filter((c) => c.lifecycle?.health === "waiting_decision").length}
                   label="waiting for a decision" thresholds={thresholds ?? DEFAULT_DASHBOARD_THRESHOLDS} />
        <AlertStat to="/stories?health=stuck" value={changes.filter((c) => c.lifecycle?.health === "failed" || c.lifecycle?.health === "blocked").length}
                   label="blocked or needing attention" thresholds={thresholds ?? DEFAULT_DASHBOARD_THRESHOLDS} />
        <div className="statcard"><span className="stat-value">{changes.filter((c) => c.lifecycle?.outcome === "delivered").length}</span><span className="stat-label">delivered</span></div>
      </div>

      <div className="reportgrid">
        <Section title="Stories by lifecycle phase" description="Click a phase to see its stories.">
          <Bars label="Stories by phase" rows={phases.map((p) => ({ label: p.stage, count: p.count }))}
                onRow={(i) => navigate(`/stories?phase=${PHASES[i].key}${PHASES[i].key === "done" ? "&done=1" : ""}`)} />
        </Section>
        <Section title="Health of open work">
          {health.length === 0 ? <EmptyState title="No open work" /> : <Bars label="Stories by health" rows={health.map((h) => ({ label: h.stage, count: h.count }))} />}
        </Section>
        <Section title="Demand by business domain" description="Current backlog and delivery. Click a domain to open it.">
          {metrics.businessDomainBreakdown.length === 0 ? <EmptyState title="No domain data yet" /> : (
            <Bars label="Demand by business domain" rows={metrics.businessDomainBreakdown.map((d) => ({ label: d.domainName, count: d.count }))}
                  onRow={(i) => { const d = metrics.businessDomainBreakdown[i]; navigate(d.domainId ? `/business/${encodeURIComponent(d.domainId)}` : "/stories?domain=none"); }} />
          )}
        </Section>
        <Section title="Business impact stated" description="Counts only impact a requester actually stated; a low count means missing information, not zero impact.">
          <Bars label="Business impact stated" rows={metrics.businessImpactBreakdown.map((b) => ({ label: b.category, count: b.count }))} />
        </Section>
      </div>

      <Section title="Quality and governance">
        <div className="statrow">
          <div className="statcard plain"><span className="stat-value">{perf.firstTimeSuccessRate}%</span><span className="stat-label">stories that passed JADE's quality check without a revision</span></div>
          <div className="statcard plain"><span className="stat-value">{perf.humanApprovals}</span><span className="stat-label">human approvals recorded ({perf.humanRejections} rejected)</span></div>
          <div className="statcard plain"><span className="stat-value">{perf.changeVolume}</span><span className="stat-label">requests and stories in total</span></div>
        </div>
      </Section>

      {info.appManagement && <Section title="Delivery queue" description="Work authorised for delivery, in order. Phase and health come from each story's own lifecycle."
        actions={<Link to="/am/delivery-queue">Open the Delivery Queue</Link>}>
        {queue.length === 0 ? <EmptyState title="Nothing authorised for delivery yet" /> : (
          <table className="data">
            <thead><tr><th>#</th><th>Story</th><th>Phase</th><th>Health</th><th>Authorised by</th></tr></thead>
            <tbody>{queue.map((e) => {
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
      </Section>}

      {info.has("admin") && (
        <p className="muted">AI usage, agent health and run history are under <Link to="/admin/operations">Administration › Operations</Link>.</p>
      )}
    </div>
  );
}

