import { api } from "../../services/api";
import type { Navigate } from "../../types/nav";
import type { Change } from "../../types/domain";
import { useState } from "react";
import { ErrorState, Loading, PageHeader, useAsync, useSessionInfo } from "../../components/design";
import { Link } from "../../router";
import { AM_STAGES, inAmStage, type AmStage } from "./workflow";
import { isException } from "../../services/metrics";
import { AppManagerHome, greeting } from "../work/MyWork";

/**
 * The Application Manager's cockpit (design: "the Application Manager home,
 * with statistics below the decision queue"; review 23 Oct: a cockpit to start
 * the day with). One headline -- what needs you -- and four key figures; the flow
 * of approved work as one single-hue chart, each stage a link to its queue,
 * blocked work marked in words; then one compact queue. Every figure comes from
 * the canonical lifecycle and recorded event times; definitions sit behind "?".
 */
const FLOW: { key: AmStage; label: string }[] = [
  { key: "backlog", label: "Backlog review" },
  { key: "architecture", label: "Architecture" },
  { key: "approved", label: "Approved" },
  { key: "delivery", label: "In delivery" },
  { key: "validation", label: "Validation" },
  { key: "asbuilt", label: "Release hand-over" },
];
// "Ready for release" overlaps with Completed (JADE does not record production
// promotion), so it is not a stage of the flow; delivered work is a key figure.

/** Where approved work stands: one single-hue chart, each stage a link to its queue (Insights, decision X1). */
export function ApprovedWorkFlow({ changes }: { changes: Change[] }) {
  const stages = FLOW.map((s) => {
    const rows = changes.filter((c) => inAmStage(c, s.key));
    return { ...s, n: rows.length, blocked: rows.filter(isException).length, to: AM_STAGES.find((x) => x.key === s.key)!.to };
  });
  const max = Math.max(1, ...stages.map((s) => s.n));
  return (
    <section className="flow" aria-label="Where approved work stands">
      <ol className="flow-bars">
        {stages.map((s) => (
          <li key={s.key}>
            <Link to={s.to} className={`flow-col${s.n ? "" : " zero"}`} title={`${s.label}: ${s.n}${s.blocked ? `, ${s.blocked} blocked` : ""}`}>
              <span className="flow-n">{s.n}</span>
              <span className="flow-track" aria-hidden="true"><span className="flow-fill" style={{ height: `${(s.n / max) * 100}%` }} /></span>
              <span className="flow-label">{s.label}</span>
              <span className="flow-blocked">{s.blocked ? <><span aria-hidden="true">■</span> {s.blocked} blocked</> : " "}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
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

