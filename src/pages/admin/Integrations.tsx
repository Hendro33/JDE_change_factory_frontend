import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { IntegrationStatus, JiraConnectionStatus, JiraIntegrationConfig, JiraSyncResult, JiraTestConnectionResult } from "../../types/domain";
import { ApiNote, Loading } from "../../components/ui";
import { saveErrorMessage } from "../../services/saveErrors";
import { JdeDiscoveryPanel } from "../../components/JdeDiscoveryPanel";

/**
 * Client-side mirror of the backend's own check (jira_gateway.
 * normalize_jira_base_url) -- the backend is what actually enforces
 * this, this is only so the mistake is caught before a round trip.
 * Returns null when the value is fine to submit (an empty string is
 * left to the existing required-field handling, not flagged here).
 */
function baseUrlIssue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Must be a full URL, e.g. https://yourcompany.atlassian.net.";
  }
  if (!/^https?:$/.test(parsed.protocol)) return "Must start with https:// (or http://).";
  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    return "Should be the site's base URL only (e.g. https://yourcompany.atlassian.net) — not a project, queue, board or issue link.";
  }
  return null;
}

export function Integrations() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[] | null>(null);
  const [jiraConfig, setJiraConfig] = useState<JiraIntegrationConfig | null>(null);
  const [jiraStatus, setJiraStatus] = useState<JiraConnectionStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<JiraTestConnectionResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<JiraSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  // Set when getJiraIntegration() 403s -- this company's Admin role is
  // required to view/edit Jira configuration (require_role("admin") on
  // the backend); jiraStatus below still loads for everyone.
  const [configAccessError, setConfigAccessError] = useState<string | null>(null);

  // Form state, only meaningful while editing.
  const [baseUrl, setBaseUrl] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [pickupStatus, setPickupStatus] = useState("");
  const [postPickupStatus, setPostPickupStatus] = useState("");
  const [jadeIdField, setJadeIdField] = useState("");
  const [requestTypeField, setRequestTypeField] = useState("");

  const load = () => {
    api.listIntegrations().then(setIntegrations);
    api
      .getJiraIntegration()
      .then((c) => {
        setConfigAccessError(null);
        setJiraConfig(c);
        setBaseUrl(c.baseUrl);
        setProjectKey(c.projectKey);
        setPickupStatus(c.pickupStatus);
        setPostPickupStatus(c.postPickupStatus);
        setJadeIdField(c.jadeIdField);
        setRequestTypeField(c.requestTypeField);
      })
      .catch((e) => {
        setJiraConfig(null);
        setConfigAccessError(
          e instanceof Error ? e.message : "Could not load the Jira configuration for this company."
        );
      });
    api.getJiraIntegrationStatus().then(setJiraStatus);
    // The credential is write-only -- there is nothing to prefill here,
    // on purpose. A blank field on save means "leave it as it is".
    setEmail("");
    setApiToken("");
  };

  useEffect(load, []);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const savedConfig = await api.updateJiraIntegration({
        baseUrl: baseUrl.trim(),
        projectKey: projectKey.trim(),
        pickupStatus: pickupStatus.trim(),
        postPickupStatus: postPickupStatus.trim(),
        jadeIdField: jadeIdField.trim(),
        requestTypeField: requestTypeField.trim(),
        expectedRevision: jiraConfig?.revision ?? 0,
      });
      // Keep the new revision even if the credential step below fails, so a
      // retry is not refused as stale.
      setJiraConfig(savedConfig);
      if (email.trim() && apiToken.trim()) {
        await api.updateJiraCredentials({ email: email.trim(), apiToken: apiToken.trim() });
      }
      setEditing(false);
      setSyncResult(null);
      setSyncError(null);
      load();
    } catch (e) {
      setSaveError(saveErrorMessage(e, "Could not save the Jira configuration."));
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testJiraConnection({
        baseUrl: baseUrl.trim(), projectKey: projectKey.trim(), email: email.trim(), apiToken: apiToken.trim(),
      });
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Could not run the connection test." });
    } finally {
      setTesting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await api.syncJiraIntegration();
      setSyncResult(result);
    } catch (e) {
      setSyncResult(null);
      setSyncError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
      load();
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      await api.disconnectJiraCredentials();
      load();
    } catch (e) {
      setDisconnectError(e instanceof Error ? e.message : "Could not disconnect.");
    } finally {
      setDisconnecting(false);
    }
  }

  const configured = !!jiraConfig && !!(jiraConfig.baseUrl && jiraConfig.projectKey && jiraConfig.pickupStatus && jiraConfig.postPickupStatus && jiraConfig.jadeIdField);
  const baseUrlError = baseUrlIssue(baseUrl);
  const canTest = !testing && !!baseUrl.trim() && !baseUrlError && !!email.trim() && !!apiToken.trim();
  const canSave = !saving && !baseUrlError;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Integrations</h1>
          <div className="sub">What is actually connected today, honestly — not a connector marketplace.</div>
        </div>
      </div>

      {!integrations ? (
        <Loading what="integration status" />
      ) : (
        <section className="panel" style={{ marginBottom: 16 }}>
          <table className="data">
            <thead><tr><th>Integration</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {integrations.map((i) => (
                <tr key={i.name}>
                  <td>{i.name}</td>
                  <td><span className={`badge ${i.connected ? "ok" : "grey"}`}>{i.connected ? "Connected" : "Not connected"}</span></td>
                  <td>{i.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ApiNote endpoint="GET /admin/integrations" />
        </section>
      )}

      <JdeDiscoveryPanel />

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Jira</h2>
          {!editing && !configAccessError && (
            <div className="btnrow" style={{ margin: 0 }}>
              <button className="btn" onClick={() => setEditing(true)}>{configured ? "Edit" : "Configure"}</button>
              {jiraStatus?.credentialsConfigured && (
                <button className="btn danger" disabled={disconnecting} onClick={disconnect}>
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              )}
            </div>
          )}
        </div>
        {configAccessError && (
          <div className="callout" style={{ marginBottom: 16 }}>
            <strong>Admin role required</strong>
            Only company Admins can view or change the Jira configuration and credential. The status below is
            visible to everyone.
          </div>
        )}
        {disconnectError && (
          <div className="callout" style={{ marginBottom: 16, borderColor: "var(--stop)" }}>
            <strong>Could not disconnect</strong>
            {disconnectError}
          </div>
        )}
        <div className="sub" style={{ marginBottom: 12 }}>
          Jira/ITSM remains responsible for intake and triage — Jade only ever picks up a ticket a human has
          already moved to the configured pickup status below, and never decides that on Jira's behalf. This
          configuration, and the credential below, belong to this customer's own engagement; a different
          customer can point at a different Jira site, project or workflow without any change here.
        </div>

        {jiraStatus && (
          <dl className="facts" style={{ marginBottom: 16 }}>
            <dt>Mode</dt>
            <dd>
              {jiraStatus.state === "live" && <span className="badge ok">Live</span>}
              {jiraStatus.state === "demo" && <span className="badge grey">Demo (simulated Jira)</span>}
              {(jiraStatus.state === "unavailable" || !jiraStatus.state) && (
                <>
                  <span className="badge stop">Unavailable</span>
                  {jiraStatus.unavailableReason && <div className="hint">{jiraStatus.unavailableReason}</div>}
                </>
              )}
            </dd>
            <dt>Credential</dt>
            <dd><span className={`badge ${jiraStatus.credentialsConfigured ? "ok" : "warn"}`}>{jiraStatus.credentialsConfigured ? "Configured" : "Not configured"}</span></dd>
            <dt>Stored as</dt>
            <dd>
              {jiraStatus.credentialStorage === "encrypted" && <span className="badge ok">Encrypted</span>}
              {jiraStatus.credentialStorage === "plaintext (legacy)" && <span className="badge warn">Plaintext (from an earlier build) — encrypted on the next restart once a key is set</span>}
              {jiraStatus.credentialStorage === "unreadable" && <span className="badge stop">Unreadable — encrypted with a key this server does not have; re-enter the token</span>}
              {(!jiraStatus.credentialStorage || jiraStatus.credentialStorage === "none") && <span className="notstated">nothing stored</span>}
            </dd>
          </dl>
        )}
        <div className="callout" style={{ marginBottom: 16 }}>
          <strong>How the token is stored</strong>
          The API token is encrypted before it is stored, with a key held only in the server's own settings,
          never in its database or backups. It is never shown again once saved, never logged, and never sent
          back to this screen.
          {jiraStatus && jiraStatus.credentialEncryptionAvailable === false && (
            <> <strong style={{ color: "var(--stop)" }}>This server has no encryption key configured, so a token cannot be saved.</strong></>
          )}
        </div>

        {!jiraConfig ? null : !editing ? (
          <dl className="facts">
            <dt>Site URL</dt><dd>{jiraConfig.baseUrl || <span className="notstated">not set</span>}</dd>
            <dt>Project key</dt><dd>{jiraConfig.projectKey || <span className="notstated">not set</span>}</dd>
            <dt>Pickup status</dt><dd>{jiraConfig.pickupStatus || <span className="notstated">not set</span>}</dd>
            <dt>Post-pickup status</dt><dd>{jiraConfig.postPickupStatus || <span className="notstated">not set</span>}</dd>
            <dt>Jade Change ID field</dt><dd>{jiraConfig.jadeIdField || <span className="notstated">not set</span>}</dd>
            <dt>Request Type field <span className="hint">(optional)</span></dt>
            <dd>{jiraConfig.requestTypeField || <span className="notstated">not captured</span>}</dd>
            <dt>Last updated</dt>
            <dd>{jiraConfig.updatedAt ? `${new Date(jiraConfig.updatedAt).toLocaleString("en-GB")} by ${jiraConfig.updatedBy}` : <span className="notstated">never configured</span>}</dd>
          </dl>
        ) : (
          <div className="stack">
            <div className="field">
              <label htmlFor="jiraBaseUrl">Jira site URL</label>
              <input id="jiraBaseUrl" type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://yourcompany.atlassian.net" />
              {baseUrlError ? (
                <span className="hint" style={{ color: "var(--stop)" }}>{baseUrlError}</span>
              ) : (
                <span className="hint">The site's base URL only, e.g. https://yourcompany.atlassian.net — not a project, queue or issue link.</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="jiraProjectKey">Project key</label>
              <input id="jiraProjectKey" type="text" value={projectKey} onChange={(e) => setProjectKey(e.target.value)} placeholder="CON" />
            </div>
            <div className="field">
              <label htmlFor="jiraEmail">Jira email</label>
              <input id="jiraEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jade-bot@yourcompany.com" />
              <span className="hint">The account the API token below belongs to.</span>
            </div>
            <div className="field">
              <label htmlFor="jiraApiToken">Jira API token</label>
              <input id="jiraApiToken" type="password" autoComplete="off" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder={jiraStatus?.credentialsConfigured ? "Leave blank to keep the current token" : "Paste your Jira API token"} />
              <span className="hint">
                Never shown again once saved. Use "Test Connection" below to verify it before saving, or after —
                both check the value currently in this field.
              </span>
            </div>
            <div className="btnrow" style={{ marginTop: -4, marginBottom: 4 }}>
              <button className="btn" disabled={!canTest} onClick={testConnection}>
                {testing ? "Testing…" : "Test Connection"}
              </button>
            </div>
            {testResult && (
              <div className="callout" style={{ borderColor: testResult.ok ? undefined : "var(--stop)" }}>
                <strong>{testResult.ok ? "Connection verified" : "Connection failed"}</strong>
                {testResult.message}
              </div>
            )}
            <div className="field">
              <label htmlFor="jiraPickupStatus">Inbound / pickup status</label>
              <input id="jiraPickupStatus" type="text" value={pickupStatus} onChange={(e) => setPickupStatus(e.target.value)} placeholder="Ready for Jade" />
              <span className="hint">Must already exist in this project's workflow — Jade only reads tickets sitting in this exact status. No new Jira status is created for this.</span>
            </div>
            <div className="field">
              <label htmlFor="jiraPostPickupStatus">Status after successful Jade pickup</label>
              <input id="jiraPostPickupStatus" type="text" value={postPickupStatus} onChange={(e) => setPostPickupStatus(e.target.value)} placeholder="Jade - In Progress" />
              <span className="hint">Must be reachable from the pickup status. Jade transitions to this only after intake has durably succeeded. Also an existing status, not a new one.</span>
            </div>
            <div className="field">
              <label htmlFor="jiraJadeIdField">Jade Change ID custom field</label>
              <input id="jiraJadeIdField" type="text" value={jadeIdField} onChange={(e) => setJadeIdField(e.target.value)} placeholder="customfield_10057" />
              <span className="hint">
                A short text field, added to the relevant screen in Jira — Jade writes its Change Request id here,
                which is also what makes a retried sync safe (it never re-posts the acceptance comment). Still
                required for "Sync now" to be available below — this pilot does not weaken that safety check.
              </span>
            </div>
            <div className="field">
              <label htmlFor="jiraRequestTypeField">Request Type custom field <span className="hint">(optional)</span></label>
              <input id="jiraRequestTypeField" type="text" value={requestTypeField} onChange={(e) => setRequestTypeField(e.target.value)} placeholder="customfield_10010" />
              <span className="hint">If set, JSM's own Request Type is imported as source context alongside Work Type and Priority — never used to decide pickup.</span>
            </div>
            <p className="hint">Saved under your signed-in name.</p>
            {saveError && (
              <div className="callout" style={{ borderColor: "var(--stop)" }}>
                <strong>Could not save</strong>
                {saveError}
              </div>
            )}
            <div className="btnrow">
              <button className="btn primary" disabled={!canSave} onClick={save}>
                {saving ? "Saving…" : "Save Jira configuration"}
              </button>
              <button className="btn" onClick={() => { setEditing(false); setTestResult(null); setSaveError(null); load(); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Driven by jiraStatus (visible to every active member), not
            jiraConfig (Admin-only) -- syncing is an everyday action for
            any non-Viewer role, not an Admin-only one, so this must not
            disappear just because this user can't see the full config. */}
        {!editing && jiraStatus?.configConfigured && (
          <div className="btnrow" style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={syncing} onClick={sync}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
        )}

        {syncError && (
          <div className="callout" style={{ marginTop: 16, borderColor: "var(--stop)" }}>
            <strong>Sync failed</strong>
            {syncError}
          </div>
        )}

        {syncResult && (
          <div className="callout" style={{ marginTop: 16 }}>
            <strong>Last sync result</strong>
            {syncResult.considered} ticket{syncResult.considered === 1 ? "" : "s"} found in the pickup status.{" "}
            {syncResult.imported.length} new Change Request{syncResult.imported.length === 1 ? "" : "s"} created.{" "}
            {syncResult.updatedInJira.length} ticket{syncResult.updatedInJira.length === 1 ? "" : "s"} moved to the post-pickup status.
            {syncResult.errors.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {syncResult.errors.map((e, i) => (
                  <li key={i}><span className="mono">{e.issueKey}</span>: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ApiNote endpoint="GET/PUT /admin/jira-integration, PUT /admin/jira-credentials, POST /admin/jira-integration/test-connection, POST /admin/jira-integration/sync" />
      </section>
    </>
  );
}
