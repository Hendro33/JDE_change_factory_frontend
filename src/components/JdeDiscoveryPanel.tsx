import { useEffect, useState } from "react";
import {
  discoveryApi,
  fileToBase64,
  HEALTH_CHECKS,
  type ActivityRow,
  type ApprovedRead,
  type ArtifactUploadInput,
  type ArtifactView,
  type CheckResult,
  type DataSharingPolicy,
  type ExportFormat,
  type JdeProfileConfig,
  type JdeProfileView,
  type RuntimeCorrespondence,
} from "../services/discoveryApi";
import { saveErrorMessage } from "../services/saveErrors";
import { ApiNote, Loading } from "./ui";

const tone: Record<string, string> = { ok: "ok", failed: "stop", unknown: "grey", stale: "warn" };

function blankConfig(): JdeProfileConfig {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return {
    connectionMode: "simulation", aisBaseUrl: "https://", environment: "", environmentType: "DEV", role: "",
    expectedApplicationRelease: "", expectedToolsRelease: "", pathCode: "", authMethod: "ais_token_request",
    customerContact: "", cncContact: "", networkRoute: "", isolationEvidence: "", routingIsolationConfirmed: false,
    privilegeStatement: "", privilegeConfirmed: false, approvedReads: [],
    discoveryWindow: { startsAt: start.toISOString(), endsAt: end.toISOString() },
    limits: { maxRecords: 10, timeoutSeconds: 15, concurrentRequests: 1 }, dataSharingPolicy: "metadata_only",
  };
}

const split = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

/** One line per read: capability; targets; fields; filter fields (lists comma-separated).
 * ";" separates the columns because a target may itself contain "|" (application|version). */
function readsToText(reads: ApprovedRead[]): string {
  return reads.map((r) => [r.capabilityId, r.targets.join(","), r.fields.join(","), r.filterFields.join(",")].join("; ")).join("\n");
}

function readsFromText(text: string): ApprovedRead[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [capabilityId = "", targets = "", fields = "", filterFields = ""] = line.split(";");
    return { capabilityId: capabilityId.trim(), targets: split(targets), fields: split(fields), filterFields: split(filterFields) };
  });
}

function Check({ result }: { result?: CheckResult }) {
  const r = result ?? { state: "unknown", detail: "" };
  return (
    <>
      <span className={`badge ${tone[r.state] ?? "grey"}`}>{r.state}</span>{" "}
      {r.checkedAt && <span className="hint">{new Date(r.checkedAt).toLocaleString("en-GB")}</span>}
      {r.detail && <div className="hint">{r.detail}</div>}
    </>
  );
}

/**
 * Admin > Integrations > JDE: the company's read-only discovery connection
 * for the Architect. Saving never contacts JDE. Test Connection, the
 * approved sample read, Enable and Disable are explicit actions.
 */
