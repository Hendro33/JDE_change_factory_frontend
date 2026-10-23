import { useEffect, useState } from "react";
import {
  discoveryApi,
  fileToBase64,
  HEALTH_CHECKS,
  type ActivityRow,
  type ApprovedRead,
  type CertificateSummary,
  type ArtifactUploadInput,
  type ArtifactView,
  type CheckResult,
  type DataSharingPolicy,
  type ExportFormat,
  type JdeProfileConfig,
  type JdeProfileView,
  type ReadinessGroup,
  type RuntimeCorrespondence,
  type SampleReadPreview,
} from "../services/discoveryApi";
import { saveErrorMessage } from "../services/saveErrors";
import { Loading } from "./ui";

const tone: Record<string, string> = { ok: "ok", failed: "stop", unknown: "grey", stale: "warn" };

const split = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

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

const itemTone: Record<string, string> = { verified: "ok", recorded: "grey", attested: "warn", missing: "grey", mismatch: "stop", pending: "grey" };

/**
 * Environment verification, source by source: what the profile expects, what
 * the AIS server's defaults say (recorded, never evidence), what the
 * authenticated session reports, and what only the customer can attest.
 */
function EnvironmentFacets({ result }: { result?: CheckResult }) {
  const f = result?.facets;
  if (!f?.items?.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <strong>Environment verification, by source</strong>
      <table className="data">
        <thead><tr><th>Item</th><th>Configured</th><th>Reported by JDE</th><th>Status</th><th>Source</th><th>Detail</th></tr></thead>
        <tbody>
          {f.items.map((i) => (
            <tr key={i.item}>
              <td>{i.item}</td>
              <td className="mono">{i.configured == null || i.configured === "" ? "—" : typeof i.configured === "object" ? JSON.stringify(i.configured) : String(i.configured)}</td>
              <td className="mono">{i.reported == null || i.reported === "" ? "—" : typeof i.reported === "object" ? JSON.stringify(i.reported) : String(i.reported)}</td>
              <td><span className={`badge ${itemTone[i.status] ?? "grey"}`}>{i.status}</span></td>
              <td className="hint">{i.source}</td>
              <td style={{ fontSize: 12.5 }}>{i.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f.server_defaults && (
        <div className="hint">
          Server defaults (defaultconfig, not evidence of the session):{" "}
          {Object.entries(f.server_defaults).filter(([k]) => k !== "used_as_evidence").map(([k, v]) => `${k} ${String(v)}`).join(" · ")}
        </div>
      )}
      {f.notes?.map((n) => <div key={n} className="hint">{n}</div>)}
      {f.contract_basis && <div className="hint">Basis: {f.contract_basis}</div>}
    </div>
  );
}

/** Readiness: the connection (what the agents need) and the optional customer assurance. */
function Readiness({ groups, ready }: { groups: ReadinessGroup[]; ready: boolean }) {
  return (
    <div aria-label="Readiness">
      <strong>Readiness</strong>{" "}
      <span className={`badge ${ready ? "ok" : "stop"}`}>{ready ? "agents can use the connection" : "not ready"}</span>
      <div className="grid halves" style={{ marginTop: 6 }}>
        {groups.map((g) => (
          <div key={g.id} className="callout" aria-label={`Readiness: ${g.label}`}>
            <strong>{g.label}</strong>{" "}
            <span className={`badge ${g.satisfied ? "ok" : "stop"}`}>{g.satisfied ? "satisfied" : "blocked"}</span>
            <ul style={{ listStyle: "none", paddingLeft: 0, margin: "4px 0 0" }}>
              {g.items.map((i) => (
                <li key={i.id} style={{ fontSize: 12.5 }}>
                  <span className={`badge ${i.satisfied ? "ok" : i.required === false ? "grey" : "stop"}`}>
                    {i.satisfied ? "ok" : i.required === false ? "not required" : "missing"}</span> {i.label}
                  <span className="hint"> ({(i.kind ?? "").replace(/_/g, " ")}) -- {i.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };

/**
 * The AIS server certificate (or its CA) for this connection. Uploading only
 * adds trust for this one address; Jade never switches verification off.
 */
export function CertificateEditor({ selected, initial, aisUrl, onSelect, label = "AIS server certificate" }: {
  selected: string; initial?: CertificateSummary | null; aisUrl: string; onSelect: (sha: string) => void; label?: string;
}) {
  const [summary, setSummary] = useState<CertificateSummary | null>(initial && initial.sha256 === selected ? initial : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const host = hostOf(aisUrl);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const s = await discoveryApi.uploadCertificate(await file.text());
      setSummary(s); onSelect(s.sha256);
    } catch (e) { setError(saveErrorMessage(e, "The certificate was refused.")); }
    finally { setBusy(false); }
  }
  const covers = !!summary && summary.certificates.some((c) => c.names.some((n) => n.toLowerCase() === host));
  return (
    <div className="field">{label} <span className="hint">(needed when the certificate is self-signed or from a
      private CA. Upload the server's certificate or its CA as .pem/.crt -- never a private key. It is trusted only for this
      connection; certificate and host-name/IP checks always stay on.)</span>
      <input type="file" aria-label={label === "AIS server certificate" ? "AIS certificate file" : `${label} file`} accept=".pem,.crt,.cer,.txt" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
      {selected && !summary && <div className="hint">Certificate selected (sha256 <span className="mono">{selected.slice(0, 16)}…</span>).</div>}
      {summary && (
        <div aria-label="Uploaded certificate" style={{ marginTop: 4 }}>
          {summary.certificates.map((c) => (
            <div key={c.fingerprint_sha256} className="hint">
              <strong>{c.subject}</strong>{c.is_ca ? " (CA)" : ""} · names: <span className="mono">{c.names.join(", ") || "none"}</span> · valid
              until {new Date(c.not_after).toLocaleDateString("en-GB")} · fingerprint <span className="mono">{c.fingerprint_sha256.slice(0, 16)}…</span>
            </div>))}
          {host && !covers && <div className="hint">This certificate does not name {host} (common for a self-signed trial server). Jade will
            trust exactly this certificate for {host}, and refuse any other.</div>}
        </div>)}
      {selected && <button className="btn small" onClick={() => { setSummary(null); onSelect(""); }}>Remove certificate (use public CAs)</button>}
      {error && <div className="hint" role="alert" style={{ color: "var(--stop)" }}>{error}</div>}
    </div>
  );
}

/** Pick reference documents (imported under Technical baseline) as evidence. */
function DocChooser({ label, documents, selected, onChange }: { label: string; documents: ArtifactView[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="field">{label} <span className="hint">(import them below under Technical baseline as reference documents)</span>
      {documents.length === 0 ? <div className="notstated">No reference documents imported yet.</div> : documents.map((d) => {
        const ref = `${d.artifactId}@r${d.revision}`;
        return (
          <label key={ref} style={{ display: "block", fontWeight: 400 }}>
            <input type="checkbox" aria-label={`${label}: ${ref}`} checked={selected.includes(ref)}
              onChange={(e) => onChange(e.target.checked ? [...selected, ref] : selected.filter((x) => x !== ref))} />{" "}
            <span className="mono">{ref}</span> {String(d.meta.doc_title || d.meta.title || d.meta.file_name || "")}
          </label>);
      })}
    </div>
  );
}

/** Structured editor for the approved reads -- capability, exact targets, columns, filter columns. */
function ReadsEditor({ reads, onChange, view }: { reads: ApprovedRead[]; onChange: (r: ApprovedRead[]) => void; view: JdeProfileView }) {
  const caps = view.capabilities.filter((c) => c.status !== "unavailable");
  const upd = (i: number, patch: Partial<ApprovedRead>) => onChange(reads.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <table className="data" style={{ fontSize: 12.5 }}>
        <thead><tr><th>Capability</th><th>Exact targets (comma-separated)</th><th>Columns returned</th><th>Columns that may be filtered</th><th></th></tr></thead>
        <tbody>{reads.map((r, i) => {
          const cap = view.capabilities.find((c) => c.capabilityId === r.capabilityId);
          return (
            <tr key={i}>
              <td><select aria-label={`Read ${i + 1} capability`} value={r.capabilityId} onChange={(e) => upd(i, { capabilityId: e.target.value })}>
                <option value="">choose…</option>
                {caps.map((c) => <option key={c.capabilityId} value={c.capabilityId}>{c.title}</option>)}
              </select>{cap && <div className="hint">{cap.targetKind === "none" ? "no target" : `target: ${cap.targetKind}`}</div>}</td>
              <td><input aria-label={`Read ${i + 1} targets`} value={r.targets.join(", ")} disabled={cap?.targetKind === "none"}
                         onChange={(e) => upd(i, { targets: split(e.target.value) })} placeholder={cap?.targetKind === "table" ? "F0101" : ""} /></td>
              <td><input aria-label={`Read ${i + 1} fields`} value={r.fields.join(", ")} onChange={(e) => upd(i, { fields: split(e.target.value) })} /></td>
              <td><input aria-label={`Read ${i + 1} filter fields`} value={r.filterFields.join(", ")} onChange={(e) => upd(i, { filterFields: split(e.target.value) })} /></td>
              <td><button className="btn small" aria-label={`Remove read ${i + 1}`} onClick={() => onChange(reads.filter((_, j) => j !== i))}>×</button></td>
            </tr>
          );
        })}</tbody>
      </table>
      <button className="btn small" onClick={() => onChange([...reads, { capabilityId: "", targets: [], fields: [], filterFields: [] }])}>Add approved read</button>
      <div className="hint">Column names are JDE aliases (e.g. AN8, ALPH). There is no "all columns", no wildcard and no free-form query.</div>
    </div>
  );
}

/** One explicitly chosen, bounded sample read. */
function SampleRead({ view, busy, run }: { view: JdeProfileView; busy: boolean; run: (label: string, fn: () => Promise<unknown>) => void }) {
  const reads = view.config?.approvedReads ?? [];
  const [capId, setCapId] = useState(reads[0]?.capabilityId ?? "");
  const read = reads.find((r) => r.capabilityId === capId);
  const [target, setTarget] = useState("");
  const [max, setMax] = useState(1);
  const [fField, setFField] = useState("");
  const [fOp, setFOp] = useState("=");
  const [fValue, setFValue] = useState("");
  const [preview, setPreview] = useState<SampleReadPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => { setTarget(read?.targets[0] ?? ""); setFField(""); }, [capId]);
  useEffect(() => { setPreview(null); setPreviewError(null); }, [capId, target, max, fField, fOp, fValue, view.revision]);
  const limit = view.ceilings.max_records;
  const input = () => ({ capabilityId: capId, target, maxRecords: max, filters: fField ? [{ field: fField, op: fOp, value: fValue }] : [] });
  return (
    <div className="callout" style={{ marginTop: 6 }}>
      <strong>Sample read of an approved read</strong>
      <div className="hint">One read of one approved target, exactly the approved columns, at most the record limit. The server builds the AIS
        request from the approved read; the browser never supplies an endpoint or query body. Requires a passed Test for these settings. Optional:
        a quick way to check an approved read before the agents rely on it.</div>
      <div className="btnrow" style={{ flexWrap: "wrap", marginTop: 6 }}>
        <select aria-label="Sample read capability" value={capId} onChange={(e) => setCapId(e.target.value)}>
          {reads.map((r) => <option key={r.capabilityId} value={r.capabilityId}>{r.capabilityId}</option>)}
        </select>
        {read && read.targets.length > 0 && (
          <select aria-label="Sample read target" value={target} onChange={(e) => setTarget(e.target.value)}>
            {read.targets.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>)}
        <label>max records <input aria-label="Sample read max records" type="number" min={1} max={limit} value={max}
          onChange={(e) => setMax(Math.max(1, Math.min(limit, Number(e.target.value))))} style={{ width: 60 }} /></label>
        {read && read.filterFields.length > 0 && (<>
          <select aria-label="Sample read filter column" value={fField} onChange={(e) => setFField(e.target.value)}>
            <option value="">no filter</option>{read.filterFields.map((f) => <option key={f}>{f}</option>)}
          </select>
          {fField && <><select aria-label="Sample read filter operator" value={fOp} onChange={(e) => setFOp(e.target.value)}>
            {["=", "<>", "<", ">", "<=", ">=", "begins_with"].map((o) => <option key={o}>{o}</option>)}</select>
            <input aria-label="Sample read filter value" value={fValue} onChange={(e) => setFValue(e.target.value)} size={10} /></>}
        </>)}
        <button className="btn" disabled={busy || !capId || (!!read?.targets.length && !target)}
          onClick={() => discoveryApi.previewSampleRead(input()).then(setPreview)
            .catch((e) => { setPreview(null); setPreviewError(saveErrorMessage(e, "Refused.")); })}>Preview exact request</button>
        <button className="btn" disabled={busy || !preview}
          onClick={() => run("Approved sample read", () => discoveryApi.sampleRead(input()))}>Run Approved Sample Read</button>
      </div>
      {!preview && <div className="hint">Preview the exact request first; the run button stays off until you have seen it.</div>}
      {previewError && <div className="hint" style={{ color: "var(--stop)" }}>Preview refused: {previewError}</div>}
      {preview && (
        <div aria-label="Sample read request preview" style={{ marginTop: 6 }}>
          <div className="mono" style={{ fontSize: 12.5 }}>{preview.method} {preview.url}</div>
          <pre className="mono" style={{ fontSize: 12.5, overflowX: "auto", margin: "4px 0" }}>{JSON.stringify(preview.body, null, 2)}</pre>
          <div className="hint mono">request sha256 {preview.request_sha256} · {preview.mode}</div>
          <div className="hint">{preview.note} The run is refused if what would be sent differs from this approved read.</div>
        </div>
      )}
    </div>
  );
}

/**
 * The optional part of Administration > Systems & Connections > JD Edwards,
 * under the main connection form (JdeConnectionSetup): what the last Test
 * found, customer assurance (recorded, never required), optional read
 * restrictions (approved reads, limits), a sample read, the
 * kill switch, the technical baseline and the discovery activity.
 */
export function JdeDiscoveryPanel({ onChanged }: { onChanged?: () => void } = {}) {
  const [view, setView] = useState<JdeProfileView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<JdeProfileConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: string; text: string } | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ArtifactView[]>([]);

  const load = () => {
    discoveryApi.getProfile().then((v) => { setView(v); setLoadError(null); setForm(v.config ?? null); })
      .catch((e) => setLoadError(saveErrorMessage(e, "Could not load the JDE connection.")));
    discoveryApi.activity().then((a) => { setActivity(a); setActivityError(null); })
      .catch((e) => { setActivity(null); setActivityError(saveErrorMessage(e, "Could not load the discovery activity.")); });
    loadDocuments();
  };
  const loadDocuments = () => {
    discoveryApi.listArtifacts().then((a) => setDocuments(a.filter((x) => x.kind === "reference_document" && x.latest))).catch(() => setDocuments([]));
  };
  useEffect(() => { load(); }, []);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const r = (await fn()) as { outcome?: string; detail?: string };
      if (r && r.outcome !== undefined) {
        setMessage({ tone: r.outcome === "ok" ? "ok" : "stop", text: `${label}: ${r.outcome}${r.detail ? ` — ${r.detail}` : ""}` });
      } else {
        setMessage({ tone: "ok", text: `${label}: saved` });
      }
      load();
      onChanged?.();
    } catch (e) {
      setMessage({ tone: "stop", text: `${label}: ${saveErrorMessage(e, "failed")}` });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}><strong>Could not load</strong>{loadError}</div>;
  if (!view || !form) return view && !view.configured ? null : <Loading what="the JDE connection details" />;
  const set = <K extends keyof JdeProfileConfig>(k: K, v: JdeProfileConfig[K]) => setForm({ ...form, [k]: v });
  const setAcc = (patch: Partial<JdeProfileConfig["dedicatedAccount"]>) => set("dedicatedAccount", { ...form.dedicatedAccount, ...patch });
  const setNet = (patch: Partial<JdeProfileConfig["networkRestriction"]>) => set("networkRestriction", { ...form.networkRestriction, ...patch });
  const cfg = view.config!;

  return (
    <div className="stack">
      {message && <div className="callout" role="status" style={{ borderColor: message.tone === "stop" ? "var(--stop)" : undefined }}>{message.text}</div>}

      <Readiness groups={view.readiness} ready={view.ready} />

      <div>
        <strong>Last Test, read user</strong> <span className="hint">(checked only when you press Test; no background polling)</span>
        <table className="data">
          <tbody>
            {HEALTH_CHECKS.map(({ key, label }) => (
              <tr key={key}><td>{label}</td><td><Check result={view.health[key]} /></td></tr>
            ))}
          </tbody>
        </table>
        <EnvironmentFacets result={view.health.environment} />
      </div>

      <div>
        <strong>What the Architect can read</strong>
        <div className="hint">Reads only, up to {view.ceilings.max_records} records per query, no paging. A capability with approved reads is limited to
          those targets and columns; without, any exact table / UDC / application / version name is allowed and the read user's JD Edwards role
          decides what it can see.</div>
        <table className="data">
          <thead><tr><th>Capability</th><th>Status</th><th>Restricted to</th></tr></thead>
          <tbody>
            {view.capabilities.map((c) => (
              <tr key={c.capabilityId}>
                <td>{c.title}<div className="hint mono">{c.capabilityId}</div></td>
                <td>
                  <span className={`badge ${c.status === "unavailable" ? "grey" : "ok"}`}>{c.status === "unavailable" ? "not through AIS" : "available"}</span>
                  {c.status === "unavailable" && <div className="hint">{c.statusDetail}</div>}
                  {c.alternative && <div className="hint">{c.alternative}</div>}
                </td>
                <td className="mono" style={{ fontSize: 12.5 }}>
                  {c.approved ? <>
                    {c.approvedTargets.join(", ") || "—"}
                    {c.approvedFields.length > 0 && <div>fields: {c.approvedFields.join(", ")}</div>}
                    {c.approvedFilterFields.length > 0 && <div>filters: {c.approvedFilterFields.join(", ")}</div>}
                  </> : c.status === "unavailable" ? "" : <span className="hint">not restricted</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(cfg.approvedReads ?? []).length > 0 && <SampleRead view={view} busy={busy} run={run} />}

      {!editing ? (
        <div className="btnrow">
          <button className="btn" onClick={() => { setForm(cfg); setEditing(true); setMessage(null); }}>Edit customer assurance and restrictions</button>
          <button className="btn" disabled={busy || view.disabled} onClick={() => run("Disable Connection", discoveryApi.disable)}>Disable connection</button>
          <span className="hint">Disable stops every agent request at once; Test switches it back on.</span>
        </div>
      ) : (
        <div className="stack">
          <p className="hint">All optional. None of this has to be filled in for the agents to work; it is recorded for customers who require it, and
            approved reads, a window or lower limits restrict what the agents may read.</p>
          <fieldset><legend>About this environment</legend>
            <div className="grid halves">
              <label className="field">Connection name<input aria-label="Connection name" value={form.connectionName} onChange={(e) => set("connectionName", e.target.value)} placeholder="e.g. ConsultIQ JDE trial" /></label>
              <label className="field">Environment purpose
                <select aria-label="Environment purpose" value={form.environmentPurpose} onChange={(e) => set("environmentPurpose", e.target.value as JdeProfileConfig["environmentPurpose"])}>
                  <option value="development">Development</option>
                  <option value="isolated_trial">Isolated trial environment, approved for this trial</option>
                </select></label>
              {form.environmentPurpose === "isolated_trial" && (
                <label className="field">Trial approval reference<input aria-label="Trial approval reference" value={form.trialApprovalReference} onChange={(e) => set("trialApprovalReference", e.target.value)} /></label>)}
              <label className="field">Expected application release <span className="hint">(compared on Test when set)</span><input aria-label="Application release" value={form.expectedApplicationRelease} onChange={(e) => set("expectedApplicationRelease", e.target.value)} placeholder="9.2" /></label>
              <label className="field">Expected Tools release <span className="hint">(compared on Test when set)</span><input aria-label="Tools release" value={form.expectedToolsRelease} onChange={(e) => set("expectedToolsRelease", e.target.value)} placeholder="9.2.26.2" /></label>
              <label className="field">Customer contact<input aria-label="Customer contact" value={form.customerContact} onChange={(e) => set("customerContact", e.target.value)} /></label>
              <label className="field">CNC contact<input aria-label="CNC contact" value={form.cncContact} onChange={(e) => set("cncContact", e.target.value)} /></label>
            </div>
            <label className="field">Network access notes<input aria-label="Network access notes" value={form.networkRoute} onChange={(e) => set("networkRoute", e.target.value)} /></label>
          </fieldset>

          <fieldset><legend>Customer confirmations</legend>
            <label className="field">Privilege statement<textarea aria-label="Privilege statement" value={form.privilegeStatement} onChange={(e) => set("privilegeStatement", e.target.value)} /></label>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Privilege confirmed" checked={form.privilegeConfirmed} onChange={(e) => set("privilegeConfirmed", e.target.checked)} />The customer has confirmed the read user is narrowly privileged (read-only)</label>
            <label className="field">Runtime statement <span className="hint">(the CNC's statement of Tools release and path code)</span>
              <textarea aria-label="Runtime attestation" value={form.runtimeAttestationEvidence} onChange={(e) => set("runtimeAttestationEvidence", e.target.value)} /></label>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Runtime attested" checked={form.runtimeAttestationConfirmed} onChange={(e) => set("runtimeAttestationConfirmed", e.target.checked)} />The CNC has attested the Tools release and path code</label>
            <DocChooser label="Linked evidence documents" documents={documents} selected={form.evidenceArtifactIds} onChange={(ids) => set("evidenceArtifactIds", ids)} />
          </fieldset>

          <fieldset><legend>Read user verification</legend>
            <div className="grid halves">
              <label className="field">Verified JDE user<input aria-label="Verified JDE user" value={form.dedicatedAccount.username} onChange={(e) => setAcc({ username: e.target.value })} /></label>
              <label className="field">Verified role<input aria-label="Verified role" value={form.dedicatedAccount.role} onChange={(e) => setAcc({ role: e.target.value })} /></label>
              <label className="field">Verified by<input aria-label="Verified by" value={form.dedicatedAccount.verifiedBy} onChange={(e) => setAcc({ verifiedBy: e.target.value })} /></label>
              <label className="field">Verified on<input aria-label="Verified on" type="date" value={form.dedicatedAccount.verifiedOn} onChange={(e) => setAcc({ verifiedOn: e.target.value })} /></label>
              <label className="field">Verification method
                <select aria-label="Verification method" value={form.dedicatedAccount.method} onChange={(e) => setAcc({ method: e.target.value as JdeProfileConfig["dedicatedAccount"]["method"] })}>
                  <option value="">choose…</option>
                  <option value="security_configuration_review">Review of the JDE security configuration</option>
                  <option value="prohibited_operation_test">Test: reads work and prohibited operations are rejected</option>
                </select></label>
              <label className="field">Notes<input aria-label="Verification notes" value={form.dedicatedAccount.notes} onChange={(e) => setAcc({ notes: e.target.value })} /></label>
            </div>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Permits approved reads" checked={form.dedicatedAccount.permitsApprovedReads} onChange={(e) => setAcc({ permitsApprovedReads: e.target.checked })} />JDE permits the reads for this user and role</label>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Rejects prohibited operations" checked={form.dedicatedAccount.rejectsProhibitedOperations} onChange={(e) => setAcc({ rejectsProhibitedOperations: e.target.checked })} />JDE rejects writes, UBEs and other tables for this user and role</label>
            <DocChooser label="Verification evidence documents" documents={documents} selected={form.dedicatedAccount.evidenceArtifactIds} onChange={(ids) => setAcc({ evidenceArtifactIds: ids })} />
          </fieldset>

          <fieldset><legend>Network restriction</legend>
            <div className="grid halves">
              <label className="field">Backend source address<input aria-label="Backend source address" value={form.networkRestriction.backendSourceAddress} onChange={(e) => setNet({ backendSourceAddress: e.target.value })} /></label>
              <label className="field">Evidence<input aria-label="Network restriction evidence" value={form.networkRestriction.evidence} onChange={(e) => setNet({ evidence: e.target.value })} /></label>
            </div>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Restricted to source" checked={form.networkRestriction.restrictedToSource} onChange={(e) => setNet({ restrictedToSource: e.target.checked })} />AIS access is restricted to that source address</label>
          </fieldset>

          <fieldset><legend>Restrict reads (optional)</legend>
            <ReadsEditor reads={form.approvedReads} onChange={(r) => set("approvedReads", r)} view={view} />
            <div className="grid halves">
              <label className="field">Request timeout, seconds (max {view.ceilings.max_timeout_seconds})<input aria-label="Request timeout" type="number" min={1} max={view.ceilings.max_timeout_seconds} value={form.limits.timeoutSeconds} onChange={(e) => set("limits", { ...form.limits, timeoutSeconds: Number(e.target.value) })} /></label>
            </div>
          </fieldset>
          <div className="btnrow">
            <button className="btn primary" disabled={busy} onClick={() => run("Save", async () => {
              const r = await discoveryApi.saveProfile({ ...form, connectionMode: "live" }, view.revision);
              setView(r);
              setEditing(false);
              return { outcome: "ok", detail: `saved as revision ${r.revision}.${r.discoveryEnabled ? "" : " Run Test again: an expected release changed."}` };
            })}>Save</button>
            <button className="btn" onClick={() => { setEditing(false); setForm(cfg); }}>Cancel</button>
          </div>
        </div>
      )}

      <TechnicalBaseline onImported={loadDocuments} />

      <div>
        <strong>Discovery activity</strong> <span className="hint">(time, operation, target, outcome and reason; never credentials, tokens, filter values or business data)</span>
        {activityError ? <p className="notstated">{activityError}</p> : activity === null ? <Loading what="the discovery activity" /> : activity.length === 0 ? <p className="notstated">No activity yet.</p> : (
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
    </div>
  );
}

function coverage(a: ArtifactView): { analysedChars: number; totalChars: number; truncated: boolean; analysed: boolean } | null {
  const c = a.meta.analysis_coverage as { analysed_chars?: number; total_chars?: number; truncated?: boolean; analysed?: boolean } | undefined;
  if (!c || !c.analysed) return null;
  return { analysedChars: c.analysed_chars ?? 0, totalChars: c.total_chars ?? 0, truncated: !!c.truncated, analysed: true };
}

const EMPTY_UPLOAD: Omit<ArtifactUploadInput, "fileName" | "contentBase64"> = {
  kind: "technical_export", domainId: null, objectName: "", objectType: "", exportFormat: "c_source",
  customerEnvironment: "", pathCode: "", release: "", sourceLocation: "", repository: "", commitRef: "",
  exportedAt: "", runtimeCorrespondence: "unknown", runtimeStatement: "", runtimeStatedBy: "",
  docTitle: "", docRevision: "", appliesToReleases: [],
};

/** Approved technical exports and reference documents, with provenance. */
function TechnicalBaseline({ onImported }: { onImported?: () => void }) {
  const [items, setItems] = useState<ArtifactView[] | null>(null);
  const [form, setForm] = useState(EMPTY_UPLOAD);
  const [releases, setReleases] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = () => {
    discoveryApi.listArtifacts().then((a) => { setItems(a); setLoadError(null); })
      .catch((e) => { setItems([]); setLoadError(saveErrorMessage(e, "Could not load the technical baseline.")); });
  };
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
      onImported?.();
    } catch (e) {
      setError(saveErrorMessage(e, "Upload refused."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <strong>Technical baseline and reference documents</strong>
      {loadError && <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{loadError}</div>}
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
                <td>
                  <span className={`badge ${a.extractionStatus === "supported" ? (coverage(a)?.truncated ? "warn" : "ok") : "grey"}`}>
                    {a.extractionStatus !== "supported" ? "unavailable" : coverage(a)?.truncated ? "partly analysable" : "analysable"}
                  </span>
                  {coverage(a)?.analysed && <div className="hint">{coverage(a)!.analysedChars.toLocaleString("en-GB")} of {coverage(a)!.totalChars.toLocaleString("en-GB")} characters analysable</div>}
                  {a.extractionNote && <div className="hint">{a.extractionNote}</div>}
                </td>
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
