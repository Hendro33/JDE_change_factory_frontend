import { useEffect, useState } from "react";
import { api } from "../services/api";
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
  type Prerequisite,
  type ReadinessGroup,
  type RuntimeCorrespondence,
  type SampleReadPreview,
} from "../services/discoveryApi";
import { saveErrorMessage } from "../services/saveErrors";
import { ApiNote, Loading } from "./ui";

const tone: Record<string, string> = { ok: "ok", failed: "stop", unknown: "grey", stale: "warn" };

function blankConfig(): JdeProfileConfig {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return {
    connectionName: "", connectionMode: "live", aisBaseUrl: "https://", environment: "", environmentPurpose: "development",
    trialApprovalReference: "", role: "", expectedApplicationRelease: "", expectedToolsRelease: "", pathCode: "", caCertificateSha256: "",
    authMethod: "ais_token_request", customerContact: "", cncContact: "", networkRoute: "", isolationEvidence: "",
    routingIsolationConfirmed: false, privilegeStatement: "", privilegeConfirmed: false, runtimeAttestationConfirmed: false,
    runtimeAttestationEvidence: "", evidenceArtifactIds: [], approvedReads: [],
    dedicatedAccount: { username: "", role: "", verifiedBy: "", verifiedOn: "", method: "", permitsApprovedReads: false,
      rejectsProhibitedOperations: false, evidenceArtifactIds: [], notes: "" },
    networkRestriction: { backendSourceAddress: "", restrictedToSource: false, evidence: "", evidenceArtifactIds: [] },
    discoveryWindow: { startsAt: start.toISOString(), endsAt: end.toISOString() },
    limits: { maxRecords: 10, timeoutSeconds: 15, concurrentRequests: 1 }, dataSharingPolicy: "metadata_only",
  };
}

const split = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
const localInput = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

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

const itemTone: Record<string, string> = { verified: "ok", attested: "warn", missing: "grey", mismatch: "stop", pending: "grey" };

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
              <td className="mono">{i.configured || "—"}</td>
              <td className="mono">{i.reported || "—"}</td>
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

const KIND_LABEL: Record<string, string> = {
  customer_attestation: "Customer attestation -- Jade cannot check this",
  machine_verified: "Checked by Jade for this profile revision",
  configuration: "Configuration",
  server_managed: "Server-managed -- set by whoever runs the backend, not in this browser",
  evidence: "Evidence -- a verification record with a linked document",
};

