import { api } from "../../services/api";
import type { Navigate } from "../../types/nav";
import { Details, ErrorState, Loading, Section, useAsync } from "../../components/design";
import { Link } from "../../router";
import { StoryTable } from "../stories/Stories";
import { AM_STAGES, inAmStage } from "./workflow";
import { MetricStrip, type Metric } from "../../components/work";
import { deliveredWithin, isException, medianLeadTime, oldestWaiting } from "../../services/metrics";

export function Dashboard(_props: { onOpenChange: (id: string) => void; onNavigate: Navigate }) {
  const { data: changes, error } = useAsync(() => api.listChanges(), []);
  if (error) return <ErrorState title="Dashboard could not be loaded" error={error} />;
  if (!changes) return <Loading what="Application Management" />;
  const approved = changes.filter((c) => AM_STAGES.some((s) => inAmStage(c, s.key)));
  const attention = approved.filter((c) => c.lifecycle?.nextAction.owner === "product_manager" && c.lifecycle.nextAction.kind !== "none");
  const attentionIds = new Set(attention.map((c) => c.id));
  // Exceptions owned by someone else: blocked, needing attention, or an authorisation no longer valid.
  const exceptions = approved.filter((c) => isException(c) && !attentionIds.has(c.id));
  const lead = medianLeadTime(changes, 90);
  const oldest = oldestWaiting(attention);
  const metrics: Metric[] = [
    { label: "Decisions and tasks for you", value: attention.length, definition: "Approved stories whose next action belongs to the Application Manager." },
    { label: "Oldest waiting", value: oldest === null ? "—" : `${oldest} day${oldest === 1 ? "" : "s"}`,
      definition: "Days since the current step of your longest-waiting item began (its latest recorded lifecycle event)." },
    { label: "Exceptions", value: approved.filter(isException).length, to: "/am/delivery",
      definition: "Open stories that are blocked, need attention, or whose authorisation expired or is no longer valid." },
    { label: "Delivered, last 30 days", value: deliveredWithin(changes, 30).length, to: "/am/delivery?stage=completed",
      definition: "Stories delivered whose finish (as-built record or last recorded step) falls in the last 30 days." },
    { label: "Median lead time", value: lead.days === null ? "no data" : `${lead.days} days`,
      definition: `From the story being proposed to delivered, for stories delivered in the last 90 days (${lead.n} stor${lead.n === 1 ? "y" : "ies"}).` },
  ];
  return <div className="vr-pilot">
    <div className="pagetitle"><h1>Application Management</h1><span className="qcount">{attention.length} need you</span></div>
    <Section title="Needs you">{attention.length ? <StoryTable rows={attention} compact am /> : <p className="muted">Nothing is waiting on you.</p>}</Section>
    {exceptions.length > 0 && <Section title={`Exceptions with others (${exceptions.length})`}><StoryTable rows={exceptions} compact am /></Section>}
    <h2 className="minihead">Where approved work stands</h2>
    <MetricStrip label="Application Management measures" items={metrics} />
    <nav className="flowstrip" aria-label="Where approved work sits">{AM_STAGES.map((s) => {
      const n = changes.filter((c) => inAmStage(c, s.key)).length;
      return <Link key={s.key} to={s.to} className={n ? "" : "zero"}><strong>{n}</strong> {s.label}</Link>;
    })}</nav>
    <p className="muted explain">Ready for release and Completed overlap: production promotion is recorded outside JADE. Not measured in JADE: realised business benefit and production deployment dates.</p>
    <Details summary="Recently updated">
      <StoryTable rows={[...approved].sort((a,b) => (b.lifecycle?.since ?? "").localeCompare(a.lifecycle?.since ?? "")).slice(0, 8)} compact am />
    </Details>
    <p><Link to="/reports">Explore demand, quality and governance in Insights</Link></p>
  </div>;
}
