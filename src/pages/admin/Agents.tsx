import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { AgentDefinition, AgentHealth } from "../../types/domain";
import { ApiNote, Loading, NotStated } from "../../components/ui";

const STAGE_TONE: Record<string, string> = { started: "info", done: "ok", failed: "stop" };

export function Agents() {
  const [agents, setAgents] = useState<AgentDefinition[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [health, setHealth] = useState<AgentHealth | null>(null);

  useEffect(() => {
    api.listAgents().then((list) => {
      setAgents(list);
      setSelected((cur) => cur ?? list[0]?.name ?? null);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setHealth(null);
    api.getAgentHealth(selected).then(setHealth);
  }, [selected]);

  const open = agents?.find((a) => a.name === selected) ?? null;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Agents</h1>
          <div className="sub">
            The five subagent definitions, parsed live from .claude/agents/*.md, plus each one's
            recent runs and human feedback — visibility only. Editing an agent's instructions
            happens through the normal code-review and deploy process, not here.
          </div>
        </div>
      </div>

      {!agents ? (
        <Loading what="the agent registry" />
      ) : (
        <div className="detailgrid">
          <section className="panel">
            <h2>Definitions</h2>
            <table className="data">
              <thead><tr><th>Name</th><th>Driver</th><th>Version</th></tr></thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.name} className="clickable" onClick={() => setSelected(a.name)}
                    style={a.name === selected ? { background: "var(--wash)" } : undefined}>
                    <td>{a.name}</td>
                    <td>{a.runtime?.driver ?? <NotStated />}</td>
                    <td className="mono">{a.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ApiNote endpoint="GET /admin/agents" />
          </section>

          {open && (
            <div className="stack">
              <section className="panel">
                <h2>{open.name}</h2>
                <p style={{ marginTop: 0 }}>{open.description}</p>
                <dl className="facts">
                  <dt>Version</dt><dd className="mono">{open.version}</dd>
                  <dt>File updated</dt><dd>{new Date(open.fileUpdatedAt).toLocaleString("en-GB")}</dd>
                  <dt>Declared tools</dt>
                  <dd>{open.declaredTools.length ? open.declaredTools.join(", ") : <span className="notstated">none — purely structural</span>}</dd>
                </dl>

                {open.runtime ? (
                  <>
                    <h2 style={{ marginTop: 20 }}>Runtime configuration <span className="qualifier">— {open.runtime.driver}</span></h2>
                    <dl className="facts">
                      <dt>Model</dt>
                      <dd>{open.runtime.model ?? <span className="notstated">not set — falls to the SDK's own default</span>}</dd>
                      <dt>Permission mode</dt><dd className="mono">{open.runtime.permissionMode}</dd>
                      <dt>Max turns</dt><dd>{open.runtime.maxTurns}</dd>
                      <dt>Allowed tools (driver session)</dt><dd>{open.runtime.allowedTools.join(", ")}</dd>
                    </dl>
                  </>
                ) : (
                  <div className="callout" style={{ marginTop: 16 }}>
                    <strong>No driver wiring today</strong>
                    No api_service driver invokes this agent yet — it is still run directly via Claude
                    Code, not orchestrated from this service.
                  </div>
                )}
              </section>

              <section className="panel">
                <h2>Health <span className="qualifier">— last 20 runs, across all customers</span></h2>
                {!health ? (
                  <Loading what="agent health" />
                ) : (
                  <>
                    <div className="btnrow" style={{ marginBottom: 12 }}>
                      {Object.entries(health.runCounts).length === 0 ? (
                        <span className="notstated">No recorded runs yet</span>
                      ) : (
                        Object.entries(health.runCounts).map(([stage, count]) => (
                          <span key={stage} className={`badge ${STAGE_TONE[stage] ?? "grey"}`}>{stage}: {count}</span>
                        ))
                      )}
                    </div>
                    {health.recentRuns.length > 0 && (
                      <table className="data">
                        <thead><tr><th>Story</th><th>Stage</th><th>Started</th><th>Error</th></tr></thead>
                        <tbody>
                          {health.recentRuns.map((r) => (
                            <tr key={r.runId}>
                              <td className="mono">{r.storyId}</td>
                              <td><span className={`badge ${STAGE_TONE[r.stage] ?? "grey"}`}>{r.stage}</span></td>
                              <td>{new Date(r.startedAt).toLocaleString("en-GB")}</td>
                              <td>{r.error ?? <NotStated />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {health.feedback.length > 0 && (
                      <>
                        <h2 style={{ marginTop: 20 }}>Feedback <span className="qualifier">— this customer only</span></h2>
                        {health.feedback.map((f) => (
                          <div key={f.kind} className="callout" style={{ marginBottom: 10 }}>
                            <strong>{f.kind.replace(/_/g, " ")} — {f.count}</strong>
                            {Object.keys(f.reasons).length > 0
                              ? Object.entries(f.reasons).map(([reason, n]) => `${reason.replace(/_/g, " ")}: ${n}`).join(", ")
                              : "No structured reason recorded"}
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
                <ApiNote endpoint="GET /admin/agents/{name}/health" />
              </section>
            </div>
          )}
        </div>
      )}
    </>
  );
}
