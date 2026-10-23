import { api } from "../../services/api";
import type { Navigate } from "../../types/nav";
import { Details, ErrorState, Loading, Section, useAsync } from "../../components/design";
import { Link } from "../../router";
import { StoryTable } from "../stories/Stories";
import { AM_STAGES, inAmStage } from "./workflow";

export function Dashboard(_props: { onOpenChange: (id: string) => void; onNavigate: Navigate }) {
  const { data: changes, error } = useAsync(() => api.listChanges(), []);
  if (error) return <ErrorState title="Dashboard could not be loaded" error={error} />;
  if (!changes) return <Loading what="Application Management" />;
  const approved = changes.filter((c) => AM_STAGES.some((s) => inAmStage(c, s.key)));
  const attention = approved.filter((c) => c.lifecycle?.nextAction.owner === "product_manager" && c.lifecycle.nextAction.kind !== "none");
  return <div className="vr-pilot">
    <div className="pagetitle"><h1>Application Management</h1><span className="qcount">{attention.length} need you</span></div>
    <nav className="flowstrip" aria-label="Where approved work sits">{AM_STAGES.map((s) => {
      const n = changes.filter((c) => inAmStage(c, s.key)).length;
      return <Link key={s.key} to={s.to} className={n ? "" : "zero"}><strong>{n}</strong> {s.label}</Link>;
    })}</nav>
    <p className="muted explain">Ready for release and Completed overlap: production promotion is recorded outside JADE.</p>
    <Section title="Needs you">{attention.length ? <StoryTable rows={attention} compact /> : <p className="muted">Nothing is waiting on you.</p>}</Section>
    <Details summary="Recently updated">
      <StoryTable rows={[...approved].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)} compact />
    </Details>
    <p><Link to="/reports">Explore demand, quality and governance in Insights</Link></p>
  </div>;
}
