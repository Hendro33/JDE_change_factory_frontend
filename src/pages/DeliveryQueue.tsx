import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Change, DeliveryQueueEntry, LifecycleState } from "../types/domain";
import { ApiNote, Loading, PIPELINE_STATES, PipelineFlow, StateBadge } from "../components/ui";

/**
 * The Delivery Queue (Increment: Continuous Delivery Flow) — the set
 * of approved changes Jade is authorised to work on, in queue order.
 *
 * Deliberately NOT a Sprint board: no capacity, no start/end dates, no
 * planning ceremony. Just an ordered list one human decision
 * (Application Manager approval, on Backlog Review) adds entries
 * to, plus whatever status/owner/blocked information is known.
 */
export function DeliveryQueuePage({ onOpenChange }: { onOpenChange: (id: string) => void }) {
  const [entries, setEntries] = useState<DeliveryQueueEntry[] | null>(null);
  const [changesById, setChangesById] = useState<Map<string, Change>>(new Map());

  useEffect(() => {
    api.listDeliveryQueue().then(setEntries);
    api.listChanges().then((all) => setChangesById(new Map(all.map((c) => [c.id, c]))));
  }, []);

  const countIn = (s: LifecycleState) =>
    Array.from(changesById.values()).filter((c) => c.state === s).length;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Delivery Queue</h1>
          <div className="sub">
            The approved work Jade is authorised to deliver, in order — no capacity plan or
            start/end date, just an ordered queue and its current state.
          </div>
        </div>
        <div className="meta">{entries?.length ?? 0} queued</div>
      </div>

      {!entries ? <Loading what="the delivery queue" /> : (
        <div className="stack">
          <section className="panel">
            <h2>Where everything sits</h2>
            <div className="sub" style={{ marginBottom: 12 }}>
              Every stage after approval, and how many changes are in it right now — the same
              population this queue draws from, not just what's still waiting to start.
            </div>
            <PipelineFlow
              states={PIPELINE_STATES}
              counts={Object.fromEntries(PIPELINE_STATES.map((s) => [s, countIn(s)]))}
            />
          </section>

          {entries.length === 0 ? (
            <div className="empty">
              Nothing queued yet. Once the Application Manager approves a change on Backlog
              Review, it appears here.
            </div>
          ) : (
            <section className="panel">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th><th>Change</th><th>Title</th><th>Status</th>
                    <th>Owner / agent</th><th>Blocked</th><th>Added by</th><th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const change = changesById.get(e.changeId);
                    return (
                      <tr key={e.changeId} className="clickable" onClick={() => onOpenChange(e.changeId)}>
                        <td className="mono">{e.position}</td>
                        <td className="mono">{e.changeId}</td>
                        <td>{change?.title ?? <span className="notstated">unknown</span>}</td>
                        <td>
                          {e.status === "queued" && <span className="badge grey">Queued</span>}
                          {e.status === "in_progress" && <span className="badge info">In progress</span>}
                          {e.status === "blocked" && <span className="badge stop">Blocked</span>}
                          {change && <span style={{ marginLeft: 6 }}><StateBadge state={change.state} /></span>}
                        </td>
                        <td>{e.currentOwner || <span className="notstated">unassigned</span>}</td>
                        <td>{e.blockedReason || "—"}</td>
                        <td>{e.addedBy}</td>
                        <td>{new Date(e.addedAt).toLocaleDateString("en-GB")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <ApiNote endpoint="GET /delivery-queue" />
            </section>
          )}
        </div>
      )}
    </>
  );
}
