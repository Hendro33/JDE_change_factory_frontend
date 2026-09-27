import { ReviewDetail } from "../../components/visualReview";
import { api } from "../../services/api";
import type { Navigate } from "../../types/nav";
import { ErrorState, Loading, PageHeader, Section, useAsync } from "../../components/design";
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
    <PageHeader title="Application Management Dashboard" subtitle="Move approved work through delivery, validation and release readiness." />
    <div className="statrow">{AM_STAGES.map((s) => <Link key={s.key} to={s.to} className="statcard">
      <span className="stat-value">{changes.filter((c) => inAmStage(c, s.key)).length}</span><span className="stat-label">{s.label}</span>
    </Link>)}</div>
    <ReviewDetail title="How these queues relate"><p className="muted">Current queues. Completed records remain available for release / CNC handover; readiness and completion overlap. Production promotion is recorded outside JADE.</p></ReviewDetail>
    <Section title="Needs your attention"><StoryTable rows={attention} compact /></Section>
    <Section title="Recent application work"><StoryTable rows={[...approved].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)} compact /></Section>
    <p><Link to="/reports">Explore demand, quality and governance in Insights</Link></p>
  </div>;
}
