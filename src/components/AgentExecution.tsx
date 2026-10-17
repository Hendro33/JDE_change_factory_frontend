import { useEffect, useState } from "react";
import { executionApi, type ExecutionView } from "../services/executionApi";
import { saveErrorMessage } from "../services/saveErrors";
import { Loading } from "./ui";

function when(t?: string | null): string {
  if (!t) return "";
  const d = new Date(t);
  return isNaN(d.getTime()) ? t : d.toLocaleString("en-GB");
}

/**
 * Governance > Agent execution: the Admin's safety switches -- agent execution
 * for the whole customer and per capability. On by default where a route
 * exists; every switch is recorded with name and date.
 */
export function AgentExecutionSwitches() {
  const [view, setView] = useState<ExecutionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => executionApi.get().then((v) => { setView(v); setError(null); })
    .catch((e) => setError(saveErrorMessage(e, "Could not load agent execution.")));
  useEffect(() => { load(); }, []);

  async function flip(capabilityId: string, enabled: boolean) {
    setBusy(true); setError(null);
    try {
      setView(await executionApi.setSwitch(capabilityId, enabled, reason.trim()));
      setReason("");
    } catch (e) {
      setError(saveErrorMessage(e, "The switch was not changed."));
    } finally {
      setBusy(false);
    }
  }

  if (!view) return error ? <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{error}</div> : <Loading what="agent execution" />;
  return (
    <section className="panel" aria-label="Agent execution switches">
      <h2 style={{ marginTop: 0 }}>Agent execution</h2>
      <div className="sub" style={{ margin: "6px 0 12px" }}>
        Whether JADE's agents may make approved changes in this customer's DEV system. On by default where a route exists.
        Switching off holds the agents at once: an item they cannot apply may then be applied by a person, and that hand-over is
        recorded. Every switch is recorded with your name and the date.
      </div>
      {!view.configured && <div className="callout"><strong>Not set up yet</strong>Enter the DEV write user under Systems &amp; Connections › JD Edwards first.</div>}
      {error && <div className="callout" role="alert" style={{ borderColor: "var(--stop)", marginBottom: 12 }}>{error}</div>}
      <div className="field">
        <label htmlFor="switch-reason">Reason <span className="hint">(recorded with the switch; optional)</span></label>
        <input id="switch-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <table className="data" style={{ marginTop: 8 }}>
        <thead><tr><th>Scope</th><th>State</th><th>Detail</th><th /></tr></thead>
        <tbody>
          <tr>
            <td><strong>This customer (all capabilities)</strong></td>
            <td><span className={`badge ${view.agentExecutionEnabled ? "ok" : "stop"}`}>{view.agentExecutionEnabled ? "On" : "Off"}</span></td>
            <td />
            <td><button className="btn small" disabled={busy || !view.configured} onClick={() => flip("", !view.agentExecutionEnabled)}>
              {view.agentExecutionEnabled ? "Switch off" : "Switch on"}</button></td>
          </tr>
          {view.capabilities.map((c) => (
            <tr key={c.capabilityId}>
              <td><span className="mono">{c.capabilityId}</span><div className="hint">{c.title}</div></td>
              <td><span className={`badge ${c.enabled ? "ok" : "stop"}`}>{c.enabled ? "On" : "Off"}</span></td>
              <td className="hint">{c.detail}</td>
              <td><button className="btn small" disabled={busy || !view.configured} onClick={() => flip(c.capabilityId, !c.enabled)}>
                {c.enabled ? "Switch off" : "Switch on"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {view.audit.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary>Change log ({view.audit.length})</summary>
          <table className="data">
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {view.audit.map((a, i) => (
                <tr key={i}><td>{when(a.at)}</td><td>{a.actor}</td><td>{a.detail}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
