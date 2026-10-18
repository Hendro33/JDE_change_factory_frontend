import { useEffect, useState } from "react";
import { discoveryApi, type DataSharingPolicy, type JdeProfileConfig, type JdeProfileView } from "../services/discoveryApi";
import { executionApi, type ExecutionConfig, type ExecutionView } from "../services/executionApi";
import { saveErrorMessage } from "../services/saveErrors";
import { CertificateEditor, JdeDiscoveryPanel } from "./JdeDiscoveryPanel";
import { Details } from "./design";
import { Loading } from "./ui";

/**
 * Administration > Systems & Connections > JD Edwards.
 *
 * What Jade's agents need to work in the customer's JD Edwards, on one form:
 * where AIS and the web client are, which environment, and three JD Edwards
 * users -- one that only reads (the Architect's research and every before /
 * after check), one that makes changes through AIS, and one for the web
 * client and Web OMW (optional; the change user is used without it).
 * Save, then Test: the agents can use the connection as soon as the test
 * passes. Customer assurance, read restrictions and limits are optional and
 * live in the collapsed section below.
 */

type UserRow = { user: string; role: string; password: string };
type Form = {
  aisBaseUrl: string; caCertificateSha256: string; environment: string; pathCode: string;
  webClientUrl: string; webOmwUrl: string; webCaCertificateSha256: string;
  read: UserRow; change: UserRow; browser: UserRow;
  dataSharingPolicy: DataSharingPolicy;
};

const SHARING: { id: DataSharingPolicy; label: string }[] = [
  { id: "configuration_and_artifacts", label: "Configuration values and documents; business data hidden" },
  { id: "full", label: "Everything it reads (test systems / customer agreed)" },
  { id: "metadata_only", label: "Names and structure only; no values" },
];

function newConfig(f: Form, existing?: JdeProfileConfig | null): JdeProfileConfig {
  const base: JdeProfileConfig = existing ?? {
    connectionName: "", connectionMode: "live", aisBaseUrl: "", environment: "", environmentPurpose: "development",
    trialApprovalReference: "", role: "", expectedApplicationRelease: "", expectedToolsRelease: "", pathCode: "",
    caCertificateSha256: "", authMethod: "ais_token_request", customerContact: "", cncContact: "", networkRoute: "",
    isolationEvidence: "", routingIsolationConfirmed: false, privilegeStatement: "", privilegeConfirmed: false,
    runtimeAttestationConfirmed: false, runtimeAttestationEvidence: "", evidenceArtifactIds: [], approvedReads: [],
    dedicatedAccount: { username: "", role: "", verifiedBy: "", verifiedOn: "", method: "", permitsApprovedReads: false,
      rejectsProhibitedOperations: false, evidenceArtifactIds: [], notes: "" },
    networkRestriction: { backendSourceAddress: "", restrictedToSource: false, evidence: "", evidenceArtifactIds: [] },
    limits: { maxRecords: 10, timeoutSeconds: 15, concurrentRequests: 1 },
    dataSharingPolicy: "configuration_and_artifacts",
  };
  return {
    ...base, connectionMode: "live", aisBaseUrl: f.aisBaseUrl.trim(), caCertificateSha256: f.caCertificateSha256,
    environment: f.environment.trim(), pathCode: f.pathCode.trim(), role: f.read.role.trim(),
    dataSharingPolicy: f.dataSharingPolicy,
  };
}

function formFrom(p: JdeProfileView | null, e: ExecutionView | null): Form {
  const c = p?.config;
  const x = e?.config;
  return {
    aisBaseUrl: c?.aisBaseUrl ?? "https://", caCertificateSha256: c?.caCertificateSha256 ?? "",
    environment: c?.environment ?? "", pathCode: c?.pathCode ?? "",
    webClientUrl: x?.webClientUrl ?? "", webOmwUrl: x?.webOmwUrl ?? "", webCaCertificateSha256: x?.webCaCertificateSha256 ?? "",
    read: { user: "", role: c?.role ?? "", password: "" },
    change: { user: "", role: x?.writeRole ?? "", password: "" },
    browser: { user: "", role: x?.browserRole ?? "", password: "" },
    dataSharingPolicy: c?.dataSharingPolicy ?? "configuration_and_artifacts",
  };
}

