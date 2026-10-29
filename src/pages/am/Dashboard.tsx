import { api } from "../../services/api";
import type { Navigate } from "../../types/nav";
import type { Change } from "../../types/domain";
import { useState } from "react";
import { ErrorState, Loading, PageHeader, useAsync, useSessionInfo } from "../../components/design";
import { Link } from "../../router";
import { AM_STAGES, inAmStage, type AmStage } from "./workflow";
import { isException } from "../../services/metrics";
import { AppManagerHome, greeting } from "../work/MyWork";
import { IconTile } from "../../components/icons";

/**
 * The Application Manager's cockpit (design: "the Application Manager home,
 * with statistics below the decision queue"; review 23 Oct: a cockpit to start
 * the day with). One headline -- what needs you -- and four key figures; the flow
 * of approved work as one single-hue chart, each stage a link to its queue,
 * blocked work marked in words; then one compact queue. Every figure comes from
 * the canonical lifecycle and recorded event times; definitions sit behind "?".
 */
const FLOW: { key: AmStage; label: string; icon: string }[] = [
  { key: "backlog", label: "Backlog review", icon: "story" },
  { key: "architecture", label: "Architecture", icon: "decision" },
  { key: "approved", label: "Approved", icon: "done" },
  { key: "delivery", label: "In delivery", icon: "delivery" },
  { key: "validation", label: "Validation", icon: "test" },
  { key: "asbuilt", label: "Release hand-over", icon: "release" },
];
// "Ready for release" overlaps with Completed (JADE does not record production
// promotion), so it is not a stage of the flow; delivered work is a key figure.

/** Where approved work stands: one single-hue chart, each stage a link to its queue (Insights, decision X1). */
export function ApprovedWorkFlow({ changes }: { changes: Change[] }) {
  const stages = FLOW.map((s) => {
    const rows = changes.filter((c) => inAmStage(c, s.key));
    return { ...s, n: rows.length, blocked: rows.filter(isException).length, to: AM_STAGES.find((x) => x.key === s.key)!.to };
  });
  // Insights review 29 Oct: numbered stage tiles in the consultiq.nl style instead of a bar chart.
  return (
    <ol className="stagetiles" aria-label="Where approved work stands">
      {stages.map((s, i) => (
        <li key={s.key}>
          <Link to={s.to} className={`hovercard stagetile${s.n ? "" : " zero"}`} title={`${s.label}: ${s.n}${s.blocked ? `, ${s.blocked} blocked` : ""}`}>
            <span className="stagetile-step">{String(i + 1).padStart(2, "0")}</span>
            <IconTile name={s.icon} size="lg" />
            <span className="ic-value">{s.n}</span>
            <span className="ic-label">{s.label}</span>
            {s.blocked ? <span className="stagetile-blocked">{s.blocked} blocked</span> : null}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/**
 * The Application Manager home (decision X1, register K7/K15): one slim figure
 * strip -- the same component and numbers as My Work and Insights -- the queue
 * directly under it, the stuck list and the domains. Charts live in Insights.
 */
export function Dashboard(_props: { onOpenChange: (id: string) => void; onNavigate: Navigate }) {
  const info = useSessionInfo();
  const [tick, setTick] = useState(0);
  const { data: work, error } = useAsync(() => api.getMyWork(), [tick]);
  if (error) return <ErrorState title="Application Management could not be loaded" error={error} />;
  if (!work) return <Loading what="Application Management" />;
  const firstName = info.session.displayName.split(/\s+/)[0];
  // Repair brief P4: this page counts the Application Management work it shows, not every role's total.
  const n = work.areaCounts?.application ?? work.attentionCount;
  return (
    <div className="cockpit home">
      <PageHeader eyebrow={`${greeting()}, ${firstName}`} title={n === 0 ? "Nothing needs you right now" : `${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} you`} />
      <AppManagerHome work={work} onChanged={() => setTick((t) => t + 1)} />
      <p className="cockpit-links"><Link to="/am/delivery">All approved work</Link> · <Link to="/reports">Insights</Link></p>
    </div>
  );
}

