import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { IntegrationStatus, JiraConnectionStatus, JiraIntegrationConfig, JiraSyncResult } from "../../types/domain";
import { ApiNote, Loading } from "../../components/ui";

export function Integrations() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[] | null>(null);
  const [jiraConfig, setJiraConfig] = useState<JiraIntegrationConfig | null>(null);
  const [jiraStatus, setJiraStatus] = useState<JiraConnectionStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<JiraSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Form state, only meaningful while editing.
  const [baseUrl, setBaseUrl] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [pickupStatus, setPickupStatus] = useState("");
  const [postPickupStatus, setPostPickupStatus] = useState("");
  const [jadeIdField, setJadeIdField] = useState("");
  const [requestTypeField, setRequestTypeField] = useState("");
  const [updatedBy, setUpdatedBy] = useState(() => localStorage.getItem("ciq_approver") ?? "");

  const load = () => {
    api.listIntegrations().then(setIntegrations);
    api.getJiraIntegration().then((c) => {
      setJiraConfig(c);
      setBaseUrl(c.baseUrl);
      setProjectKey(c.projectKey);
      setPickupStatus(c.pickupStatus);
      setPostPickupStatus(c.postPickupStatus);
      setJadeIdField(c.jadeIdField);
      setRequestTypeField(c.requestTypeField);
    });
    api.getJiraIntegrationStatus().then(setJiraStatus);
  };

  useEffect(load, []);

  async function save() {
    setSaving(true);
    localStorage.setItem("ciq_approver", updatedBy.trim());
    await api.updateJiraIntegration({
      baseUrl: baseUrl.trim(),
      projectKey: projectKey.trim(),
      pickupStatus: pickupStatus.trim(),
      postPickupStatus: postPickupStatus.trim(),
      jadeIdField: jadeIdField.trim(),
      requestTypeField: requestTypeField.trim(),
      updatedBy: updatedBy.trim(),
    });
    setSaving(false);
    setEditing(false);
    setSyncResult(null);
    setSyncError(null);
    load();
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

  const configured = !!jiraConfig && !!(jiraConfig.baseUrl && jiraConfig.projectKey && jiraConfig.pickupStatus && jiraConfig.postPickupStatus && jiraConfig.jadeIdField);

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

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Jira</h2>
          {!editing && <button className="btn" onClick={() => setEditing(true)}>{configured ? "Edit" : "Configure"}</button>}
        </div>
        <div className="sub" style={{ marginBottom: 12 }}>
          Jira/ITSM remains responsible for intake and triage — Jade only ever picks up a ticket a human has
          already moved to the configured pickup status below, and never decides that on Jira's behalf. This
          configuration belongs to this customer's own engagement; a different customer can point at a
          different Jira site, project or workflow without any change here.
        </div>

        {jiraStatus && (
          <dl className="facts" style={{ marginBottom: 16 }}>
            <dt>Mode</dt>
            <dd><span className={`badge ${jiraStatus.mockMode ? "grey" : "ok"}`}>{jiraStatus.mockMode ? "Mock" : "Live"}</span></dd>
            <dt>Deployment credential</dt>
            <dd><span className={`badge ${jiraStatus.credentialsConfigured ? "ok" : "warn"}`}>{jiraStatus.credentialsConfigured ? "Configured" : "Not configured"}</span></dd>
          </dl>
        )}
        <div className="callout" style={{ marginBottom: 16 }}>
          <strong>The API token is not stored here</strong>
          It is set once for the whole deployment (an environment variable on the server), not per customer or
          in this form — the same honest limitation the JD Edwards (AIS) connection has today. It is never
          returned by any endpoint. What you configure below (site, project, status names, field id) is this
          customer's own, and is stored as ordinary configuration.
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
            </div>
            <div className="field">
              <label htmlFor="jiraProjectKey">Project key</label>
              <input id="jiraProjectKey" type="text" value={projectKey} onChange={(e) => setProjectKey(e.target.value)} placeholder="CON" />
            </div>
            <div className="field">
              <label htmlFor="jiraPickupStatus">Inbound / pickup status</label>
              <input id="jiraPickupStatus" type="text" value={pickupStatus} onChange={(e) => setPickupStatus(e.target.value)} placeholder="Ready for Jade" />
              <span className="hint">Must already exist in this project's workflow — Jade only reads tickets sitting in this exact status.</span>
            </div>
            <div className="field">
              <label htmlFor="jiraPostPickupStatus">Status after successful Jade pickup</label>
              <input id="jiraPostPickupStatus" type="text" value={postPickupStatus} onChange={(e) => setPostPickupStatus(e.target.value)} placeholder="Jade - In Progress" />
              <span className="hint">Must be reachable from the pickup status. Jade transitions to this only after intake has durably succeeded.</span>
            </div>
            <div className="field">
              <label htmlFor="jiraJadeIdField">Jade Change ID custom field</label>
              <input id="jiraJadeIdField" type="text" value={jadeIdField} onChange={(e) => setJadeIdField(e.target.value)} placeholder="customfield_10057" />
              <span className="hint">A short text field, added to the relevant screen in Jira — Jade writes its Change Request id here.</span>
            </div>
            <div className="field">
              <label htmlFor="jiraRequestTypeField">Request Type custom field <span className="hint">(optional)</span></label>
              <input id="jiraRequestTypeField" type="text" value={requestTypeField} onChange={(e) => setRequestTypeField(e.target.value)} placeholder="customfield_10010" />
              <span className="hint">If set, JSM's own Request Type is imported as source context alongside Work Type and Priority — never used to decide pickup.</span>
            </div>
            <div className="field">
              <label htmlFor="jiraUpdatedBy">Your name</label>
              <input id="jiraUpdatedBy" type="text" value={updatedBy} onChange={(e) => setUpdatedBy(e.target.value)} placeholder="Every change is recorded against a person" />
            </div>
            <div className="btnrow">
              <button className="btn primary" disabled={saving || !updatedBy.trim()} onClick={save}>
                {saving ? "Saving…" : "Save Jira configuration"}
              </button>
              <button className="btn" onClick={() => { setEditing(false); load(); }}>Cancel</button>
            </div>
          </div>
        )}

        {!editing && configured && (
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

        <ApiNote endpoint="GET/PUT /admin/jira-integration, POST /admin/jira-integration/sync" />
      </section>
    </>
  );
}
