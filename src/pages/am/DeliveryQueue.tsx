import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { Change, DeliveryQueueEntry } from "../../types/domain";
import { Loading } from "../../components/ui";
import { HealthIndicator, PhaseLabel } from "../../components/design";
import { Link } from "../../router";
import { AM_STAGES, inAmStage } from "./workflow";

/**
 * The Delivery Queue (Increment: Continuous Delivery Flow) — the set
 * of approved changes Jade is authorised to work on, in queue order.
 *
 * Deliberately NOT a Sprint board: no capacity, no start/end dates, no
 * planning ceremony. Just an ordered list one human decision
 * (Application Manager approval, on Backlog Review) adds entries to.
 *
 * Every state shown here is the story's canonical lifecycle (phase, health
 * and next action) -- the same words as the story page and every other
 * list. The queue entry's own stored status is never advanced, so it is not
 * shown as the state.
 */
const FLOW = AM_STAGES.filter((s) => ["architecture", "approved", "delivery", "validation", "asbuilt", "completed"].includes(s.key));

export function DeliveryQueuePage({ onOpenChange }: { onOpenChange: (id: string) => void }) {
  const [entries, setEntries] = useState<DeliveryQueueEntry[] | null>(null);
  const [changesById, setChangesById] = useState<Map<string, Change>>(new Map());

  useEffect(() => {
    api.listDeliveryQueue().then(setEntries);
    api.listChanges().then((all) => setChangesById(new Map(all.map((c) => [c.id, c]))));
  }, []);

  const queued = (entries ?? []).map((e) => changesById.get(e.changeId)).filter((c): c is Change => !!c);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Delivery Queue</h1>
          <div className="sub">The approved work JADE is authorised to deliver, in order, and where each story is now.</div>
        </div>
        <div className="meta">{entries?.length ?? 0} queued</div>
      </div>

      {!entries ? <Loading what="the delivery queue" /> : (
        <div className="stack">
          <section className="panel">
            <h2>Where everything sits</h2>
            <div className="statrow">
              {FLOW.map((s) => (
                <Link key={s.key} to={s.to} className="statcard">
                  <span className="stat-value">{queued.filter((c) => inAmStage(c, s.key)).length}</span>
                  <span className="stat-label">{s.label}</span>
                </Link>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>Counts of the queued stories in each stage, from the same lifecycle as the story pages.</p>
          </section>

          {entries.length === 0 ? (
            <div className="empty">
              Nothing queued yet. Once the Application Manager approves a story on Backlog Review, it appears here.
            </div>
          ) : (
            <section className="panel">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th><th>Story</th><th>Phase</th><th>Health</th><th>Next action</th><th>With</th><th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const change = changesById.get(e.changeId);
                    return (
                      <tr key={e.changeId} className="clickable" onClick={() => onOpenChange(e.changeId)}>
                        <td className="mono">{e.position}</td>
                        <td><div>{change?.title ?? e.title ?? <span className="notstated">unknown</span>}</div>
                          <div className="mono muted">{e.changeId}</div></td>
                        <td>{change ? <PhaseLabel lifecycle={change.lifecycle} /> : e.phaseLabel || "—"}</td>
                        <td>{change ? <HealthIndicator lifecycle={change.lifecycle} /> : e.healthLabel || "—"}</td>
                        <td>{change?.lifecycle?.nextAction.summary ?? e.nextAction ?? "—"}</td>
                        <td>{change?.lifecycle?.nextAction.ownerLabel || e.nextActionOwner || "—"}</td>
                        <td>{new Date(e.addedAt).toLocaleDateString("en-GB")}<div className="muted small">by {e.addedBy}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </>
  );
}
