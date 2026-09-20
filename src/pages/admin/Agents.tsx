import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { AgentDefinition, AgentHealth } from "../../types/domain";
import { Loading, NotStated } from "../../components/ui";

const STAGE_TONE: Record<string, string> = { started: "info", done: "ok", failed: "stop" };

/** The agent's own stated role, e.g. "System Analyst / Architect Agent" from its description's first sentence. */
function roleLine(description: string): string {
  return description.split(".")[0];
}

export function Agents() {
  const [agents, setAgents] = useState<AgentDefinition[] | null>(null);
  const [healthByAgent, setHealthByAgent] = useState<Record<string, AgentHealth>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.listAgents().then(async (list) => {
      setAgents(list);
      setSelected((cur) => cur ?? list[0]?.name ?? null);
      // Every card needs its own real health snapshot, not just the
      // selected agent's — this is the "team dashboard" the roster
      // itself has to show, not a byproduct of clicking through.
      const pairs = await Promise.all(list.map(async (a) => [a.name, await api.getAgentHealth(a.name)] as const));
      setHealthByAgent(Object.fromEntries(pairs));
    });
  }, []);

  const open = agents?.find((a) => a.name === selected) ?? null;
  const openHealth = open ? healthByAgent[open.name] : undefined;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Agents</h1>
          <div className="sub">
            The AI team — five subagents, parsed live from .claude/agents/*.md, with the real
            activity and feedback Jade has captured for each. Editing an agent's instructions
            happens through the normal code-review and deploy process, not here.
          </div>
        </div>
      </div>

      {!agents ? (
        <Loading what="the agent registry" />
      ) : (
        <div className="stack">
          <div className="agentgrid">
            {agents.map((a) => {
              const h = healthByAgent[a.name];
              const totalRuns = h ? Object.values(h.runCounts).reduce((n, c) => n + c, 0) : undefined;
              const lastRun = h?.recentRuns[0];
              const feedbackTotal = h?.feedback.reduce((n, f) => n + f.count, 0) ?? 0;
              return (
                <button
                  key={a.name}
                  className={`agentcard${a.name === selected ? " selected" : ""}`}
                  onClick={() => setSelected(a.name)}
                >
                  <div className="agentcard-name">{a.name}</div>
                  <div className="agentcard-role">{roleLine(a.description)}</div>
                  <div className="agentcard-stats">
                    {h === undefined ? (
                      <span className="notstated">loading…</span>
                    ) : totalRuns === 0 ? (
                      <span className="notstated">No recorded runs yet</span>
                    ) : (
                      <>
                        {Object.entries(h.runCounts).map(([stage, count]) => (
                          <span key={stage} className={`badge ${STAGE_TONE[stage] ?? "grey"}`}>{stage}: {count}</span>
                        ))}
                      </>
                    )}
                  </div>
                  <div className="agentcard-meta">
                    {lastRun
                      ? `Last activity ${new Date(lastRun.startedAt).toLocaleDateString("en-GB")}`
                      : "No activity yet"}
                    {feedbackTotal > 0 && ` · ${feedbackTotal} feedback record${feedbackTotal === 1 ? "" : "s"}`}
                  </div>
                </button>
              );
            })}
          </div>

          {open && (
            <div className="grid halves">
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
                <h2>Activity &amp; quality <span className="qualifier">— last 20 runs, across all customers</span></h2>
                {!openHealth ? (
                  <Loading what="agent activity" />
                ) : (
                  <>
                    {openHealth.recentRuns.length > 0 && (
                      <table className="data">
                        <thead><tr><th>Story</th><th>Stage</th><th>Started</th><th>Error</th></tr></thead>
                        <tbody>
                          {openHealth.recentRuns.map((r) => (
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
                    {openHealth.feedback.length > 0 && (
                      <>
                        <h2 style={{ marginTop: 20 }}>Feedback <span className="qualifier">— this customer only</span></h2>
                        {openHealth.feedback.map((f) => (
                          <div key={f.kind} className="callout" style={{ marginBottom: 10 }}>
                            <strong>{f.kind.replace(/_/g, " ")} — {f.count}</strong>
                            {Object.keys(f.reasons).length > 0
                              ? Object.entries(f.reasons).map(([reason, n]) => `${reason.replace(/_/g, " ")}: ${n}`).join(", ")
                              : "No structured reason recorded"}
                          </div>
                        ))}
                      </>
                    )}
                    {openHealth.recentRuns.length === 0 && openHealth.feedback.length === 0 && (
                      <div className="empty" style={{ padding: 16 }}>No recorded activity yet for this agent.</div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </>
  );
}
