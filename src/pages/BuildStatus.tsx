import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Change, LifecycleState } from "../types/domain";
import { ApiNote, Loading, PriorityBadge, StateBadge, stateLabel } from "../components/ui";

/** The build half of the lifecycle, in order. */
const BUILD_STATES: LifecycleState[] = [
  "APPROVED", "ARCHITECTING", "SPEC_READY", "CHANGE_APPROVED",
  "EXECUTING", "TESTING", "VALIDATED", "CNC_HANDOFF", "CLOSED",
];

export function BuildStatus({ onOpenChange }: { onOpenChange: (id: string) => void }) {
  const [changes, setChanges] = useState<Change[] | null>(null);

  useEffect(() => {
    api.listChanges().then((all) =>
      setChanges(all.filter((c) => BUILD_STATES.includes(c.state) || c.state === "RESOLVED_WITHOUT_CHANGE"))
    );
  }, []);

  const countIn = (s: LifecycleState) => changes?.filter((c) => c.state === s).length ?? 0;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Build status</h1>
          <div className="sub">
            Approved changes, and exactly how far each one has actually got.
          </div>
        </div>
        <div className="meta">{changes?.length ?? 0} in flight</div>
      </div>

      {!changes ? <Loading what="build status" /> : (
        <div className="stack">
          <section className="panel">
            <h2>Where everything sits</h2>
            <div style={{ display: "flex", gap: 0, flexWrap: "wrap", alignItems: "stretch" }}>
              {BUILD_STATES.map((s, i) => {
                const n = countIn(s);
                return (
                  <div key={s} style={{ display: "contents" }}>
                    <div style={{
                      border: "1px solid var(--line-strong)",
                      background: n > 0 ? "var(--brand)" : "var(--panel)",
                      padding: "10px 14px", minWidth: 104, textAlign: "center",
                    }}>
                      <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.1 }}>{n}</div>
                      <div style={{ fontSize: 11.5, color: n > 0 ? "var(--ink)" : "var(--muted)" }}>
                        {stateLabel(s)}
                      </div>
                    </div>
                    {i < BUILD_STATES.length - 1 && (
                      <div style={{ alignSelf: "center", padding: "0 6px", color: "var(--line-strong)" }}>→</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <h2>Changes in build</h2>
            {changes.length === 0 ? (
              <div className="empty">
                Nothing in build. Approved changes appear here once the Architect picks them up.
              </div>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Change</th><th>Description</th><th>Route</th>
                    <th>Exact change approved</th><th>Test</th><th>Status</th><th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => onOpenChange(c.id)}>
                      <td className="mono">{c.id}</td>
                      <td>{c.title}</td>
                      <td>{c.architectDecision?.recommendedRoute ?? <span className="notstated">not decided</span>}</td>
                      <td>
                        {c.changeApproval?.status === "approved"
                          ? <span className="badge ok">Approved</span>
                          : c.exactChange
                            ? <span className="badge warn">Waiting on you</span>
                            : <span className="badge grey">Not proposed</span>}
                      </td>
                      <td>
                        {c.testResult?.outcome === "pass" ? <span className="badge ok">Passed</span>
                          : c.testResult?.outcome === "fail" ? <span className="badge stop">Failed</span>
                          : <span className="badge grey">Not run</span>}
                      </td>
                      <td><StateBadge state={c.state} /></td>
                      <td><PriorityBadge priority={c.priority} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <ApiNote endpoint="GET /changes · GET /changes/{id}/implementation" />
          </section>
        </div>
      )}
    </>
  );
}
