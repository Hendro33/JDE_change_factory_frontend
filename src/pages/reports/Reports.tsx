import { ReviewDetail } from "../../components/visualReview";
import { IconTile } from "../../components/icons";
import { ApprovedWorkFlow } from "../am/Dashboard";
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

/** Health label -> the User Stories filter key, so each tile opens exactly the stories it counts. */
const HEALTH_KEY: Record<string, string> = { "In progress": "in_progress", "Waiting for decision": "waiting_decision", "Waiting": "waiting",
  "Blocked": "blocked", "Needs attention": "failed" };

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
  const { data: figures } = useAsync(() => api.getFigures(), []);
  const { data: useful } = useAsync(() => api.getUsefulness(), []);
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

  // Trial (Hendro, 24 Oct): Insights in the consultiq.nl style -- coloured stat tiles, a charcoal band for
  // "Is JADE useful?", cards that lift on hover with larger icon tiles. Charts that add little insight are
  // folded under "More breakdowns" (kept, not removed).
  const f = (k: string) => figures?.find((x) => x.key === k);
  const blockedTone = toneForValue(Number(f("blocked")?.value ?? 0), thresholds ?? DEFAULT_DASHBOARD_THRESHOLDS);
  const tiles: { key: string; tone: string; to: string }[] = [
    { key: "lead_time", tone: "yellow", to: `/stories?period=${period}&phase=done&done=1` },
    { key: "delivered", tone: "white", to: "/stories?phase=done&done=1" },
    { key: "blocked", tone: "black", to: "/stories?health=stuck" },
    { key: "in_progress", tone: "pale", to: "/stories" },
  ];
  const openHealth = health;
  return (
    <div className="reports insights">
      <PageHeader title="Insights" subtitle="How demand flows through JADE, and whether JADE is useful."
        actions={<div className="toolbar"><label htmlFor="insight-period">Period</label><select id="insight-period" value={period} onChange={(e) => setQueryParam("period", e.target.value)}>
          {INSIGHT_PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select></div>} />

      {figures && (
        <section className="statgrid" aria-label="Now">
          {tiles.map((t) => { const x = f(t.key); return x ? (
            <Link key={t.key} to={t.to} className={`stattile ${t.tone}${t.key === "blocked" && blockedTone ? ` ${blockedTone}` : ""}`} title={x.definition}>
              <span className="stattile-value">{x.display}</span>
              <span className="stattile-label">{x.label}</span>
            </Link>) : null; })}
          {f("requests") && <p className="statnote"><Link to="/stories?phase=understand">{f("requests")!.display} incoming request{f("requests")!.display === "1" ? "" : "s"}</Link> not yet a story.</p>}
        </section>
      )}

      {useful && (
        <section className="darkband" aria-label="Is JADE useful?">
          <h2>Is JADE useful?</h2>
          <p className="darkband-lede">Measured from recorded events: work JADE completed, not text it produced.</p>
          <ul className="darkcards">{useful.map((u) => (
            <li key={u.key} className="darkcard" title={u.definition}>
              <span className="darkcard-value">{u.value}</span>
              <span className="darkcard-label">{u.label}</span>
              <span className="darkcard-detail">{u.detail}</span>
            </li>
          ))}</ul>
        </section>
      )}

      <Section title="Where work stands" description="Approved stories by stage, now, and the health of all open work. Each tile opens its stories.">
        {info.appManagement && <ApprovedWorkFlow changes={allChanges} />}
        {openHealth.length === 0 ? <EmptyState title="No open work" /> : (
          <ul className="healthline" aria-label="Health of open work">
            <li className="healthline-title">Health of open work</li>
            {openHealth.map((h) => (
              <li key={h.stage}><Link className={`healthpill h-${HEALTH_KEY[h.stage] ?? ""}${h.count ? "" : " zero"}`} to={`/stories?health=${HEALTH_KEY[h.stage] ?? ""}`}>
                <strong>{h.count}</strong> {h.stage}</Link></li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Demand by business domain" description="Stories in this period, per domain. Open a domain to see its stories.">
        {metrics.businessDomainBreakdown.length === 0 ? <EmptyState title="No domain data yet" /> : (
          <ul className="insightcards">{metrics.businessDomainBreakdown.map((d) => (
            <li key={d.domainId ?? "none"}><Link className="hovercard" to={`/stories?done=1&period=${period}&domain=${encodeURIComponent(d.domainId ?? "none")}`}>
              <IconTile name="domain" size="lg" /><span className="ic-value">{d.count}</span><span className="ic-label">{d.domainName}</span></Link></li>
          ))}</ul>
        )}
      </Section>

      <Section title="Quality and governance">
        <ul className="insightcards">
          <li><div className="hovercard"><IconTile name="target" size="lg" /><span className="ic-value">{perf.firstTimeSuccessRate}%</span><span className="ic-label">passed JADE's quality check without a revision</span></div></li>
          <li><div className="hovercard"><IconTile name="users" size="lg" /><span className="ic-value">{perf.humanApprovals}</span><span className="ic-label">human approvals recorded ({perf.humanRejections} rejected)</span></div></li>
          <li><div className="hovercard"><IconTile name="activity" size="lg" /><span className="ic-value">{perf.changeVolume}</span><span className="ic-label">requests and stories in total</span></div></li>
          <li><div className="hovercard"><IconTile name="clock" size="lg" /><span className="ic-value">{perf.deliveredCount ? `${perf.averageCycleTimeDays} d` : "—"}</span><span className="ic-label">average cycle time, request to as-built record ({perf.deliveredCount} delivered)</span></div></li>
        </ul>
      </Section>

      <details className="morebreakdowns">
        <summary>More breakdowns: phases, expected benefit and impact, delivery routes, change types and the delivery queue</summary>
        <ReviewDetail title="How to read these insights"><p className="muted">Stories created in the selected period (7, 30 or 365 days, or lifetime), shown at their current lifecycle status. This is a story cohort, not a count of events during that period.</p></ReviewDetail>
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
      <Section title="Change types"><Bars label="Change types" rows={metrics.changeTypes.map((t) => ({label: t.type, count: t.count}))} /></Section>
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

      </details>

      {info.has("admin") && (
        <p className="muted">AI usage, agent health and run history are under <Link to="/admin/operations">Administration › Operations</Link>.</p>
      )}
    </div>
  );
}

