import { useEffect, useState } from "react";
import { aiApi, type AiConnection, type AiLimits, type DocumentPolicy } from "../../services/aiApi";
import { saveErrorMessage } from "../../services/saveErrors";
import { ConfirmDialog, Loading } from "../../components/ui";

const POLICY_COPY: Record<DocumentPolicy, { label: string; detail: string }> = {
  metadata_only: {
    label: "Metadata only",
    detail: "Agents see document names, types and whether they could be read — never their text. Nothing inside a " +
      "document is sent to the AI provider.",
  },
  permitted_content: {
    label: "Permitted document content",
    detail: "Agents whose Start-up Pack references documents may read the extracted text of those documents " +
      "(request attachments, assigned Knowledge Library documents), and cite it. The text is sent to the AI provider " +
      "as part of the agent run.",
  },
};

/**
 * Admin > AI Connections: this customer's own Anthropic API connection.
 * The key belongs to the customer's organisation and is entered once by
 * an Admin; individual Jade users never need an AI account.
 */
export function AiConnections() {
  const [view, setView] = useState<AiConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [policy, setPolicy] = useState<DocumentPolicy>("metadata_only");
  const [limits, setLimits] = useState<AiLimits>({ max_usd_per_run: 2, monthly_usd: 50, max_turns: 40 });
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmTest, setConfirmTest] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  function adopt(v: AiConnection) {
    setView(v);
    setModel(v.model ?? v.models[0]?.id ?? "");
    setEnabled(v.enabled ?? true);
    setPolicy(v.documentPolicy ?? "metadata_only");
    setLimits(v.limits ?? v.defaultLimits);
    setOverrides(v.activityModels ?? {});
  }

  useEffect(() => {
    aiApi.connection().then(adopt).catch((e) => setError(saveErrorMessage(e, "Could not load the AI connection.")));
  }, []);

  async function run(fn: () => Promise<AiConnection>, done: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      adopt(await fn());
      setNotice(done);
    } catch (e) {
      setError(saveErrorMessage(e, "That did not work."));
    } finally {
      setBusy(false);
    }
  }

  if (!view) return error ? <div className="badge stop">{error}</div> : <Loading what="AI connection" />;
  const lastTest = view.lastTest;
  const monthly = view.limits?.monthly_usd;

  return (
    <div className="stack" data-testid="ai-connections">
      <section className="panel">
        <h2>AI Connections</h2>
        <p style={{ marginTop: 0 }}>
          Jade's agents run on this customer's <strong>own Anthropic API key</strong>, entered here once by an Admin of
          the customer's organisation. Individual Jade users never need an AI account. This key is separate from Jade
          sign-in and from the JDE discovery account. Use an API key from the Anthropic Console (billed to the
          organisation) — a personal Claude chat subscription or chat password cannot be used and must never be entered.
        </p>
        {view.testProvider && (
          <div className="callout" style={{ borderColor: "var(--warn)" }}>
            <strong>Test provider active</strong> This backend is started with a loopback test provider
            (JADE_AI_TEST_PROVIDER_URL). Runs made now do not reach Anthropic and never count as real evidence.
          </div>
        )}
        <dl className="facts">
          <dt>Provider</dt><dd>{view.providerLabel} · runtime {view.runtimeLabel}</dd>
          <dt>Status</dt>
          <dd>
            {!view.configured ? <span className="badge warn">Not configured — agents cannot run</span>
              : !view.enabled ? <span className="badge warn">Switched off — agents cannot run</span>
                : view.credentialState !== "stored (encrypted)" ? <span className="badge stop">API key {view.credentialState}</span>
                  : view.tested ? <span className="badge ok">Configured and connection tested</span>
                    : <span className="badge info">Configured — connection not tested yet</span>}
          </dd>
          <dt>API key</dt>
          <dd>
            {view.credentialState}{view.credentialHint ? ` (ends ${view.credentialHint})` : ""}
            {view.credentialUpdatedBy && <div className="hint">set by {view.credentialUpdatedBy} on {new Date(view.credentialUpdatedAt ?? "").toLocaleString()} · key revision {view.credentialRevision}</div>}
            {view.credentialRevokedAt && !view.credentialHint && <div className="hint">revoked {new Date(view.credentialRevokedAt).toLocaleString()}</div>}
          </dd>
          <dt>Configuration</dt>
          <dd>{view.configured ? <>revision {view.revision} · saved by {view.updatedBy} on {new Date(view.updatedAt ?? "").toLocaleString()}</> : "—"}</dd>
          <dt>Last connection test</dt>
          <dd>
            {lastTest ? (
              <>
                <span className={`badge ${lastTest.outcome === "ok" ? "ok" : "stop"}`}>{lastTest.outcome === "ok" ? "Passed" : "Failed"}</span>{" "}
                {lastTest.detail}
                <div className="hint">
                  {new Date(lastTest.at).toLocaleString()} · configuration r{lastTest.connectionRevision}, key r{lastTest.credentialRevision}
                  {!view.tested && " — settings or key changed since; test again"}
                </div>
              </>
            ) : "never"}
          </dd>
          <dt>Spend this month</dt>
          <dd>USD {(view.monthSpendUsd ?? 0).toFixed(4)}{monthly !== undefined && ` of USD ${monthly} budget`} <span className="hint">(estimates from reported token usage, not an invoice)</span></dd>
        </dl>
        {!view.serverKeyConfigured && (
          <div className="badge stop">This server has no credential encryption key (JDE_CREDENTIAL_KEY); an API key cannot be stored.</div>
        )}
      </section>

      <section className="panel">
        <h2>Settings</h2>
        <p className="hint" style={{ marginTop: 0 }}>Saving never contacts Anthropic.</p>
        <div className="grid halves">
          <div>
            <div className="field">
              <label htmlFor="ai-model">Model (used by every agent of this customer)</label>
              <select id="ai-model" value={model} onChange={(e) => setModel(e.target.value)}>
                {view.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} — {m.id} (USD {m.input} / {m.output} per million input/output tokens)</option>
                ))}
              </select>
              <div className="hint">List prices from rate card {view.rateCardVersion}; used only to estimate cost.</div>
            </div>
            <div className="field">
              <label><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Agents may use this connection</label>
            </div>
          </div>
          <div>
            <div className="field">
              <label htmlFor="ai-run">Maximum per agent run (USD)</label>
              <input id="ai-run" type="number" min={0.01} step={0.5} value={limits.max_usd_per_run}
                onChange={(e) => setLimits({ ...limits, max_usd_per_run: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="ai-month">Monthly budget (USD) — agents stop when it is used up</label>
              <input id="ai-month" type="number" min={0} step={10} value={limits.monthly_usd}
                onChange={(e) => setLimits({ ...limits, monthly_usd: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="ai-turns">Maximum turns per run</label>
              <input id="ai-turns" type="number" min={1} max={100} value={limits.max_turns}
                onChange={(e) => setLimits({ ...limits, max_turns: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <div className="field" data-testid="activity-models">
          <label>Model per agent activity</label>
          <div className="hint" style={{ marginBottom: 6 }}>
            Optional. An activity without its own model uses the model above. All use this customer's one API key;
            a change applies to runs started afterwards, and a run record says when a story's model changed.
          </div>
          <table className="data">
            <tbody>
              {view.activities.map((a) => (
                <tr key={a.id}>
                  <td>{a.label}<div className="hint">{a.roles.join(", ")}{a.note ? ` — ${a.note}` : ""}</div></td>
                  <td>
                    <select aria-label={`Model for ${a.label}`} value={overrides[a.id] ?? ""}
                      onChange={(e) => {
                        const next = { ...overrides };
                        if (e.target.value) next[a.id] = e.target.value; else delete next[a.id];
                        setOverrides(next);
                      }}>
                      <option value="">Default ({model})</option>
                      {a.models.map((m) => <option key={m} value={m}>{view.models.find((x) => x.id === m)?.label ?? m} — {m}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint">
            Only models this runtime supports are offered. Evaluation: {Array.from(new Set(Object.values(view.evaluation))).join("; ")}.
          </div>
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>Documents shared with AI</legend>
          {view.documentPolicies.map((p) => (
            <label key={p} style={{ display: "block", marginBottom: 6 }}>
              <input type="radio" name="ai-policy" checked={policy === p} onChange={() => setPolicy(p)} />{" "}
              <strong>{POLICY_COPY[p].label}</strong> — <span className="hint">{POLICY_COPY[p].detail}</span>
            </label>
          ))}
        </fieldset>
        <div className="btnrow">
          <button className="btn primary" disabled={busy || !model} onClick={() => run(() => aiApi.saveConnection({
            model, enabled, documentPolicy: policy, limits, activityModels: overrides, expectedRevision: view.revision ?? null,
          }), "Settings saved.")}>Save settings</button>
        </div>
      </section>

      <section className="panel">
        <h2>API key</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Write-only: it is encrypted on the server and never shown again, not even to Admins. Replacing it starts a new
          key revision; revoking it stops all agents of this customer at once.
        </p>
        <div className="field">
          <label htmlFor="ai-key">{view.credentialHint ? "Replace the API key" : "Anthropic API key"}</label>
          <input id="ai-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-api03-…" disabled={!view.configured} />
          {!view.configured && <div className="hint">Save the settings first.</div>}
        </div>
        <div className="btnrow">
          <button className="btn primary" disabled={busy || !key.trim() || !view.configured}
            onClick={() => run(async () => { const v = await aiApi.saveKey(key.trim()); setKey(""); return v; }, "API key stored.")}>
            Save key
          </button>
          <button className="btn" disabled={busy || !view.credentialHint} onClick={() => setConfirmRevoke(true)}>Revoke key</button>
          <button className="btn" disabled={busy || !view.credentialHint || !view.enabled} onClick={() => setConfirmTest(true)}>Test connection…</button>
        </div>
      </section>

      {notice && <div className="badge ok" role="status">{notice}</div>}
      {error && <div className="badge stop" role="alert">{error}</div>}

      <section className="panel">
        <h2>History</h2>
        {view.audit.length === 0 ? <p className="hint">No changes yet.</p> : (
          <table className="data">
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {view.audit.map((a, i) => (
                <tr key={i}><td>{new Date(a.at).toLocaleString()}</td><td>{a.actor}</td><td>{a.action.replace(/_/g, " ")}<div className="hint">{a.detail}</div></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {confirmTest && (
        <ConfirmDialog
          title="Test the AI connection?"
          confirmLabel="Send the billable test"
          onCancel={() => setConfirmTest(false)}
          requireNote={false}
          intro={<p>{view.testExplanation}</p>}
          whatHappensNext={`Model ${view.model}. Nothing else is sent; the result is recorded in the history below.`}
          onConfirm={() => {
            setConfirmTest(false);
            setBusy(true); setError(null); setNotice(null);
            aiApi.test().then((r) => {
              adopt(r.connection);
              if (r.outcome === "ok") setNotice(`Connection works: ${r.detail}`);
              else setError(`Connection test failed: ${r.detail}`);
            }).catch((e) => setError(saveErrorMessage(e, "The test could not be run."))).finally(() => setBusy(false));
          }}
        />
      )}
      {confirmRevoke && (
        <ConfirmDialog
          title="Revoke the API key?"
          confirmLabel="Revoke"
          onCancel={() => setConfirmRevoke(false)}
          tone="danger"
          requireNote={false}
          intro={<p>All agent runs for this customer stop until a new key is entered.</p>}
          whatHappensNext="Also revoke the key in the Anthropic Console if it may have been exposed."
          onConfirm={() => { setConfirmRevoke(false); run(() => aiApi.revokeKey(), "API key revoked; agents of this customer are blocked."); }}
        />
      )}
    </div>
  );
}