const tone: Record<string, string> = { ok: "ok", failed: "stop", unknown: "grey", stale: "warn" };

export function JdeConnectionSetup() {
  const [profile, setProfile] = useState<JdeProfileView | null>(null);
  const [exec, setExec] = useState<ExecutionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(formFrom(null, null));
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testRows, setTestRows] = useState<{ label: string; state: string; detail: string }[] | null>(null);
  const [advancedKey, setAdvancedKey] = useState(0);

  const load = async () => {
    try {
      const [p, e] = await Promise.all([discoveryApi.getProfile(), executionApi.get()]);
      setProfile(p); setExec(e); setLoadError(null);
      return [p, e] as const;
    } catch (err) {
      setLoadError(saveErrorMessage(err, "Could not load the JD Edwards connection."));
      return null;
    }
  };
  useEffect(() => { load().then((r) => { if (r) { setForm(formFrom(r[0], r[1])); if (!r[0].configured) setEditing(true); } }); }, []);

  if (loadError) {
    return (
      <section className="panel">
        <h2>JD Edwards</h2>
        <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}><strong>Could not load</strong>{loadError}</div>
        <button className="btn" onClick={() => load()}>Try again</button>
      </section>
    );
  }
  if (!profile || !exec) return <Loading what="the JD Edwards connection" />;

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setUser = (k: "read" | "change" | "browser", patch: Partial<UserRow>) => set({ [k]: { ...form[k], ...patch } } as Partial<Form>);

  async function save() {
    setMessage(null);
    const f = form;
    for (const [k, label] of [["read", "read user"], ["change", "change user"], ["browser", "web client user"]] as const) {
      const u = f[k];
      if (u.user.trim() && !u.password) return setMessage({ ok: false, text: `Nothing was saved: enter the ${label}'s password as well.` });
      if (!u.user.trim() && u.password) return setMessage({ ok: false, text: `Nothing was saved: enter the ${label}'s JD Edwards user name as well.` });
    }
    if (!f.read.user.trim() && !profile!.credentialConfigured) return setMessage({ ok: false, text: "Nothing was saved: the read user and password are needed." });
    if (!f.change.user.trim() && !exec!.writeUserConfigured) return setMessage({ ok: false, text: "Nothing was saved: the change user and password are needed." });
    const users = [f.read.user, f.change.user, f.browser.user].map((u) => u.trim().toUpperCase()).filter(Boolean);
    if (f.read.user.trim() && users.filter((u) => u === f.read.user.trim().toUpperCase()).length > 1) {
      return setMessage({ ok: false, text: "Nothing was saved: the read user must be a different JD Edwards user from the change and web client users." });
    }
    setBusy("save");
    const done: string[] = [];
    try {
      let p = await discoveryApi.saveProfile(newConfig(f, profile!.config), profile!.configured ? profile!.revision : null);
      done.push("connection");
      if (f.read.user.trim()) { p = await discoveryApi.saveCredential(f.read.user.trim(), f.read.password, p.revision); done.push(`read user ${f.read.user.trim()}`); }
      const xc: ExecutionConfig = { ...(exec!.config), webClientUrl: f.webClientUrl.trim(), webOmwUrl: f.webOmwUrl.trim(),
        webCaCertificateSha256: f.webCaCertificateSha256, writeRole: f.change.role.trim(), browserRole: f.browser.role.trim() };
      let e = await executionApi.save(xc, exec!.configured ? exec!.revision : null);
      done.push("web client");
      if (f.change.user.trim()) { e = await executionApi.saveWriteUser(f.change.user.trim(), f.change.password, e.revision); done.push(`change user ${f.change.user.trim()}`); }
      if (f.browser.user.trim()) { e = await executionApi.saveBrowserUser(f.browser.user.trim(), f.browser.password, e.revision); done.push(`web client user ${f.browser.user.trim()}`); }
      const fresh = await load();
      if (fresh) setForm(formFrom(fresh[0], fresh[1]));
      setEditing(false); setTestRows(null); setAdvancedKey((k) => k + 1);
      setMessage({ ok: true, text: `Saved: ${done.join(", ")}. Passwords are stored encrypted and not shown again. Next: Test.` });
    } catch (err) {
      await load();
      setMessage({ ok: false, text: `${done.length ? `Saved ${done.join(", ")}; then stopped: ` : "Nothing was saved: "}${saveErrorMessage(err, "refused")}` });
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test"); setMessage(null); setTestRows(null);
    const rows: { label: string; state: string; detail: string }[] = [];
    try {
      const r = await discoveryApi.testConnection();
      rows.push({ label: "Read user signs in to AIS (environment, role, path code)", state: r.outcome === "ok" ? "ok" : "failed", detail: r.detail });
    } catch (err) {
      rows.push({ label: "Read user signs in to AIS", state: "failed", detail: saveErrorMessage(err, "refused") });
    }
    try {
      const r = await executionApi.test();
      const a = r.results.ais_write_sign_in;
      const w = r.results.web_client;
      if (a) rows.push({ label: "Change user signs in to AIS", state: a.state, detail: a.detail });
      if (w) rows.push({ label: "Web client user signs in to the web client", state: w.state, detail: w.detail });
    } catch (err) {
      rows.push({ label: "Change user and web client", state: "failed", detail: saveErrorMessage(err, "refused") });
    }
    setTestRows(rows);
    await load();
    setAdvancedKey((k) => k + 1);
    setBusy("");
  }

  const c = profile.config;
  const ready = profile.discoveryEnabled;
  const aisRoute = exec.routes.ais;
  const browserRoute = exec.routes.browser;
  const pcItem = (profile.readiness[0]?.items ?? []).find((i) => i.id === "path_code");
  const pcFromJde = pcItem?.satisfied ? (/path code '([^']+)'/.exec(pcItem.detail)?.[1] ?? "") : "";

  return (
    <section className="panel" aria-label="JD Edwards connection">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>JD Edwards</h2>
        {!editing && <div className="btnrow" style={{ margin: 0 }}>
          <button className="btn" onClick={() => { setForm(formFrom(profile, exec)); setEditing(true); setMessage(null); }}>Edit</button>
          <button className="btn primary" disabled={!!busy || !profile.configured} onClick={test}>{busy === "test" ? "Testing…" : "Test"}</button>
        </div>}
      </div>
      <div className="sub" style={{ margin: "6px 0 12px" }}>
        How Jade's agents reach this customer's JD Edwards. The read user is used for research and for every before/after check;
        the change user makes approved changes through AIS; the web client user works in the web client and Web OMW.
        Requests come from the machine running Jade's backend.
      </div>

      {message && <div className="callout" role="status" style={{ marginBottom: 12, borderColor: message.ok ? undefined : "var(--stop)" }}>{message.text}</div>}

      {!editing && profile.configured && c && (
        <>
          <div style={{ marginBottom: 12 }}>
            <span className={`badge ${ready ? "ok" : "stop"}`} style={{ fontSize: 13 }}>{ready ? "Agents can use this connection" : "Not ready"}</span>
            {!ready && profile.connectionStatus && profile.connectionStatus.state !== "not_tested" && (
              <span className="hint"> {profile.connectionStatus.label}{profile.connectionStatus.detail ? `: ${profile.connectionStatus.detail}` : ""}</span>)}
            {!ready && profile.enableBlockers.length > 0 && <ul className="hint" style={{ margin: "6px 0 0" }}>{profile.enableBlockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          </div>
          <dl className="facts">
            <dt>AIS server</dt><dd className="mono">{c.aisBaseUrl}{c.caCertificateSha256 ? <span className="hint"> · own certificate uploaded</span> : null}</dd>
            <dt>Environment</dt><dd className="mono">{c.environment}{" · path code "}{c.pathCode || (pcFromJde ? <>{pcFromJde} <span className="hint">(read from JD Edwards)</span></> : <span className="notstated">read from JD Edwards when you Test</span>)}</dd>
            <dt>Web client</dt><dd className="mono">{exec.config.webClientUrl || <span className="notstated">not set</span>}{exec.config.webOmwUrl ? ` · Web OMW ${exec.config.webOmwUrl}` : ""}</dd>
            <dt>Read user</dt><dd><span className="mono">{profile.credentialUsernameMasked ?? "—"}</span> · role <span className="mono">{c.role}</span></dd>
            <dt>Change user</dt><dd><span className="mono">{exec.writeUserMasked ?? "—"}</span> · role <span className="mono">{exec.config.writeRole || c.role}</span></dd>
            <dt>Web client user</dt><dd>{exec.browserUserConfigured
              ? <><span className="mono">{exec.browserUserMasked}</span> · role <span className="mono">{exec.config.browserRole || exec.config.writeRole || c.role}</span></>
              : <span className="hint">same as the change user</span>}</dd>
            <dt>What the AI may see</dt><dd>{SHARING.find((s) => s.id === c.dataSharingPolicy)?.label ?? c.dataSharingPolicy}</dd>
          </dl>
          <table className="data" style={{ marginTop: 12 }} aria-label="Agent routes">
            <thead><tr><th>Agents</th><th>Ready</th><th>Detail</th></tr></thead>
            <tbody>
              <tr><td>Research and before/after checks (read user)</td><td><span className={`badge ${ready ? "ok" : "grey"}`}>{ready ? "Ready" : "Not ready"}</span></td><td className="hint">{ready ? profile.health.environment?.detail : (profile.enableBlockers[0] ?? "")}</td></tr>
              <tr><td>Changes through AIS (change user)</td><td><span className={`badge ${aisRoute?.ready ? "ok" : "grey"}`}>{aisRoute?.ready ? "Ready" : "Not ready"}</span></td><td className="hint">{aisRoute?.detail}</td></tr>
              <tr><td>Changes in the web client (web client user)</td><td><span className={`badge ${browserRoute?.ready ? "ok" : "grey"}`}>{browserRoute?.ready ? "Ready" : "Not ready"}</span></td><td className="hint">{browserRoute?.detail}</td></tr>
            </tbody>
          </table>
          {!exec.browserAvailable && <div className="hint">Browser on Jade's server: {exec.browserDetail}</div>}
          {testRows && (
            <table className="data" style={{ marginTop: 12 }} aria-label="Test results">
              <thead><tr><th>Test</th><th>Result</th><th>Detail</th></tr></thead>
              <tbody>{testRows.map((t) => (
                <tr key={t.label}><td>{t.label}</td><td><span className={`badge ${tone[t.state] ?? "grey"}`}>{t.state}</span></td><td style={{ fontSize: 13 }}>{t.detail}</td></tr>
              ))}</tbody>
            </table>
          )}
          <div className="hint" style={{ marginTop: 6 }}>Test signs each user in and out; nothing is changed in JD Edwards. Agent execution can be switched off under Governance › Agent execution.</div>
        </>
      )}

      {editing && (
        <div className="stack">
          <fieldset><legend>Where</legend>
            <div className="field"><label htmlFor="jde-ais">AIS server address</label>
              <input id="jde-ais" type="text" value={form.aisBaseUrl} onChange={(e) => set({ aisBaseUrl: e.target.value })} placeholder="https://141.144.202.25:7077" />
              <span className="hint">https://host:port — Jade adds /jderest itself (an address ending in /jderest is fine too).</span></div>
            <CertificateEditor selected={form.caCertificateSha256} initial={profile.certificate} aisUrl={form.aisBaseUrl}
              onSelect={(sha) => set({ caCertificateSha256: sha })} />
            <div className="grid halves">
              <div className="field"><label htmlFor="jde-env">Environment</label>
                <input id="jde-env" type="text" value={form.environment} onChange={(e) => set({ environment: e.target.value.toUpperCase() })} placeholder="JPY920" />
                <span className="hint">Exactly as in JD Edwards. Every user signs in to this environment.</span></div>
              <div className="field"><label htmlFor="jde-pc">Path code <span className="hint">(optional)</span></label>
                <input id="jde-pc" type="text" value={form.pathCode} onChange={(e) => set({ pathCode: e.target.value.toUpperCase() })} placeholder="read from JD Edwards when you Test" /></div>
              <div className="field"><label htmlFor="jde-web">Web client address</label>
                <input id="jde-web" type="text" value={form.webClientUrl} onChange={(e) => set({ webClientUrl: e.target.value })} placeholder="https://141.144.202.25:8080/jde" />
                <span className="hint">Needed for changes AIS cannot make (processing options, data selection).</span></div>
              <div className="field"><label htmlFor="jde-omw">Web OMW address <span className="hint">(only if different)</span></label>
                <input id="jde-omw" type="text" value={form.webOmwUrl} onChange={(e) => set({ webOmwUrl: e.target.value })} /></div>
            </div>
            <CertificateEditor label="Web client certificate" selected={form.webCaCertificateSha256} aisUrl={form.webClientUrl}
              onSelect={(sha) => set({ webCaCertificateSha256: sha })} />
          </fieldset>

          <fieldset><legend>JD Edwards users</legend>
            <table className="data" aria-label="JD Edwards users">
              <thead><tr><th>Used for</th><th>JD Edwards user</th><th>Role</th><th>Password</th></tr></thead>
              <tbody>
                {([
                  ["read", "Reading: research and before/after checks", profile.credentialUsernameMasked, "JADE_READ", "JADEREAD"],
                  ["change", "Changes through AIS", exec.writeUserMasked, "JADE_EXEC", "JADEEXEC"],
                  ["browser", "Web client and Web OMW (optional)", exec.browserUserMasked, "JADE_UI", "JADEUI"],
                ] as const).map(([k, label, saved, phUser, phRole]) => (
                  <tr key={k}>
                    <td>{label}{saved && <div className="hint">saved: <span className="mono">{saved}</span></div>}</td>
                    <td><input type="text" autoComplete="off" aria-label={`${label}: user`} value={form[k].user}
                      onChange={(e) => setUser(k, { user: e.target.value.toUpperCase() })} placeholder={saved ? "keep saved user" : phUser} /></td>
                    <td><input type="text" aria-label={`${label}: role`} value={form[k].role}
                      onChange={(e) => setUser(k, { role: e.target.value.toUpperCase() })} placeholder={k === "read" ? phRole : k === "change" ? `${phRole} (blank = read role)` : `${phRole} (blank = change role)`} /></td>
                    <td><input type="password" autoComplete="new-password" aria-label={`${label}: password`} value={form[k].password}
                      onChange={(e) => setUser(k, { password: e.target.value })} placeholder={saved ? "keep saved password" : ""} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint">Leave a user and password blank to keep what is saved. To change a user, enter the user and its password.
              Without a separate web client user, the change user signs in to the web client. Roles are JD Edwards roles, never *ALL.</div>
          </fieldset>

          <fieldset><legend>What the AI may see of the data it reads</legend>
            <select aria-label="What the AI may see" value={form.dataSharingPolicy} onChange={(e) => set({ dataSharingPolicy: e.target.value as DataSharingPolicy })}>
              {SHARING.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </fieldset>

          <div className="btnrow">
            <button className="btn primary" disabled={!!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</button>
            {profile.configured && <button className="btn" disabled={!!busy} onClick={() => { setEditing(false); setMessage(null); setForm(formFrom(profile, exec)); }}>Cancel</button>}
          </div>
          <div className="hint">Saving does not contact JD Edwards. Changing the address, environment, a role or a user means running Test again.</div>
        </div>
      )}

      {profile.configured && (
        <div style={{ marginTop: 16 }}>
          <Details summary="Optional: customer assurance, read restrictions, limits and activity">
            <JdeDiscoveryPanel key={advancedKey} onChanged={() => load()} />
          </Details>
        </div>
      )}
    </section>
  );
}