export function JdeDiscoveryPanel() {
  const [view, setView] = useState<JdeProfileView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<JdeProfileConfig>(blankConfig());
  const [readsText, setReadsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: string; text: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sampleCapability, setSampleCapability] = useState("");
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);

  const load = () => {
    discoveryApi.getProfile().then((v) => {
      setView(v);
      setLoadError(null);
      const cfg = v.config ?? blankConfig();
      setForm(cfg);
      setReadsText(readsToText(cfg.approvedReads));
      setSampleCapability(cfg.approvedReads[0]?.capabilityId ?? "");
    }).catch((e) => setLoadError(saveErrorMessage(e, "Could not load the JDE discovery profile.")));
    discoveryApi.activity().then(setActivity).catch(() => setActivity(null));
  };
  useEffect(load, []);

  async function run(label: string, fn: () => Promise<{ outcome?: string; detail?: string; profile?: JdeProfileView } | JdeProfileView>) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fn();
      if ("outcome" in r && r.outcome !== undefined) {
        setMessage({ tone: r.outcome === "ok" ? "ok" : "stop", text: `${label}: ${r.outcome}${r.detail ? ` — ${r.detail}` : ""}` });
      } else {
        setMessage({ tone: "ok", text: `${label}: done` });
      }
      load();
    } catch (e) {
      setMessage({ tone: "stop", text: `${label}: ${saveErrorMessage(e, "failed")}` });
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof JdeProfileConfig>(k: K, v: JdeProfileConfig[K]) => setForm({ ...form, [k]: v });

  if (loadError) {
    return (
      <section className="panel">
        <h2>JDE — Architect environment discovery</h2>
        <div className="callout">{loadError}</div>
      </section>
    );
  }
  if (!view) return <Loading what="the JDE discovery profile" />;
  const cfg = view.config;

  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>JDE — Architect environment discovery</h2>
        {!editing && <button className="btn" onClick={() => setEditing(true)}>{view.configured ? "Edit profile" : "Set up"}</button>}
      </div>
      <div className="sub" style={{ margin: "6px 0 12px" }}>
        Read-only access the Architect uses to research this company's DEV installation. Separate from any future
        execution credentials. Jade's read-only settings do not make an over-privileged JDE account safe: the
        customer's JDE role and network controls must restrict it too.
      </div>

      {view.configured && cfg && (
        <div className="stack">
          <div>
            <span className={`badge ${cfg.connectionMode === "simulation" ? "warn" : "ok"}`}>{view.modeLabel}</span>{" "}
            <span className={`badge ${view.discoveryEnabled ? "ok" : "grey"}`}>
              {view.discoveryEnabled ? "Discovery enabled" : view.disabled ? "Connection disabled" : "Discovery off"}
            </span>{" "}
            <span className="hint">Profile revision {view.revision}, saved by {view.updatedBy}</span>
          </div>
          <dl className="facts">
            <dt>AIS endpoint</dt><dd className="mono">{cfg.aisBaseUrl}</dd>
            <dt>Environment / role</dt><dd className="mono">{cfg.environment} ({cfg.environmentType}) / {cfg.role}</dd>
            <dt>Expected releases</dt><dd>Application {cfg.expectedApplicationRelease}, Tools {cfg.expectedToolsRelease}, path code <span className="mono">{cfg.pathCode}</span></dd>
            <dt>Credential</dt>
            <dd>{view.credentialConfigured ? <>{view.credentialUsernameMasked} <span className="badge grey">{view.credentialStorage}</span></> : <span className="notstated">none saved</span>}</dd>
            <dt>Customer / CNC</dt><dd>{cfg.customerContact || "—"} / {cfg.cncContact || "—"}</dd>
            <dt>Network route</dt><dd>{cfg.networkRoute || <span className="notstated">not stated</span>}</dd>
            <dt>Routing & isolation</dt><dd>{cfg.routingIsolationConfirmed ? "Confirmed by customer" : <span className="badge warn">not confirmed</span>} <span className="hint">{cfg.isolationEvidence}</span></dd>
            <dt>Least privilege</dt><dd>{cfg.privilegeConfirmed ? "Confirmed by customer" : <span className="badge warn">not confirmed</span>} <span className="hint">{cfg.privilegeStatement}</span></dd>
            <dt>Window</dt><dd>{cfg.discoveryWindow ? `${new Date(cfg.discoveryWindow.startsAt).toLocaleString("en-GB")} – ${new Date(cfg.discoveryWindow.endsAt).toLocaleString("en-GB")}` : "none"}</dd>
            <dt>Limits</dt><dd>{cfg.limits.maxRecords} records per query, one request at a time, {cfg.limits.timeoutSeconds}s timeout, no paging or retries</dd>
            <dt>Data sharing with the model</dt><dd>{cfg.dataSharingPolicy.replace(/_/g, " ")}</dd>
          </dl>

          <div>
            <strong>Connection health</strong> <span className="hint">(manual checks; no background polling)</span>
            <table className="data">
              <tbody>
                {HEALTH_CHECKS.map(({ key, label }) => (
                  <tr key={key}><td>{label}</td><td><Check result={view.health[key]} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="btnrow" style={{ flexWrap: "wrap" }}>
            <button className="btn" disabled={busy} onClick={() => run("Test Connection", discoveryApi.testConnection)}>Test Connection</button>
            <select value={sampleCapability} onChange={(e) => setSampleCapability(e.target.value)} aria-label="Capability for the sample read">
              {cfg.approvedReads.map((r) => <option key={r.capabilityId} value={r.capabilityId}>{r.capabilityId}</option>)}
            </select>
            <button className="btn" disabled={busy || !sampleCapability} onClick={() => run("Approved sample read", () => discoveryApi.sampleRead(sampleCapability))}>Run Approved Sample Read</button>
            <button className="btn primary" disabled={busy || view.enableBlockers.length > 0 || view.discoveryEnabled} onClick={() => run("Enable Discovery", () => discoveryApi.enable(view.revision))}>Enable Discovery</button>
            <button className="btn" disabled={busy || view.disabled} onClick={() => run("Disable Connection", discoveryApi.disable)}>Disable Connection</button>
          </div>
          {view.enableBlockers.length > 0 && !view.discoveryEnabled && (
            <div className="callout">
              <strong>Discovery cannot be enabled yet</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{view.enableBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}

          <div>
            <strong>Discovery capabilities</strong>
            <table className="data">
              <thead><tr><th>Capability</th><th>Status</th><th>Approved scope</th></tr></thead>
              <tbody>
                {view.capabilities.map((c) => (
                  <tr key={c.capabilityId}>
                    <td>{c.title}<div className="hint mono">{c.capabilityId}</div></td>
                    <td>
                      <span className={`badge ${c.status === "supported" ? "ok" : c.status === "unavailable" ? "grey" : "warn"}`}>{c.status}</span>
                      <div className="hint">{c.statusDetail}</div>
                      {c.alternative && <div className="hint">{c.alternative}</div>}
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {c.approved ? <>
                        {c.approvedTargets.join(", ") || "—"}
                        {c.approvedFields.length > 0 && <div>fields: {c.approvedFields.join(", ")}</div>}
                        {c.approvedFilterFields.length > 0 && <div>filters: {c.approvedFilterFields.join(", ")}</div>}
                      </> : <span className="notstated">not approved</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <strong>Credential</strong> <span className="hint">(write-only; a new credential needs re-verification)</span>
            <div className="grid halves">
              <input type="text" autoComplete="off" placeholder="JDE user" value={username} onChange={(e) => setUsername(e.target.value)} aria-label="JDE user" />
              <input type="password" autoComplete="new-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="JDE password" />
            </div>
            <button className="btn" style={{ marginTop: 6 }} disabled={busy || !username || !password}
              onClick={() => run("Save credential", async () => {
                const r = await discoveryApi.saveCredential(username, password, view.revision);
                setPassword("");
                return r;
              })}>Save credential</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="stack" style={{ marginTop: 16 }}>
          <p className="hint">Saving stores a new profile revision and does not contact JDE. Any change except the contact names switches discovery off until it is re-tested and enabled again.</p>
          <div className="grid halves">
            <label className="field">Mode
              <select value={form.connectionMode} onChange={(e) => set("connectionMode", e.target.value as JdeProfileConfig["connectionMode"])}>
                <option value="simulation">Simulation (no customer JDE)</option>
                <option value="live" disabled={!view.liveAllowedByDeployment}>Live customer AIS{view.liveAllowedByDeployment ? "" : " (switched off for this deployment)"}</option>
              </select>
            </label>
            <label className="field">HTTPS AIS endpoint<input value={form.aisBaseUrl} onChange={(e) => set("aisBaseUrl", e.target.value)} /></label>
            <label className="field">DEV environment<input value={form.environment} onChange={(e) => set("environment", e.target.value)} placeholder="JDV920" /></label>
            <label className="field">JDE role (explicit)<input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="JADEDISC" /></label>
            <label className="field">Application release<input value={form.expectedApplicationRelease} onChange={(e) => set("expectedApplicationRelease", e.target.value)} placeholder="9.2" /></label>
            <label className="field">Tools release<input value={form.expectedToolsRelease} onChange={(e) => set("expectedToolsRelease", e.target.value)} placeholder="9.2.8.2" /></label>
            <label className="field">Path code<input value={form.pathCode} onChange={(e) => set("pathCode", e.target.value)} placeholder="DV920" /></label>
            <label className="field">Authentication<select value={form.authMethod} disabled><option value="ais_token_request">AIS token request</option></select></label>
            <label className="field">Customer contact<input value={form.customerContact} onChange={(e) => set("customerContact", e.target.value)} /></label>
            <label className="field">CNC contact<input value={form.cncContact} onChange={(e) => set("cncContact", e.target.value)} /></label>
          </div>
          <label className="field">Network route<input value={form.networkRoute} onChange={(e) => set("networkRoute", e.target.value)} /></label>
          <label className="field">Isolation evidence<textarea value={form.isolationEvidence} onChange={(e) => set("isolationEvidence", e.target.value)} /></label>
          <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" checked={form.routingIsolationConfirmed} onChange={(e) => set("routingIsolationConfirmed", e.target.checked)} />The customer/CNC has confirmed the route reaches DEV only and the environment is isolated</label>
          <label className="field">Privilege statement<textarea value={form.privilegeStatement} onChange={(e) => set("privilegeStatement", e.target.value)} /></label>
          <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" checked={form.privilegeConfirmed} onChange={(e) => set("privilegeConfirmed", e.target.checked)} />The customer has confirmed this JDE identity is narrowly privileged (read-only)</label>
          <label className="field">
            Approved reads <span className="hint">(one per line: capability; targets; fields; filter fields — lists comma-separated, e.g. table_browse; F4211; DOCO,DCTO; DCTO or processing_option_values; P4210|CIQ0001)</span>
            <textarea value={readsText} onChange={(e) => setReadsText(e.target.value)} rows={5} className="mono" />
          </label>
          <div className="grid halves">
            <label className="field">Window starts<input type="datetime-local" value={form.discoveryWindow?.startsAt.slice(0, 16) ?? ""}
              onChange={(e) => set("discoveryWindow", { startsAt: new Date(e.target.value).toISOString(), endsAt: form.discoveryWindow?.endsAt ?? new Date().toISOString() })} /></label>
            <label className="field">Window ends<input type="datetime-local" value={form.discoveryWindow?.endsAt.slice(0, 16) ?? ""}
              onChange={(e) => set("discoveryWindow", { startsAt: form.discoveryWindow?.startsAt ?? new Date().toISOString(), endsAt: new Date(e.target.value).toISOString() })} /></label>
            <label className="field">Records per query (max 10)<input type="number" min={1} max={10} value={form.limits.maxRecords} onChange={(e) => set("limits", { ...form.limits, maxRecords: Number(e.target.value) })} /></label>
            <label className="field">Timeout (seconds, max 30)<input type="number" min={1} max={30} value={form.limits.timeoutSeconds} onChange={(e) => set("limits", { ...form.limits, timeoutSeconds: Number(e.target.value) })} /></label>
            <label className="field">Customer data in model prompts
              <select value={form.dataSharingPolicy} onChange={(e) => set("dataSharingPolicy", e.target.value as DataSharingPolicy)}>
                <option value="metadata_only">Metadata only (values and artifact content redacted)</option>
                <option value="configuration_and_artifacts">Configuration values and artifacts; business data redacted</option>
                <option value="full">Full values (customer has agreed)</option>
              </select>
            </label>
          </div>
          <div className="btnrow">
            <button className="btn primary" disabled={busy} onClick={() => run("Save profile", async () => {
              const r = await discoveryApi.saveProfile({ ...form, approvedReads: readsFromText(readsText) }, view.configured ? view.revision : null);
              setEditing(false);
              return r;
            })}>Save profile</button>
            <button className="btn" onClick={() => { setEditing(false); load(); }}>Cancel</button>
          </div>
        </div>
      )}

      {message && <div className="callout" style={{ marginTop: 12, borderColor: message.tone === "stop" ? "var(--stop)" : undefined }}>{message.text}</div>}

      <TechnicalBaseline />

      <div style={{ marginTop: 16 }}>
        <strong>Discovery activity</strong> <span className="hint">(sanitised: operation, target shape, counts and outcome — no credentials, tokens, filter values or business payloads)</span>
        {activity === null ? <p className="notstated">Admin only.</p> : activity.length === 0 ? <p className="notstated">No activity yet.</p> : (
          <table className="data">
            <thead><tr><th>When</th><th>Who / story / run</th><th>Operation</th><th>Outcome</th><th>Rows</th></tr></thead>
            <tbody>
              {activity.slice(0, 50).map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.startedAt).toLocaleString("en-GB")}<div className="hint">{a.durationMs ?? 0} ms · rev {a.profileRevision ?? "—"} · {a.mode}</div></td>
                  <td>{a.actorName ?? "—"}<div className="hint mono">{a.storyId ?? ""} {a.agentRunId ?? ""}</div></td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{a.target.startsWith(a.operation) ? a.target : `${a.operation} ${a.target}`}</td>
                  <td><span className={`badge ${a.outcome === "ok" ? "ok" : a.outcome === "blocked" ? "warn" : "stop"}`}>{a.outcome}</span>{a.reason && <div className="hint">{a.reason}</div>}</td>
                  <td>{a.resultCount ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ApiNote endpoint="GET/PUT /admin/jde/profile, PUT /admin/jde/credential, POST /admin/jde/test-connection|sample-read|enable|disable, GET /admin/jde/activity" />
    </section>
  );
}

const EMPTY_UPLOAD: Omit<ArtifactUploadInput, "fileName" | "contentBase64"> = {
  kind: "technical_export", domainId: null, objectName: "", objectType: "", exportFormat: "c_source",
  customerEnvironment: "", pathCode: "", release: "", sourceLocation: "", repository: "", commitRef: "",
  exportedAt: "", runtimeCorrespondence: "unknown", runtimeStatement: "", runtimeStatedBy: "",
  docTitle: "", docRevision: "", appliesToReleases: [],
};

/** Approved technical exports and reference documents, with provenance. */
function TechnicalBaseline() {
  const [items, setItems] = useState<ArtifactView[] | null>(null);
  const [form, setForm] = useState(EMPTY_UPLOAD);
  const [releases, setReleases] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => { discoveryApi.listArtifacts().then(setItems).catch(() => setItems([])); };
  useEffect(load, []);
  const set = (k: keyof typeof EMPTY_UPLOAD, v: unknown) => setForm({ ...form, [k]: v });

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await discoveryApi.uploadArtifact({
        ...form, appliesToReleases: split(releases), fileName: file.name, contentBase64: await fileToBase64(file),
        exportedAt: form.exportedAt ? new Date(form.exportedAt).toISOString() : "",
      });
      setForm(EMPTY_UPLOAD);
      setFile(null);
      load();
    } catch (e) {
      setError(saveErrorMessage(e, "Upload refused."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <strong>Technical baseline and reference documents</strong>
      <div className="hint">For what live discovery cannot provide (source, event rules, object specifications, manuals). Each upload is an immutable revision with its checksum. Only text formats are analysed; others stay listed as unavailable. Whether an export matches the active DEV runtime is the customer's statement, never assumed.</div>
      {items && items.length > 0 && (
        <table className="data">
          <thead><tr><th>Artifact</th><th>Provenance</th><th>Runtime / release</th><th>Analysis</th></tr></thead>
          <tbody>
            {items.map((a) => (
              <tr key={`${a.artifactId}@${a.revision}`} style={{ opacity: a.latest ? 1 : 0.6 }}>
                <td className="mono">{a.artifactId}@r{a.revision}{!a.latest && <div className="hint">superseded</div>}<div className="hint">{String(a.meta.object_type)} {String(a.meta.export_format)}</div></td>
                <td style={{ fontSize: 12.5 }}>
                  {String(a.meta.customer_environment || "—")} {String(a.meta.path_code || "")} {String(a.meta.release || "")}
                  <div className="hint">{String(a.meta.repository || a.meta.source_location || "")} {String(a.meta.commit_ref || "")}</div>
                  <div className="hint mono">sha256 {a.sha256.slice(0, 12)}… · {a.uploadedBy}, {new Date(a.uploadedAt).toLocaleDateString("en-GB")}</div>
                </td>
                <td>
                  {a.kind === "reference_document"
                    ? <span className={`badge ${a.compatibility === "compatible" ? "ok" : a.compatibility === "incompatible" ? "stop" : "grey"}`}>{a.compatibility}</span>
                    : <span className={`badge ${a.meta.runtime_correspondence === "matches_dev_runtime" ? "ok" : a.meta.runtime_correspondence === "known_mismatch" ? "stop" : "grey"}`}>{String(a.meta.runtime_correspondence).replace(/_/g, " ")}</span>}
                </td>
                <td><span className={`badge ${a.extractionStatus === "supported" ? "ok" : "grey"}`}>{a.extractionStatus === "supported" ? "analysable" : "unavailable"}</span>{a.extractionNote && <div className="hint">{a.extractionNote}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details style={{ marginTop: 8 }}>
        <summary>Import an approved export or document</summary>
        <div className="grid halves" style={{ marginTop: 8 }}>
          <label className="field">Kind<select value={form.kind} onChange={(e) => set("kind", e.target.value)}><option value="technical_export">Technical export</option><option value="reference_document">Reference document</option></select></label>
          <label className="field">Format<select value={form.exportFormat} onChange={(e) => set("exportFormat", e.target.value as ExportFormat)}>
            {["c_source", "er_text", "omw_xml", "text", "json", "markdown", "csv", "par", "zip", "pdf", "docx", "other"].map((f) => <option key={f} value={f}>{f}</option>)}
          </select></label>
          <label className="field">Object name<input value={form.objectName} onChange={(e) => set("objectName", e.target.value)} /></label>
          <label className="field">Object type<input value={form.objectType} onChange={(e) => set("objectType", e.target.value)} placeholder="BSFN, APPL, NER, MANUAL" /></label>
          <label className="field">Customer environment<input value={form.customerEnvironment} onChange={(e) => set("customerEnvironment", e.target.value)} /></label>
          <label className="field">Path code<input value={form.pathCode} onChange={(e) => set("pathCode", e.target.value)} /></label>
          <label className="field">Release<input value={form.release} onChange={(e) => set("release", e.target.value)} /></label>
          <label className="field">Exported at<input type="datetime-local" value={form.exportedAt} onChange={(e) => set("exportedAt", e.target.value)} /></label>
          <label className="field">Source location<input value={form.sourceLocation} onChange={(e) => set("sourceLocation", e.target.value)} /></label>
          <label className="field">Repository / commit<input value={form.repository} onChange={(e) => set("repository", e.target.value)} /><input value={form.commitRef} onChange={(e) => set("commitRef", e.target.value)} placeholder="commit" /></label>
          <label className="field">Matches the active DEV runtime?<select value={form.runtimeCorrespondence} onChange={(e) => set("runtimeCorrespondence", e.target.value as RuntimeCorrespondence)}>
            <option value="unknown">Unknown</option><option value="matches_dev_runtime">Customer/CNC states it matches</option><option value="known_mismatch">Known mismatch</option></select></label>
          <label className="field">Statement and by whom<input value={form.runtimeStatement} onChange={(e) => set("runtimeStatement", e.target.value)} /><input value={form.runtimeStatedBy} onChange={(e) => set("runtimeStatedBy", e.target.value)} placeholder="stated by" /></label>
          {form.kind === "reference_document" && <>
            <label className="field">Document title<input value={form.docTitle} onChange={(e) => set("docTitle", e.target.value)} /></label>
            <label className="field">Revision / applies to releases<input value={form.docRevision} onChange={(e) => set("docRevision", e.target.value)} /><input value={releases} onChange={(e) => setReleases(e.target.value)} placeholder="9.2, 9.2.8" /></label>
          </>}
          <label className="field">File (max 2 MB)<input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        </div>
        {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
        <button className="btn" disabled={busy || !file || !form.objectName || !form.objectType || !form.exportedAt} onClick={upload}>Import</button>
      </details>
    </div>
  );
}