/** The five separately visible readiness statuses. Passing TLS, sign-in or attestations alone never makes a connection ready. */
function Readiness({ groups, ready }: { groups: ReadinessGroup[]; ready: boolean }) {
  return (
    <div aria-label="Readiness">
      <strong>Readiness for Architect discovery</strong>{" "}
      <span className={`badge ${ready ? "ok" : "stop"}`}>{ready ? "ready" : "not ready"}</span>
      <div className="grid halves" style={{ marginTop: 6 }}>
        {groups.map((g) => (
          <div key={g.id} className="callout" aria-label={`Readiness: ${g.label}`}>
            <strong>{g.label}</strong>{" "}
            <span className={`badge ${g.satisfied ? "ok" : "stop"}`}>{g.satisfied ? "satisfied" : "blocked"}</span>
            <ul style={{ listStyle: "none", paddingLeft: 0, margin: "4px 0 0" }}>
              {g.items.map((i) => (
                <li key={i.id} style={{ fontSize: 13 }}>
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

function Prerequisites({ items }: { items: Prerequisite[] }) {
  const kinds = ["configuration", "customer_attestation", "machine_verified", "server_managed", "evidence"];
  return (
    <div aria-label="Prerequisites">
      <strong>Prerequisites for Test Connection and discovery</strong>
      {kinds.filter((k) => items.some((i) => i.kind === k)).map((k) => (
        <div key={k} style={{ marginTop: 6 }}>
          <div className="hint" style={{ fontWeight: 600 }}>{KIND_LABEL[k]}</div>
          <ul style={{ listStyle: "none", paddingLeft: 0, margin: "2px 0" }}>
            {items.filter((i) => i.kind === k).map((i) => (
              <li key={i.id}>
                <span className={`badge ${i.satisfied ? "ok" : i.required === false ? "grey" : "stop"}`}>
                  {i.satisfied ? "satisfied" : i.required === false ? "optional" : "missing"}</span> {i.label}
                <span className="hint"> -- {i.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="hint">A successful Test Connection proves the backend can reach AIS and sign in; it does not verify that the
        environment is isolated. Isolation is the customer's attestation.</div>
    </div>
  );
}

const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };

/**
 * The AIS server certificate (or its CA) for this connection. Uploading only
 * adds trust for this one address; Jade never switches verification off.
 */
function CertificateEditor({ selected, initial, aisUrl, onSelect }: {
  selected: string; initial?: CertificateSummary | null; aisUrl: string; onSelect: (sha: string) => void;
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
  const hasCa = !!summary && summary.certificates.some((c) => c.is_ca);
  return (
    <div className="field">AIS server certificate <span className="hint">(needed when the AIS certificate is self-signed or from a
      private CA. Upload the server's certificate or its CA as .pem/.crt -- never a private key. It is trusted only for this
      connection; certificate and host-name/IP checks always stay on.)</span>
      <input type="file" aria-label="AIS certificate file" accept=".pem,.crt,.cer,.txt" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
      {selected && !summary && <div className="hint">Certificate selected (sha256 <span className="mono">{selected.slice(0, 16)}…</span>).</div>}
      {summary && (
        <div aria-label="Uploaded certificate" style={{ marginTop: 4 }}>
          {summary.certificates.map((c) => (
            <div key={c.fingerprint_sha256} className="hint">
              <strong>{c.subject}</strong>{c.is_ca ? " (CA)" : ""} · names: <span className="mono">{c.names.join(", ") || "none"}</span> · valid
              until {new Date(c.not_after).toLocaleDateString("en-GB")} · fingerprint <span className="mono">{c.fingerprint_sha256.slice(0, 16)}…</span>
            </div>))}
          {host && !covers && !hasCa && <div className="hint" style={{ color: "var(--stop)" }}>This certificate does not name {host}; the connection will be refused
            unless the AIS address matches a name in it.</div>}
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
      <table className="data" style={{ fontSize: 13 }}>
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
  const limit = Math.min(view.config?.limits.maxRecords ?? 1, view.ceilings.max_records);
  const input = () => ({ capabilityId: capId, target, maxRecords: max, filters: fField ? [{ field: fField, op: fOp, value: fValue }] : [] });
  return (
    <div className="callout" style={{ marginTop: 6 }}>
      <strong>3. Run Approved Sample Read</strong>
      <div className="hint">One read of one approved target, exactly the approved columns, at most the record limit. The server builds the AIS
        request from the approved read; the browser never supplies an endpoint or query body. Requires a successful Test Connection for this
        revision with a verified dedicated role (never *ALL). Run it only when the read has been explicitly approved. The path code is
        established only by the approved environment-master read (table F00941, columns EMENHV, EMPATHCD, filter EMENHV = the session environment).</div>
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
          <pre className="mono" style={{ fontSize: 12, overflowX: "auto", margin: "4px 0" }}>{JSON.stringify(preview.body, null, 2)}</pre>
          <div className="hint mono">request sha256 {preview.request_sha256} · {preview.mode}</div>
          <div className="hint">{preview.note} The run is refused if what would be sent differs from this approved read.</div>
        </div>
      )}
    </div>
  );
}

/**
 * Admin > Integrations > JDE: the company's read-only discovery connection
 * for the Architect. Everything here is saved on the backend; saving never
 * contacts JDE. Test Connection, the sample read, Enable and Disable are
 * separate, explicit actions.
 */
export function JdeDiscoveryPanel() {
  const [view, setView] = useState<JdeProfileView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<JdeProfileConfig>(blankConfig());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: string; text: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [documents, setDocuments] = useState<ArtifactView[]>([]);
  const [company, setCompany] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  const load = () => {
    discoveryApi.getProfile().then((v) => {
      setView(v);
      setLoadError(null);
      setForm(v.config ?? blankConfig());
    }).catch((e) => setLoadError(saveErrorMessage(e, "Could not load the JDE connection.")));
    discoveryApi.activity().then(setActivity).catch(() => setActivity(null));
    discoveryApi.listArtifacts().then((a) => setDocuments(a.filter((x) => x.kind === "reference_document" && x.latest))).catch(() => setDocuments([]));
  };
  useEffect(() => {
    load();
    api.getSession().then((s) => {
      const c = s.customers.find((x) => x.id === s.activeCustomerId);
      setCompany(c?.name ?? s.activeCustomerId);
      setIsDemo(!!c?.isDemo);
    });
  }, []);

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
    } catch (e) {
      setMessage({ tone: "stop", text: `${label}: ${saveErrorMessage(e, "failed")}` });
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof JdeProfileConfig>(k: K, v: JdeProfileConfig[K]) => setForm({ ...form, [k]: v });
  const setAcc = (patch: Partial<JdeProfileConfig["dedicatedAccount"]>) => set("dedicatedAccount", { ...form.dedicatedAccount, ...patch });
  const setNet = (patch: Partial<JdeProfileConfig["networkRestriction"]>) => set("networkRestriction", { ...form.networkRestriction, ...patch });

  if (loadError) {
    return (
      <section className="panel">
        <h2>JDE connection</h2>
        <div className="callout">{loadError}</div>
      </section>
    );
  }
  if (!view) return <Loading what="the JDE connection" />;
  const cfg = view.config;
  const live = cfg?.connectionMode === "live";

  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>JDE connection — read-only discovery for the Architect</h2>
        {!editing && <button className="btn" onClick={() => setEditing(true)}>{view.configured ? "Edit settings" : "Set up"}</button>}
      </div>
      <div className="sub" style={{ margin: "6px 0 12px" }}>
        Company <strong>{company}</strong>. Read-only access the Architect uses to research this company's JDE environment; all
        writes to JDE stay disabled. Settings and the credential are stored on Jade's backend (the password encrypted, never shown
        again). Requests are sent from the machine running Jade's backend -- not from your browser -- so any VPN or network route must
        exist from that machine. Jade's read-only rules do not make an over-privileged JDE account safe: the customer's JDE role and
        network controls must restrict it too.
      </div>

      {view.configured && cfg && !live && !isDemo && (
        <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>
          <strong>This connection is set to Simulation, which real customers cannot use.</strong> Choose Edit settings, select Live and
          enter the customer's AIS address. Nothing is simulated for this customer.
        </div>
      )}
      {view.configured && cfg && (
        <div className="stack">
          <div style={{ fontSize: 15 }}>
            <span className={`badge ${live ? "stop" : "warn"}`} style={{ fontSize: 13 }}>{live ? "LIVE -- customer AIS endpoint" : view.modeLabel}</span>{" "}
            <span className={`badge ${view.discoveryEnabled ? "ok" : "grey"}`}>
              {view.discoveryEnabled ? "Architect discovery enabled" : view.disabled ? "Connection disabled" : "Architect discovery off"}
            </span>{" "}
            <span className="hint">{cfg.connectionName || "(unnamed connection)"} · profile revision {view.revision}, saved by {view.updatedBy}
              {view.updatedAt ? ` at ${new Date(view.updatedAt).toLocaleString("en-GB")}` : ""}</span>
          </div>
          <dl className="facts">
            <dt>AIS address</dt><dd className="mono">{cfg.aisBaseUrl}
              <div className="hint">Jade calls {view.requestUrls.token_request} (sign-in), {view.requestUrls.defaultconfig}, {view.requestUrls.dataservice} and {view.requestUrls.poservice} -- nothing else.</div></dd>
            <dt>Environment</dt><dd><span className="mono">{cfg.environment}</span> -- {cfg.environmentPurpose === "isolated_trial"
              ? <>approved isolated trial <span className="hint">({cfg.trialApprovalReference})</span></> : "development"}</dd>
            <dt>Certificate</dt><dd>{view.certificate && !view.certificate.missing
              ? <>{view.certificate.certificates.map((c) => <div key={c.fingerprint_sha256}><span className="mono">{c.subject}</span> · names {c.names.join(", ") || "none"} · valid until {new Date(c.not_after).toLocaleDateString("en-GB")}</div>)}
                  {!view.certificate.coversHost && !view.certificate.certificates.some((c) => c.is_ca) && <div className="hint" style={{ color: "var(--stop)" }}>does not name the AIS host</div>}</>
              : view.certificate?.missing ? <span className="notstated">selected certificate not found -- upload it again</span>
              : <span className="hint">none uploaded: the public CA trust store is used</span>}</dd>
            <dt>Role</dt><dd className="mono">{cfg.role}</dd>
            <dt>Expected releases</dt><dd>Application {cfg.expectedApplicationRelease}, Tools / server {cfg.expectedToolsRelease}, path code{" "}
              {cfg.pathCode ? <span className="mono">{cfg.pathCode}</span> : <span className="notstated">not established (only from JDE's F00941 read)</span>}</dd>
            <dt>Dedicated JDE account</dt><dd>{cfg.dedicatedAccount.username
              ? <><span className="mono">{cfg.dedicatedAccount.username} / {cfg.dedicatedAccount.role}</span> <span className="hint">verified by {cfg.dedicatedAccount.verifiedBy || "—"} on {cfg.dedicatedAccount.verifiedOn || "—"} ({cfg.dedicatedAccount.method.replace(/_/g, " ") || "no method"}), {cfg.dedicatedAccount.evidenceArtifactIds.length} evidence document(s)</span></>
              : <span className="notstated">no verification recorded</span>}</dd>
            <dt>Network restriction</dt><dd>{cfg.networkRestriction.backendSourceAddress
              ? <>AIS restricted to <span className="mono">{cfg.networkRestriction.backendSourceAddress}</span>{cfg.networkRestriction.restrictedToSource ? "" : " (not confirmed)"} <span className="hint">{cfg.networkRestriction.evidence}</span></>
              : <span className="notstated">not recorded</span>}</dd>
            <dt>Authentication</dt><dd>{view.authMethods.find((m) => m.id === cfg.authMethod)?.label} · {view.credentialConfigured
              ? <>user {view.credentialUsernameMasked} <span className="badge grey">{view.credentialStorage}</span></> : <span className="notstated">no credential saved</span>}</dd>
            <dt>Customer / CNC</dt><dd>{cfg.customerContact || "—"} / {cfg.cncContact || "—"}</dd>
            <dt>Network access</dt><dd>{cfg.networkRoute || <span className="notstated">not stated</span>}</dd>
            <dt>Window</dt><dd>{cfg.discoveryWindow ? `${new Date(cfg.discoveryWindow.startsAt).toLocaleString("en-GB")} – ${new Date(cfg.discoveryWindow.endsAt).toLocaleString("en-GB")}` : "none"}</dd>
            <dt>Limits</dt><dd>{cfg.limits.maxRecords} records per query (server maximum {view.ceilings.max_records}), one request at a time, {cfg.limits.timeoutSeconds}s timeout (maximum {view.ceilings.max_timeout_seconds}s), no paging or retries</dd>
            <dt>Customer data in AI prompts</dt><dd>{cfg.dataSharingPolicy.replace(/_/g, " ")}</dd>
          </dl>

          <Readiness groups={view.readiness} ready={view.ready} />
          <details><summary>Prerequisites for Test Connection</summary><Prerequisites items={view.prerequisites} /></details>
          {live && view.serverPrerequisites.some((p) => !p.satisfied) && (
            <div className="callout" style={{ borderColor: "var(--stop)" }}>
              <strong>This live connection cannot be used yet.</strong> Jade never disables certificate checks and only sends requests to
              the saved AIS address.
              <ul>{view.serverPrerequisites.filter((p) => !p.satisfied).map((p) => <li key={p.id}>{p.label}: {p.detail}</li>)}</ul>
            </div>
          )}

          <div>
            <strong>Connection health</strong> <span className="hint">(checked only when you press Test Connection; no background polling)</span>
            <table className="data">
              <tbody>
                {HEALTH_CHECKS.map(({ key, label }) => (
                  <tr key={key}><td>{label}</td><td><Check result={view.health[key]} /></td></tr>
                ))}
              </tbody>
            </table>
            <EnvironmentFacets result={view.health.environment} />
          </div>

          <div className="stack">
            <div className="callout">
              <strong>2. Test Connection</strong>
              <div className="hint">From the backend, over verified TLS: sign in with the saved credential for the stated environment and
                role, read the AIS server identity (defaultconfig), record what the session reports, then sign out. No business data, UBE or
                batch job. A different environment name or a *ALL role is shown as a mismatch, never corrected; authentication can succeed
                while the connection stays not ready.</div>
              <button className="btn" style={{ marginTop: 6 }} disabled={busy} onClick={() => run("Test Connection", discoveryApi.testConnection)}>Test Connection</button>
            </div>
            <SampleRead view={view} busy={busy} run={run} />
            <div className="callout">
              <strong>4. Enable Architect Discovery</strong>
              <div className="hint">Lets the Architect use the approved, verified reads for this profile revision within the window. Any material change to these settings switches it off again.</div>
              <button className="btn primary" style={{ marginTop: 6 }} disabled={busy || view.enableBlockers.length > 0 || view.discoveryEnabled}
                onClick={() => run("Enable Architect Discovery", () => discoveryApi.enable(view.revision))}>Enable Architect Discovery</button>
              {view.enableBlockers.length > 0 && !view.discoveryEnabled && <div className="hint">Blocked by: {view.enableBlockers.join("; ")}</div>}
            </div>
            <div className="callout">
              <strong>5. Disable Connection</strong>
              <div className="hint">Kill switch: stops every new or queued request immediately and clears the checks; re-enabling needs a fresh Test Connection.</div>
              <button className="btn" style={{ marginTop: 6 }} disabled={busy || view.disabled} onClick={() => run("Disable Connection", discoveryApi.disable)}>Disable Connection</button>
            </div>
          </div>

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
            <strong>Credential</strong> <span className="hint">(write-only: enter it here, it is encrypted on the server and never shown again.
              It is only ever sent to the address and certificate it was entered for.)</span>
            {!view.credentialBound && <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>The AIS address or certificate changed
              since the password was entered. Enter the password again for the new address; until then nothing is sent.</div>}
            <div className="grid halves">
              <input type="text" autoComplete="off" placeholder="JDE user" value={username} onChange={(e) => setUsername(e.target.value)} aria-label="JDE user" />
              <input type="password" autoComplete="new-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="JDE password" />
            </div>
            <button className="btn" style={{ marginTop: 6 }} disabled={busy || !username || !password}
              onClick={() => run(view.credentialConfigured ? "Replace credential" : "Save credential", async () => {
                const r = await discoveryApi.saveCredential(username, password, view.revision);
                setPassword("");
                return r;
              })}>{view.credentialConfigured ? "Replace credential" : "Save credential"}</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="stack" style={{ marginTop: 16 }}>
          <p className="hint"><strong>1. Save</strong> stores a new profile revision on the backend and does not contact JDE. Any change except
            the connection name and the contact names switches discovery off until it is re-tested and enabled again.</p>

          <fieldset><legend>Connection</legend>
            <div className="grid halves">
              <label className="field">Connection name<input aria-label="Connection name" value={form.connectionName} onChange={(e) => set("connectionName", e.target.value)} placeholder="e.g. BicycleWorks PS920 trial" /></label>
              <label className="field">Company<input value={company} disabled /></label>
            </div>
            <div role="radiogroup" aria-label="Connection mode" style={{ marginTop: 6 }}>
              {isDemo && <label style={{ display: "block", fontWeight: 400 }}><input type="radio" checked={form.connectionMode === "simulation"} onChange={() => set("connectionMode", "simulation")} />{" "}
                <strong>Simulation</strong> (demo customers only) -- Jade's simulated AIS endpoint; nothing leaves the backend; results are labelled SIMULATION.</label>}
              <label style={{ display: "block", fontWeight: 400 }}><input type="radio" checked={form.connectionMode === "live"} onChange={() => set("connectionMode", "live")} />{" "}
                <strong>Live</strong> -- the customer's AIS server, read-only. There is no fallback to simulation.
                {!view.liveAllowedByDeployment && <span className="badge warn"> live access unavailable -- see Connectivity</span>}</label>
            </div>
          </fieldset>

          <fieldset><legend>Endpoint and environment</legend>
            <label className="field">AIS HTTPS address <span className="hint">(https://host[:port][/proxy-prefix] -- Jade appends /jderest/…; no credentials in the address)</span>
              <input aria-label="AIS HTTPS address" value={form.aisBaseUrl} onChange={(e) => set("aisBaseUrl", e.target.value)} placeholder="https://ais.customer.example:9302" /></label>
            <div className="hint">Jade sends requests only to this address. Changing it means the JDE password must be entered again.</div>
            <CertificateEditor selected={form.caCertificateSha256} initial={view.certificate} aisUrl={form.aisBaseUrl}
              onSelect={(sha) => set("caCertificateSha256", sha)} />
            <div className="grid halves">
              <label className="field">JDE environment (exact name) <span className="hint">(compared exactly with what the session reports; never aliased)</span><input aria-label="JDE environment" value={form.environment} onChange={(e) => set("environment", e.target.value)} placeholder="e.g. JPS920" /></label>
              <label className="field">Environment purpose <span className="hint">(stated by the customer; never inferred from the name)</span>
                <select aria-label="Environment purpose" value={form.environmentPurpose} onChange={(e) => set("environmentPurpose", e.target.value as JdeProfileConfig["environmentPurpose"])}>
                  <option value="development">Development</option>
                  <option value="isolated_trial">Isolated trial environment, explicitly approved for this trial</option>
                </select></label>
              {form.environmentPurpose === "isolated_trial" && (
                <label className="field">Trial approval reference <span className="hint">(who approved using this environment, and where)</span>
                  <input aria-label="Trial approval reference" value={form.trialApprovalReference} onChange={(e) => set("trialApprovalReference", e.target.value)} placeholder="e.g. e-mail from the customer's IT lead, 2026-09-25" /></label>)}
              <label className="field">JDE role (explicit)<input aria-label="JDE role" value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="dedicated role, e.g. JADEREAD -- never *ALL" /></label>
              <label className="field">Application release<input aria-label="Application release" value={form.expectedApplicationRelease} onChange={(e) => set("expectedApplicationRelease", e.target.value)} placeholder="9.2" /></label>
              <label className="field">Tools / server release<input aria-label="Tools release" value={form.expectedToolsRelease} onChange={(e) => set("expectedToolsRelease", e.target.value)} placeholder="9.2.8.2" /></label>
              <label className="field">Path code <span className="hint">(optional; never derived from the environment name -- JDE's F00941 read establishes it)</span><input aria-label="Path code" value={form.pathCode} onChange={(e) => set("pathCode", e.target.value)} placeholder="leave blank until JDE reports it" /></label>
            </div>
          </fieldset>

          <fieldset><legend>Authentication</legend>
            <label className="field">Method
              <select aria-label="Authentication method" value={form.authMethod} onChange={(e) => set("authMethod", e.target.value as JdeProfileConfig["authMethod"])}>
                {view.authMethods.map((m) => <option key={m.id} value={m.id} disabled={!m.supported}>{m.label}{m.supported ? "" : " -- not supported"}</option>)}
              </select></label>
            <ul className="hint">{view.authMethods.map((m) => <li key={m.id}><strong>{m.label}</strong>: {m.supported ? "supported. " : "not supported. "}{m.detail}</li>)}</ul>
            <div className="hint">The JDE user and password are entered separately under Credential, after saving.</div>
          </fieldset>

          <fieldset><legend>Contacts and network access</legend>
            <div className="grid halves">
              <label className="field">Customer contact<input aria-label="Customer contact" value={form.customerContact} onChange={(e) => set("customerContact", e.target.value)} /></label>
              <label className="field">CNC contact<input aria-label="CNC contact" value={form.cncContact} onChange={(e) => set("cncContact", e.target.value)} /></label>
            </div>
            <label className="field">Network access notes <span className="hint">(e.g. "VPN from the backend machine to ais.customer.example:9302")</span>
              <input aria-label="Network access notes" value={form.networkRoute} onChange={(e) => set("networkRoute", e.target.value)} /></label>
          </fieldset>

          <fieldset><legend>Customer confirmations and evidence</legend>
            <label className="field">Routing and isolation evidence<textarea aria-label="Isolation evidence" value={form.isolationEvidence} onChange={(e) => set("isolationEvidence", e.target.value)} /></label>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Routing and isolation confirmed" checked={form.routingIsolationConfirmed} onChange={(e) => set("routingIsolationConfirmed", e.target.checked)} />The customer/CNC has confirmed the route reaches only this environment and it is isolated</label>
            <label className="field">Privilege statement<textarea aria-label="Privilege statement" value={form.privilegeStatement} onChange={(e) => set("privilegeStatement", e.target.value)} /></label>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Privilege confirmed" checked={form.privilegeConfirmed} onChange={(e) => set("privilegeConfirmed", e.target.checked)} />The customer has confirmed this JDE identity is narrowly privileged (read-only)</label>
            <label className="field">Runtime attestation <span className="hint">(AIS does not report the Tools release or path code a session runs on; record the CNC's statement)</span>
              <textarea aria-label="Runtime attestation" value={form.runtimeAttestationEvidence} onChange={(e) => set("runtimeAttestationEvidence", e.target.value)} placeholder="CNC (name, ticket): PS920 runs path code PS920 on Tools 9.2.x" /></label>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Runtime attested" checked={form.runtimeAttestationConfirmed} onChange={(e) => set("runtimeAttestationConfirmed", e.target.checked)} />The CNC has attested the Tools release and path code for this environment</label>
            <div className="field">Linked evidence documents <span className="hint">(import them below under Technical baseline as reference documents)</span>
              {documents.length === 0 ? <div className="notstated">No reference documents imported yet.</div> : documents.map((d) => {
                const ref = `${d.artifactId}@r${d.revision}`;
                return (
                  <label key={ref} style={{ display: "block", fontWeight: 400 }}>
                    <input type="checkbox" checked={form.evidenceArtifactIds.includes(ref)} onChange={(e) => set("evidenceArtifactIds",
                      e.target.checked ? [...form.evidenceArtifactIds, ref] : form.evidenceArtifactIds.filter((x) => x !== ref))} />{" "}
                    <span className="mono">{ref}</span> {String(d.meta.title || d.meta.file_name || "")}
                  </label>);
              })}
            </div>
          </fieldset>

          <fieldset><legend>Dedicated JDE account (the customer-side security boundary)</legend>
            <div className="hint">Readiness needs a dedicated user and a dedicated non-*ALL role whose JDE permissions were independently verified
              to permit the approved reads and reject prohibited operations, with the verification record linked. A CNC statement or a
              "read-only" label alone is not proof. Jade's own read restrictions are additional, not a substitute.</div>
            <div className="grid halves">
              <label className="field">Verified JDE user<input aria-label="Verified JDE user" value={form.dedicatedAccount.username} onChange={(e) => setAcc({ username: e.target.value })} /></label>
              <label className="field">Verified role<input aria-label="Verified role" value={form.dedicatedAccount.role} onChange={(e) => setAcc({ role: e.target.value })} placeholder="the configured role, never *ALL" /></label>
              <label className="field">Verified by<input aria-label="Verified by" value={form.dedicatedAccount.verifiedBy} onChange={(e) => setAcc({ verifiedBy: e.target.value })} /></label>
              <label className="field">Verified on<input aria-label="Verified on" type="date" value={form.dedicatedAccount.verifiedOn} onChange={(e) => setAcc({ verifiedOn: e.target.value })} /></label>
              <label className="field">Verification method
                <select aria-label="Verification method" value={form.dedicatedAccount.method} onChange={(e) => setAcc({ method: e.target.value as JdeProfileConfig["dedicatedAccount"]["method"] })}>
                  <option value="">choose…</option>
                  <option value="security_configuration_review">Review of the JDE security configuration (e.g. Security Workbench export)</option>
                  <option value="prohibited_operation_test">Test: the approved reads work and prohibited operations are rejected by JDE</option>
                </select></label>
              <label className="field">Notes<input aria-label="Verification notes" value={form.dedicatedAccount.notes} onChange={(e) => setAcc({ notes: e.target.value })} /></label>
            </div>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Permits approved reads" checked={form.dedicatedAccount.permitsApprovedReads} onChange={(e) => setAcc({ permitsApprovedReads: e.target.checked })} />JDE permits the approved reads for this user and role</label>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Rejects prohibited operations" checked={form.dedicatedAccount.rejectsProhibitedOperations} onChange={(e) => setAcc({ rejectsProhibitedOperations: e.target.checked })} />JDE rejects prohibited operations (writes, UBEs, other tables) for this user and role</label>
            <DocChooser label="Verification evidence documents" documents={documents} selected={form.dedicatedAccount.evidenceArtifactIds} onChange={(ids) => setAcc({ evidenceArtifactIds: ids })} />
          </fieldset>

          <fieldset><legend>Network restriction</legend>
            <div className="grid halves">
              <label className="field">Backend source address <span className="hint">(the address JDE sees requests come from)</span><input aria-label="Backend source address" value={form.networkRestriction.backendSourceAddress} onChange={(e) => setNet({ backendSourceAddress: e.target.value })} /></label>
              <label className="field">Evidence<input aria-label="Network restriction evidence" value={form.networkRestriction.evidence} onChange={(e) => setNet({ evidence: e.target.value })} placeholder="e.g. firewall rule allowing the AIS port from that address only" /></label>
            </div>
            <label style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="checkbox" aria-label="Restricted to source" checked={form.networkRestriction.restrictedToSource} onChange={(e) => setNet({ restrictedToSource: e.target.checked })} />AIS access is restricted to that source address</label>
            <DocChooser label="Network evidence documents" documents={documents} selected={form.networkRestriction.evidenceArtifactIds} onChange={(ids) => setNet({ evidenceArtifactIds: ids })} />
          </fieldset>

          <fieldset><legend>Approved discovery reads</legend>
            <ReadsEditor reads={form.approvedReads} onChange={(r) => set("approvedReads", r)} view={view} />
          </fieldset>

          <fieldset><legend>Authorisation window, limits and data sharing</legend>
            <div className="grid halves">
              <label className="field">Window starts<input aria-label="Window starts" type="datetime-local" value={localInput(form.discoveryWindow?.startsAt)}
                onChange={(e) => set("discoveryWindow", { startsAt: new Date(e.target.value).toISOString(), endsAt: form.discoveryWindow?.endsAt ?? new Date().toISOString() })} /></label>
              <label className="field">Window ends <span className="hint">(at most {view.ceilings.max_window_days} days)</span><input aria-label="Window ends" type="datetime-local" value={localInput(form.discoveryWindow?.endsAt)}
                onChange={(e) => set("discoveryWindow", { startsAt: form.discoveryWindow?.startsAt ?? new Date().toISOString(), endsAt: new Date(e.target.value).toISOString() })} /></label>
              <label className="field">Records per query (max {view.ceilings.max_records})<input aria-label="Records per query" type="number" min={1} max={view.ceilings.max_records} value={form.limits.maxRecords} onChange={(e) => set("limits", { ...form.limits, maxRecords: Number(e.target.value) })} /></label>
              <label className="field">Request timeout, seconds (max {view.ceilings.max_timeout_seconds})<input aria-label="Request timeout" type="number" min={1} max={view.ceilings.max_timeout_seconds} value={form.limits.timeoutSeconds} onChange={(e) => set("limits", { ...form.limits, timeoutSeconds: Number(e.target.value) })} /></label>
              <label className="field">Customer data in external AI prompts
                <select aria-label="Customer data in AI prompts" value={form.dataSharingPolicy} onChange={(e) => set("dataSharingPolicy", e.target.value as DataSharingPolicy)}>
                  <option value="metadata_only">Metadata only (values and artifact content withheld)</option>
                  <option value="configuration_and_artifacts">Configuration values and artifacts; business data withheld</option>
                  <option value="full">Full values (the customer has agreed)</option>
                </select>
              </label>
            </div>
          </fieldset>
          <div className="btnrow">
            <button className="btn primary" disabled={busy} onClick={() => run("Save", async () => {
              const r = await discoveryApi.saveProfile(form, view.configured ? view.revision : null);
              setEditing(false);
              return r;
            })}>Save</button>
            <button className="btn" onClick={() => { setEditing(false); load(); }}>Cancel</button>
          </div>
        </div>
      )}

      {message && <div className="callout" role="status" style={{ marginTop: 12, borderColor: message.tone === "stop" ? "var(--stop)" : undefined }}>{message.text}</div>}

      <TechnicalBaseline />

      <div style={{ marginTop: 16 }}>
        <strong>Discovery activity</strong> <span className="hint">(sanitised: time, profile revision, mode, operation, target, outcome and reason -- permitted and blocked requests; never credentials, tokens, filter values or business payloads)</span>
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
      <ApiNote endpoint="GET/PUT /admin/jde/profile, PUT /admin/jde/credential, POST /admin/jde/test-connection|sample-read/preview|sample-read|enable|disable, GET /admin/jde/activity" />
    </section>
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
