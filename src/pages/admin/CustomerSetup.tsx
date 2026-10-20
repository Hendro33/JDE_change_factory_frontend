import { useEffect, useState } from "react";
import { api } from "../../services/api";
import {
  DEFAULT_DASHBOARD_THRESHOLDS,
  clearLegacyLocalThresholds,
  readLegacyLocalThresholds,
} from "../../services/dashboardThresholds";
import { saveErrorMessage } from "../../services/saveErrors";
import type { JdeEstateResult } from "../../services/api";
import type { CustomerInput, CustomerProfile, DashboardThresholds } from "../../types/domain";
import { Link } from "../../router";
import { Loading } from "../../components/ui";
import { useSessionInfo } from "../../components/design";

const EMPTY: CustomerInput = { name: "", shortName: "", toolsRelease: "", environment: "" };

/** Edit the active customer, or create a new one. Saved on the backend; Admin only. */
function CustomerEditor({ profile, isAdmin, onSaved }: { profile: CustomerProfile; isAdmin: boolean; onSaved: (p: CustomerProfile) => void }) {
  const c = profile.customer;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CustomerInput>({ name: c.name, shortName: c.shortName, toolsRelease: c.toolsRelease, environment: c.environment });
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CustomerInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const field = (label: string, v: CustomerInput, set: (x: CustomerInput) => void, k: keyof CustomerInput, placeholder = "") => (
    <label className="field">{label}<input aria-label={label} value={v[k]} placeholder={placeholder} onChange={(e) => set({ ...v, [k]: e.target.value })} /></label>
  );
  async function save() {
    setBusy(true); setError(null); setNote(null);
    try { onSaved(await api.updateCustomerProfile(form)); setEditing(false); setNote("Saved."); }
    catch (e) { setError(saveErrorMessage(e, "Could not save the customer.")); }
    finally { setBusy(false); }
  }
  async function create() {
    setBusy(true); setError(null);
    try { await api.createCustomer(draft); window.location.reload(); }
    catch (e) { setError(saveErrorMessage(e, "Could not create the customer.")); setBusy(false); }
  }
  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{c.name}</h2>
        {isAdmin && !editing && <div className="btnrow">
          <button className="btn" onClick={() => setEditing(true)}>Edit customer</button>
          <button className="btn" onClick={() => { setCreating(!creating); setDraft(EMPTY); }}>New customer</button>
        </div>}
      </div>
      {!editing ? (
        <dl className="facts">
          <dt>Customer id</dt><dd className="mono">{c.id}</dd>
          <dt>Short name</dt><dd>{c.shortName}</dd>
          <dt>JDE Tools Release</dt><dd>{c.toolsRelease || <span className="notstated">not stated</span>}</dd>
          <dt>JDE environment</dt><dd>{c.environment || <span className="notstated">not stated</span>}</dd>
          <dt>Last changed</dt><dd>{profile.updatedAt ? `${new Date(profile.updatedAt).toLocaleString("en-GB")} by ${profile.updatedBy}` : <span className="notstated">not changed since it was created</span>}</dd>
        </dl>
      ) : (
        <div className="stack">
          <div className="grid halves">
            {field("Customer name", form, setForm, "name")}
            {field("Short name", form, setForm, "shortName")}
            {field("JDE Tools Release", form, setForm, "toolsRelease", "e.g. 9.2.26.2")}
            {field("JDE environment", form, setForm, "environment", "e.g. JPS920")}
          </div>
          <div className="btnrow">
            <button className="btn primary" disabled={busy || !form.name.trim()} onClick={save}>Save customer</button>
            <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
      {creating && !editing && (
        <div className="callout" style={{ marginTop: 12 }}>
          <strong>New customer</strong>
          <div className="hint">A real customer: its JDE and Jira connections are live only. You become its Admin and it opens straight away.</div>
          <div className="grid halves">
            {field("New customer name", draft, setDraft, "name")}
            {field("New customer short name", draft, setDraft, "shortName")}
            {field("New customer Tools Release", draft, setDraft, "toolsRelease", "e.g. 9.2.26.2")}
            {field("New customer JDE environment", draft, setDraft, "environment", "e.g. JPS920")}
          </div>
          <div className="btnrow"><button className="btn primary" disabled={busy || !draft.name.trim()} onClick={create}>Create customer</button></div>
        </div>
      )}
      {error && <div className="callout" role="alert" style={{ borderColor: "var(--stop)", marginTop: 8 }}>{error}</div>}
      {note && <div className="hint" role="status">{note}</div>}
    </section>
  );
}

/** Where this customer's other configuration lives. */
function CustomerConfigLinks() {
  const links: [string, string, string][] = [
    ["Systems & Connections", "/admin/connections", "JD Edwards connection, Jira, test connections"],
    ["Governance", "/admin/governance", "Engagement scope, approval policy, DEV binding"],
    ["Business Model", "/admin/business-model", "Business domains, their owners and the process framework"],
    ["Agents & AI", "/admin/agents", "Which agents run for this customer, AI connection and configuration"],
    ["Users", "/admin/organisation/users", "Members, roles, invitations"],
    ["Stories", "/stories", "This customer's requests and stories"],
  ];
  return (
    <section className="panel">
      <h2>This customer's configuration</h2>
      <table className="data"><tbody>{links.map(([label, to, what]) => (
        <tr key={label}><td><Link to={to}>{label}</Link></td><td className="hint">{what}</td></tr>))}</tbody></table>
    </section>
  );
}

/**
 * Setting up a test customer: copy a working set-up from another customer,
 * read what the connected JD Edwards holds, or clear this customer's work.
 */
function CustomerTools({ profile }: { profile: CustomerProfile }) {
  const info = useSessionInfo();
  const others = info.session.customers.filter((c) => c.id !== profile.customer.id);
  const [source, setSource] = useState(others[0]?.id ?? "");
  const [moveJira, setMoveJira] = useState(true);
  const [confirm, setConfirm] = useState("");
  const [removeSample, setRemoveSample] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [estate, setEstate] = useState<JdeEstateResult | null>(null);

  async function run(what: string, fn: () => Promise<string>) {
    setBusy(what); setError(null); setDone(null);
    try { setDone(await fn()); } catch (e) { setError(saveErrorMessage(e, "Not done.")); } finally { setBusy(null); }
  }
  function download(md: string) {
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = `jde-estate-${profile.customer.shortName || "customer"}.md`; a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="panel" id="customer-tools">
      <h2>Set up this customer</h2>
      <div className="stack">
        <div>
          <h3 style={{ margin: "0 0 4px" }}>Copy the set-up from another customer</h3>
          <p className="hint" style={{ marginTop: 0 }}>Copies the JD Edwards connection (users, passwords, certificate), the engagement scope,
            agent switches and the AI connection. Afterwards, click Test once on the JD Edwards page.</p>
          {others.length === 0 ? <p className="notstated">You have no other customer to copy from.</p> : (
            <div className="btnrow">
              <select aria-label="Copy from" value={source} onChange={(e) => setSource(e.target.value)}>
                {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                <input type="checkbox" checked={moveJira} onChange={(e) => setMoveJira(e.target.checked)} />
                Move the Jira connection here (one Jira project serves one customer)</label>
              <button className="btn primary" disabled={!!busy || !source}
                onClick={() => run("copy", async () => {
                  const r = await api.copyCustomerSetup({ sourceCustomerId: source, moveJira });
                  return `Copied${r.jira_moved ? ", Jira connection moved" : ""}. ${r.next}`;
                })}>{busy === "copy" ? "Copying…" : "Copy set-up"}</button>
            </div>
          )}
        </div>
        <div>
          <h3 style={{ margin: "0 0 4px" }}>Read what JD Edwards holds</h3>
          <p className="hint" style={{ marginTop: 0 }}>Reads companies, branch plants, items, stock, customers, suppliers, line types and a few
            code lists (at most 10 rows each, read-only) and saves them as a reference document for this customer.</p>
          <div className="btnrow">
            <button className="btn primary" disabled={!!busy}
              onClick={() => run("estate", async () => {
                const r = await api.readJdeEstate(); setEstate(r);
                return `Saved as a reference document (${r.reads.filter((x) => x.rows).length} of ${r.reads.length} lists read).`;
              })}>{busy === "estate" ? "Reading JD Edwards…" : "Read JD Edwards"}</button>
            {estate && <button className="btn" onClick={() => download(estate.markdown)}>Download</button>}
          </div>
          {estate && (
            <table className="data" style={{ marginTop: 8 }}>
              <thead><tr><th>List</th><th>Source</th><th>Rows</th></tr></thead>
              <tbody>{estate.reads.map((r) => (
                <tr key={r.title}><td>{r.title}</td><td className="mono">{r.target}</td>
                  <td>{r.error ? <span className="badge warn" title={r.error}>not read</span> : r.rows}</td></tr>))}</tbody>
            </table>
          )}
        </div>
        <div className="callout" style={{ borderColor: "var(--stop)" }}>
          <h3 style={{ margin: "0 0 4px" }}>Clear this customer's work</h3>
          <p className="hint" style={{ marginTop: 0 }}>Removes every request, story, design, change, delivery record, as-built record and uploaded
            document of {profile.customer.name}. The settings stay: JD Edwards and Jira connections, engagement scope, agents,
            AI, process framework, business domains and people. This cannot be undone.</p>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
            <input type="checkbox" checked={removeSample} onChange={(e) => setRemoveSample(e.target.checked)} />
            Also remove the sample data set's fictional people and business domains</label>
          <div className="btnrow" style={{ marginTop: 6 }}>
            <input aria-label="Type the customer name to confirm" style={{ minWidth: 280 }} placeholder={`Type ${profile.customer.name} to confirm`} value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
            <button className="btn" disabled={!!busy || confirm.trim() !== profile.customer.name}
              onClick={() => run("clear", async () => {
                const r = await api.clearCustomerWork({ confirmName: confirm.trim(), removeSampleData: removeSample });
                setConfirm("");
                return `Cleared ${r.stories.length} stories` + (r.sample_people_deactivated.length
                  ? `; ${r.sample_people_deactivated.length} sample people and ${r.sample_domains_removed.length} sample domains removed.` : ".");
              })}>{busy === "clear" ? "Clearing…" : "Clear all work"}</button>
          </div>
        </div>
        {done && <div className="callout" role="status" style={{ borderColor: "var(--ok)" }}>{done}</div>}
        {error && <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}><strong>Not done</strong>{error}</div>}
      </div>
    </section>
  );
}

export function CustomerSetup() {
  const info = useSessionInfo();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const isAdmin = info.has("admin");
  // What the server holds (null until loaded) and the form's working copy.
  const [stored, setStored] = useState<DashboardThresholds | null>(null);
  const [warnAt, setWarnAt] = useState(DEFAULT_DASHBOARD_THRESHOLDS.warnAt);
  const [criticalAt, setCriticalAt] = useState(DEFAULT_DASHBOARD_THRESHOLDS.criticalAt);
  const [thresholdsError, setThresholdsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [legacy, setLegacy] = useState(readLegacyLocalThresholds);

  function applyStored(t: DashboardThresholds) {
    setStored(t);
    setWarnAt(t.warnAt);
    setCriticalAt(t.criticalAt);
  }

  function loadThresholds() {
    api
      .getDashboardThresholds()
      .then((t) => { applyStored(t); setThresholdsError(null); })
      .catch((e) => setThresholdsError(saveErrorMessage(e, "Could not load the report thresholds.")));
  }

  useEffect(() => {
    api.getCustomerProfile().then((p) => { setProfile(p); setProfileError(null); })
      .catch((e) => setProfileError(saveErrorMessage(e, "Could not load the customer profile.")));
    loadThresholds();
  }, []);

  async function saveThresholds(values: { warnAt: number; criticalAt: number }) {
    if (!stored) return;
    setSaving(true);
    setThresholdsError(null);
    try {
      applyStored(await api.updateDashboardThresholds({ ...values, expectedRevision: stored.revision }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (e) {
      setThresholdsError(saveErrorMessage(e, "Could not save the report thresholds."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function importLegacy() {
    if (!legacy) return;
    // Only offered while nothing is saved on the server; expectedRevision 0
    // means a value someone saved in the meantime is refused, not overwritten.
    if (await saveThresholds(legacy)) {
      clearLegacyLocalThresholds();
      setLegacy(null);
    }
  }

  function discardLegacy() {
    clearLegacyLocalThresholds();
    setLegacy(null);
  }

  const invalid = warnAt < 0 || criticalAt < 0 || criticalAt < warnAt;
  const dirty = !!stored && (warnAt !== stored.warnAt || criticalAt !== stored.criticalAt);
  const showLegacyImport = isAdmin && !!legacy && !!stored && !stored.configured;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Customer</h1>
          <div className="sub">The active customer's information, its configuration, and who can work on it.</div>
        </div>
      </div>

      {!profile ? (
        profileError
          ? <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}><strong>Could not load the customer profile</strong>{profileError}</div>
          : <Loading what="the customer profile" />
      ) : (
        <div className="stack">
          <CustomerEditor profile={profile} isAdmin={isAdmin} onSaved={setProfile} />
          <CustomerConfigLinks />
          {isAdmin && <CustomerTools profile={profile} />}

          <section className="panel">
            <h2>Members</h2>
            <div className="sub" style={{ marginBottom: 12 }}>
              Who can sign in to this customer and with which roles. Manage them under Users & roles.
            </div>
            <table className="data">
              <thead>
                <tr><th>Name</th><th>Identity id</th><th>Role</th></tr>
              </thead>
              <tbody>
                {profile.identities.map((i) => (
                  <tr key={i.id}>
                    <td>{i.displayName}</td>
                    <td className="mono">{i.id}</td>
                    <td>{i.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2>Report alert thresholds</h2>
            <div className="sub" style={{ marginBottom: 12 }}>
              When a count in Insights (stories waiting for a decision, or blocked) should draw attention — a count above the
              first value turns orange, above the second turns red. Saved for this company and shared
              by everyone who uses it; only an Admin can change them.
            </div>
            {showLegacyImport && legacy && (
              <div className="callout" style={{ marginBottom: 16 }}>
                <strong>Thresholds found in this browser</strong>
                An earlier version kept thresholds in this browser only: orange from {legacy.warnAt}, red
                from {legacy.criticalAt}. Nothing is saved for this company yet — import them to share them
                with everyone, or discard them.
                <div className="btnrow" style={{ marginTop: 8 }}>
                  <button className="btn" disabled={saving} onClick={importLegacy}>Import these values</button>
                  <button className="btn" disabled={saving} onClick={discardLegacy}>Discard</button>
                </div>
              </div>
            )}
            <div className="grid halves">
              <div className="field">
                <label htmlFor="warnAt">Orange from</label>
                <input
                  id="warnAt" type="number" min={0} disabled={!isAdmin || !stored}
                  value={warnAt}
                  onChange={(e) => setWarnAt(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="criticalAt">Red from</label>
                <input
                  id="criticalAt" type="number" min={0} disabled={!isAdmin || !stored}
                  value={criticalAt}
                  onChange={(e) => setCriticalAt(Number(e.target.value))}
                />
              </div>
            </div>
            {invalid && (
              <span className="hint" style={{ color: "var(--stop)" }}>
                Values must not be negative, and red must be at least orange.
              </span>
            )}
            {thresholdsError && (
              <div className="callout" style={{ borderColor: "var(--stop)", marginTop: 8 }}>
                <strong>Could not save</strong>
                {thresholdsError}
                <div className="btnrow" style={{ marginTop: 8 }}>
                  <button className="btn" onClick={loadThresholds}>Reload</button>
                </div>
              </div>
            )}
            <dl className="facts" style={{ marginTop: 8 }}>
              <dt>Last saved</dt>
              <dd>
                {stored?.configured && stored.updatedAt
                  ? `${new Date(stored.updatedAt).toLocaleString("en-GB")} by ${stored.updatedBy}`
                  : <span className="notstated">never — defaults in use</span>}
              </dd>
            </dl>
            {isAdmin ? (
              <div className="btnrow">
                <button className="btn primary" disabled={saving || invalid || !dirty} onClick={() => saveThresholds({ warnAt, criticalAt })}>
                  {saving ? "Saving…" : saved ? "Saved" : "Save thresholds"}
                </button>
                <button
                  className="btn"
                  disabled={saving}
                  onClick={() => { setWarnAt(DEFAULT_DASHBOARD_THRESHOLDS.warnAt); setCriticalAt(DEFAULT_DASHBOARD_THRESHOLDS.criticalAt); }}
                >
                  Reset form to defaults
                </button>
              </div>
            ) : (
              <p className="notstated">Only a company Admin can change these.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
