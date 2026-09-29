import { useEffect, useState } from "react";
import { executionApi, type ExecutionConfig, type ExecutionView } from "../services/executionApi";
import { saveErrorMessage } from "../services/saveErrors";
import { CertificateEditor } from "./JdeDiscoveryPanel";
import { Loading } from "./ui";

const tone: Record<string, string> = { ok: "ok", failed: "stop", unknown: "grey", stale: "warn" };
const CHECK_LABEL: Record<string, string> = {
  ais_write_sign_in: "DEV write user signs in to AIS",
  web_client: "DEV write user signs in to the web client",
};

function blank(): ExecutionConfig {
  return { webClientUrl: "", webOmwUrl: "", webCaCertificateSha256: "", writeRole: "", notes: "" };
}

function when(t?: string | null): string {
  if (!t) return "";
  const d = new Date(t);
  return isNaN(d.getTime()) ? t : d.toLocaleString("en-GB");
}

/**
 * Administration > Systems & Connections > JD Edwards > Agent execution: how
 * JADE's agents make approved changes in this customer's DEV system -- the web
 * client and Web OMW, and the dedicated DEV write user (separate from the
 * read-only discovery user). Save, then Test; the password is never shown again.
 */
export function AgentExecutionPanel() {
  const [view, setView] = useState<ExecutionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ExecutionConfig>(blank());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: string; text: string } | null>(null);

  const load = () => {
    executionApi.get().then((v) => { setView(v); setForm(v.config ?? blank()); setLoadError(null); })
      .catch((e) => setLoadError(saveErrorMessage(e, "Could not load agent execution.")));
  };
  useEffect(load, []);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(true); setMessage(null);
    try {
      setMessage({ tone: "ok", text: `${label}: ${await fn()}` });
      load();
    } catch (e) {
      setMessage({ tone: "stop", text: `${label}: ${saveErrorMessage(e, "failed")}` });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <section className="panel">
        <h2>Agent execution</h2>
        <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}><strong>Could not load</strong>{loadError}</div>
      </section>
    );
  }
  if (!view) return <Loading what="agent execution" />;
  const set = <K extends keyof ExecutionConfig>(k: K, v: ExecutionConfig[K]) => setForm({ ...form, [k]: v });

  return (
    <section className="panel" aria-label="Agent execution">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Agent execution</h2>
        {!editing && <button className="btn" onClick={() => setEditing(true)}>{view.configured ? "Edit" : "Set up"}</button>}
      </div>
      <div className="sub" style={{ margin: "6px 0 12px" }}>
        JADE's agents make the approved changes in DEV themselves: through AIS form requests, or in the JD Edwards web client
        (an agent-driven browser on JADE's server, with a screenshot of every step). They sign in as a dedicated DEV write
        user, separate from the read-only discovery user above. Every item is read before and after the change; anything that
        does not match stops for reconciliation. A person does only what JD Edwards cannot accommodate through either route.
      </div>
      {message && <div className="callout" role="status" style={{ marginBottom: 12, borderColor: message.tone === "stop" ? "var(--stop)" : undefined }}>{message.text}</div>}

      <dl className="facts">
        <dt>AIS server</dt><dd className="mono">{view.connection.aisBaseUrl || <span className="notstated">not saved (JD Edwards connection above)</span>}</dd>
        <dt>Environment · path code</dt><dd className="mono">{view.connection.environment || "—"} · {view.connection.pathCode || "—"}</dd>
        <dt>Read-only discovery user</dt><dd className="mono">{view.connection.discoveryUserMasked || "—"} ({view.connection.discoveryRole || "—"}){view.connection.discoveryEnabled ? "" : " — discovery not enabled"}</dd>
        <dt>Web client</dt><dd className="mono">{view.config.webClientUrl || <span className="notstated">not saved</span>}</dd>
        {view.config.webOmwUrl && <><dt>Web OMW</dt><dd className="mono">{view.config.webOmwUrl}</dd></>}
        <dt>DEV write user</dt>
        <dd>
          {view.writeUserConfigured
            ? <><span className="mono">{view.writeUserMasked}</span> · role <span className="mono">{view.config.writeRole || view.connection.discoveryRole}</span> · <span className={`badge ${view.writeUserStorage === "encrypted" ? "ok" : "stop"}`}>{view.writeUserStorage}</span></>
            : <span className="notstated">not saved</span>}
        </dd>
        <dt>Agent execution</dt>
        <dd><span className={`badge ${view.agentExecutionEnabled ? "ok" : "stop"}`}>{view.agentExecutionEnabled ? "On" : "Switched off"}</span> <span className="hint">(switches: Governance › Agent execution)</span></dd>
      </dl>

      {editing && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="exec-web">JD Edwards web client address</label>
            <input id="exec-web" type="url" placeholder="https://jde-dev.customer.example/jde" value={form.webClientUrl} onChange={(e) => set("webClientUrl", e.target.value)} />
            <span className="hint">The HTML server of the DEV environment. The agents' browser can reach only this address (and Web OMW).</span>
          </div>
          <div className="field">
            <label htmlFor="exec-omw">Web OMW address <span className="hint">(only when it is served from another address)</span></label>
            <input id="exec-omw" type="url" value={form.webOmwUrl} onChange={(e) => set("webOmwUrl", e.target.value)} />
          </div>
          <CertificateEditor label="Web client certificate" selected={form.webCaCertificateSha256} aisUrl={form.webClientUrl}
            onSelect={(sha) => set("webCaCertificateSha256", sha)} />
          <div className="field">
            <label htmlFor="exec-role">DEV write role</label>
            <input id="exec-role" type="text" value={form.writeRole} onChange={(e) => set("writeRole", e.target.value)} />
            <span className="hint">The write user's own DEV role — never *ALL. It should allow exactly the configuration the customer's scope allows.</span>
          </div>
          <div className="field">
            <label htmlFor="exec-notes">Notes <span className="hint">(optional)</span></label>
            <textarea id="exec-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="btnrow">
            <button className="btn primary" disabled={busy} onClick={() => run("Settings", async () => {
              await executionApi.save(form, view.configured ? view.revision : null);
              setEditing(false);
              return "saved (test them again before the agents continue)";
            })}>Save settings</button>
            <button className="btn" disabled={busy} onClick={() => { setForm(view.config); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      )}

      {view.configured && (
        <div className="callout" style={{ marginTop: 12 }}>
          <strong>DEV write user</strong>
          A dedicated JD Edwards user for the agents' changes in DEV. The password is encrypted on the server and never shown again.
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="field">
              <label htmlFor="exec-user">User</label>
              <input id="exec-user" type="text" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="exec-password">Password</label>
              <input id="exec-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="btnrow">
              <button className="btn" disabled={busy || !username.trim() || !password} onClick={() => run("DEV write user", async () => {
                await executionApi.saveWriteUser(username.trim(), password, view.revision);
                setPassword("");
                return "saved (encrypted); test the settings";
              })}>Save write user</button>
            </div>
          </div>
        </div>
      )}

      {view.configured && (
        <div style={{ marginTop: 12 }}>
          <div className="btnrow">
            <button className="btn primary" disabled={busy} onClick={() => run("Test", async () => {
              const r = await executionApi.test();
              return Object.entries(r.results).map(([k, v]) => `${CHECK_LABEL[k] ?? k}: ${v.state}${v.detail ? ` — ${v.detail}` : ""}`).join("; ");
            })}>{busy ? "Testing…" : "Test"}</button>
          </div>
          <span className="hint">Signs the write user in to AIS and to the web client, and signs out. Nothing is changed in JD Edwards.</span>
          <table className="data" style={{ marginTop: 8 }}>
            <thead><tr><th>Check</th><th>State</th><th>Detail</th></tr></thead>
            <tbody>
              {Object.entries(view.checks).map(([k, c]) => (
                <tr key={k}>
                  <td>{CHECK_LABEL[k] ?? k}</td>
                  <td><span className={`badge ${tone[c.state] ?? "grey"}`}>{c.state}</span></td>
                  <td>{c.detail}{(c.checkedAt ?? c.checked_at) && <div className="hint">{when(c.checkedAt ?? c.checked_at)}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <table className="data" style={{ marginTop: 12 }} aria-label="Agent routes">
        <thead><tr><th>Route</th><th>Ready now</th><th>Detail</th></tr></thead>
        <tbody>
          {(["ais", "browser"] as const).map((r) => (
            <tr key={r}>
              <td>{view.routes[r]?.label}</td>
              <td><span className={`badge ${view.routes[r]?.ready ? "ok" : "grey"}`}>{view.routes[r]?.ready ? "Ready" : "Not ready"}</span></td>
              <td>{view.routes[r]?.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!view.browserAvailable && <div className="hint">Browser on this server: {view.browserDetail}</div>}
    </section>
  );
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
