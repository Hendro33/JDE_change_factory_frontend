import { api } from "../../services/api";
import type { Navigate } from "../../types/nav";
import type { Change } from "../../types/domain";
import { ErrorState, Loading, useAsync, useSessionInfo } from "../../components/design";
import { Link } from "../../router";
import { AM_STAGES, inAmStage, type AmStage } from "./workflow";
import { deliveredWithin, isException, medianLeadTime, oldestWaiting } from "../../services/metrics";
import { QueueRow, greeting } from "../work/MyWork";

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

export function Dashboard(_props: { onOpenChange: (id: string) => void; onNavigate: Navigate }) {
  const info = useSessionInfo();
  const { data: changes, error } = useAsync(() => api.listChanges(), []);
  if (error) return <ErrorState title="Dashboard could not be loaded" error={error} />;
  if (!changes) return <Loading what="Application Management" />;

  const approved = changes.filter((c) => AM_STAGES.some((s) => inAmStage(c, s.key)));
  const mine = (c: Change) => !!c.lifecycle && c.lifecycle.nextAction.owner === "product_manager" && c.lifecycle.nextAction.kind !== "none";
  const forYou = approved.filter(mine).sort((a, b) => Number(b.lifecycle!.nextAction.kind === "decision") - Number(a.lifecycle!.nextAction.kind === "decision")
    || (a.lifecycle!.since ?? "").localeCompare(b.lifecycle!.since ?? ""));
  const exceptionsElsewhere = approved.filter((c) => isException(c) && !mine(c));
  const inFlight = approved.filter((c) => c.lifecycle?.phase !== "done");
  const lead = medianLeadTime(changes, 90);
  const oldest = oldestWaiting(forYou);
  const delivered30 = deliveredWithin(changes, 30).length;
  const stages = FLOW.map((s) => {
    const rows = changes.filter((c) => inAmStage(c, s.key));
    return { ...s, n: rows.length, blocked: rows.filter(isException).length, to: AM_STAGES.find((x) => x.key === s.key)!.to };
  });
  const max = Math.max(1, ...stages.map((s) => s.n));
  const firstName = info.session.displayName.split(/\s+/)[0];

  return (
    <div className="cockpit">
      <div className="cockpit-greeting">{greeting()}, {firstName}</div>
      <section className="cockpit-top" aria-label="Today">
        <div className="hero" title="Decisions and tasks whose next step belongs to the Application Manager.">
          <span className="hero-value">{forYou.length}</span>
          <span className="hero-label">{forYou.length === 1 ? "thing needs you" : "things need you"}</span>
          {oldest !== null && <span className="hero-sub">oldest waiting {oldest} day{oldest === 1 ? "" : "s"}</span>}
        </div>
        <dl className="kpis">
          <Kpi label="Exceptions" value={approved.filter(isException).length} tone={approved.some(isException) ? "stop" : undefined}
            def="Open stories that are blocked, need attention, or whose authorisation expired." />
          <Kpi label="In flight" value={inFlight.length} def="Approved stories from backlog review to release, not yet done." />
          <Kpi label="Delivered, 30 days" value={delivered30} def="Delivered stories whose recorded finish falls in the last 30 days." />
          <Kpi label="Median lead time" value={lead.days === null ? "—" : `${lead.days} d`}
            def={`From story proposed to delivered, stories delivered in the last 90 days (${lead.n}).`} />
        </dl>
      </section>

      <section className="flow" aria-label="Where approved work stands">
        <h2 className="minihead">Where approved work stands</h2>
        <ol className="flow-bars">
          {stages.map((s) => (
            <li key={s.key}>
              <Link to={s.to} className={`flow-col${s.n ? "" : " zero"}`} title={`${s.label}: ${s.n}${s.blocked ? `, ${s.blocked} blocked` : ""}`}>
                <span className="flow-n">{s.n}</span>
                <span className="flow-track" aria-hidden="true"><span className="flow-fill" style={{ height: `${(s.n / max) * 100}%` }} /></span>
                <span className="flow-label">{s.label}</span>
                <span className="flow-blocked">{s.blocked ? <><span aria-hidden="true">■</span> {s.blocked} blocked</> : " "}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Your queue">
        <h2 className="minihead">Your queue</h2>
        {forYou.length === 0 ? <p className="muted">Nothing is waiting on you.</p>
          : <ul className="queue">{forYou.map((c) => <QueueRow key={c.id} c={c} />)}</ul>}
        {exceptionsElsewhere.length > 0 && (
          <details className="qmore">
            <summary>Blocked with someone else <span className="qcount">{exceptionsElsewhere.length}</span></summary>
            <ul className="queue">{exceptionsElsewhere.map((c) => <QueueRow key={c.id} c={c} />)}</ul>
          </details>
        )}
      </section>
      <p className="cockpit-links"><Link to="/am/delivery">All approved work</Link> · <Link to="/reports">Insights</Link></p>
    </div>
  );
}

function Kpi({ label, value, def, tone }: { label: string; value: string | number; def: string; tone?: "stop" }) {
  return (
    <div className={`kpi-tile${tone ? ` ${tone}` : ""}`} title={def}>
      <dt>{label}</dt>
      <dd className="kpi-value">{value}</dd>
      <dd className="kpi-def explain">{def}</dd>
    </div>
  );
}
