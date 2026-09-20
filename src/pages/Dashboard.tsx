import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { ActivityEntry, Change, FactoryMetrics } from "../types/domain";
import type { Navigate, NavFilter, Page } from "../types/nav";
import {
  ApiNote,
  BarList,
  ColumnChart,
  DonutChart,
  Kpi,
  Loading,
  PriorityBadge,
  StateBadge,
} from "../components/ui";

const KPI_MARKS = ["▤", "◷", "⚗", "⚙", "✓", "◆"];

/**
 * Every dashboard total maps deterministically to a work queue + a
 * pre-applied filter (Increment: Continuous Delivery Flow, item 3/8) —
 * "1 User Story awaiting Domain Owner approval" always opens User
 * Story Review filtered the same way, never a guess from the label.
 */
const METRIC_ROUTES: Record<string, { page: Page; filter?: NavFilter }> = {
  incoming_requests: { page: "userstories", filter: { view: "requests" } },
  awaiting_domain_owner: { page: "userstories", filter: { view: "review" } },
  backlog_ready: { page: "approval", filter: {} },
  in_delivery: { page: "deliveryqueue" },
  awaiting_business_validation: { page: "pipeline", filter: { stage: "validation" } },
  completed: { page: "pipeline", filter: { stage: "completed" } },
};

export function Dashboard({ onOpenChange, onNavigate }: {
  onOpenChange: (id: string) => void;
  onNavigate: Navigate;
}) {
  const [metrics, setMetrics] = useState<FactoryMetrics | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [attention, setAttention] = useState<Change[]>([]);

  useEffect(() => {
    api.getMetrics().then(setMetrics);
    api.getActivity().then(setActivity);
    api.listChanges().then((all) =>
      setAttention(all.filter((c) => c.state === "BACKLOG_READY" || c.state === "CHANGE_APPROVED").slice(0, 5))
    );
  }, []);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Jade Dashboard</h1>
          <div className="sub">
            Jade helps enterprise application teams resolve changes, support requests, testing,
            documentation, and releases faster—creating space for optimization work.
          </div>
        </div>
        <div className="meta">{today} · last 30 days</div>
      </div>

      {!metrics ? (
        <Loading what="the dashboard" />
      ) : (
        <div className="grid" style={{ gap: 16 }}>
          <div className="grid kpis">
            {metrics.totals.map((t, i) => {
              const route = METRIC_ROUTES[t.key];
              return (
                <Kpi
                  key={t.key}
                  value={t.value}
                  label={t.label}
                  mark={KPI_MARKS[i]}
                  onClick={route ? () => onNavigate(route.page, route.filter) : undefined}
                />
              );
            })}
          </div>

          <div className="grid thirds">
            <section className="panel">
              <h2>Change pipeline</h2>
              <ColumnChart data={metrics.pipeline} />
            </section>

            <section className="panel">
              <h2>Change types</h2>
              <DonutChart
                data={metrics.changeTypes.map((t) => ({ type: t.type, count: t.count }))}
                centreLabel="requests"
              />
            </section>

            <section className="panel">
              <h2>
                Business impact <span className="qualifier">— approved changes</span>
              </h2>
              <BarList data={metrics.businessImpactBreakdown} />
              <div className="apinote">
                Counts only criteria a requester actually stated. A low count means the
                information was not given, not that the impact is zero.
              </div>
            </section>
          </div>

          {metrics.businessDomainBreakdown.length > 0 && (
            <section className="panel">
              <h2>
                Change demand by business domain <span className="qualifier">— current backlog and delivery</span>
              </h2>
              <BarList
                data={metrics.businessDomainBreakdown.map((d) => ({
                  category: d.apqcCode ? `${d.domainName} (${d.apqcCode})` : d.domainName,
                  count: d.count,
                }))}
                onItemClick={(i) => {
                  const d = metrics.businessDomainBreakdown[i];
                  onNavigate("userstories", d.domainId ? { view: "all", domainId: d.domainId } : { view: "all" });
                }}
              />
              <div className="apinote">
                Where change demand is concentrated, by business domain. Click a domain to see its
                User Stories. "Unclassified / needs review" means a Domain Owner has not yet placed
                that request.
              </div>
            </section>
          )}

          <div className="grid halves">
            <section className="panel">
              <h2>Recent activity</h2>
              <table className="data">
                <thead>
                  <tr><th>Time</th><th>Change</th><th>Description</th><th>Status</th><th>Updated by</th></tr>
                </thead>
                <tbody>
                  {activity.map((a) => (
                    <tr key={a.changeId} className="clickable" onClick={() => onOpenChange(a.changeId)}>
                      <td className="mono">{a.time}</td>
                      <td className="mono">{a.changeId}</td>
                      <td>{a.description}</td>
                      <td><StateBadge state={a.state} /></td>
                      <td>{a.updatedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12 }}>
                <button className="linkish" onClick={() => onNavigate("pipeline")}>View all changes</button>
              </div>
            </section>

            <section className="panel">
              <h2>Needs your attention</h2>
              {attention.length === 0 ? (
                <div className="empty">Nothing waiting on you right now.</div>
              ) : (
                <table className="data">
                  <thead>
                    <tr><th>Change</th><th>Description</th><th>Action</th><th>Priority</th></tr>
                  </thead>
                  <tbody>
                    {attention.map((c) => (
                      <tr key={c.id}>
                        <td className="mono">{c.id}</td>
                        <td>{c.title}</td>
                        <td>
                          <button className="btn small primary" onClick={() => onOpenChange(c.id)}>
                            {c.state === "BACKLOG_READY" ? "Review" : "Approve change"}
                          </button>
                        </td>
                        <td><PriorityBadge priority={c.priority} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 12 }}>
                <button className="linkish" onClick={() => onNavigate("approval")}>Go to approvals</button>
              </div>
            </section>
          </div>

          <section className="panel">
            <h2>Delivery performance <span className="qualifier">— last 30 days</span></h2>
            <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <Perf
                label="Average cycle time"
                value={`${metrics.performance.averageCycleTimeDays} days`}
                delta={`${metrics.performance.averageCycleTimeDelta} days`}
                good={metrics.performance.averageCycleTimeDelta < 0}
              />
              <Perf
                label="First-time success rate"
                value={`${metrics.performance.firstTimeSuccessRate}%`}
                delta={`+${metrics.performance.firstTimeSuccessDelta}%`}
                good
                note="Stories that passed the quality gate without a revision"
              />
              <Perf
                label="Human approvals"
                value={String(metrics.performance.humanApprovals)}
                delta={`${metrics.performance.humanRejections} rejected`}
                good
                neutralDelta
              />
              <Perf
                label="Change volume"
                value={String(metrics.performance.changeVolume)}
                delta={`+${metrics.performance.changeVolumeDelta}%`}
                good
              />
            </div>
            <ApiNote endpoint="GET /metrics" />
          </section>
        </div>
      )}
    </>
  );
}

function Perf({ label, value, delta, good, neutralDelta, note }: {
  label: string; value: string; delta: string; good: boolean; neutralDelta?: boolean; note?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{label}</div>
      <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: neutralDelta ? "var(--muted)" : good ? "var(--ok)" : "var(--stop)" }}>
        {delta}
      </div>
      {note && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{note}</div>}
    </div>
  );
}
