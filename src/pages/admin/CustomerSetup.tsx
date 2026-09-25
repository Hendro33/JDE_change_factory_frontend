import { useEffect, useState } from "react";
import { api } from "../../services/api";
import {
  DEFAULT_DASHBOARD_THRESHOLDS,
  clearLegacyLocalThresholds,
  readLegacyLocalThresholds,
} from "../../services/dashboardThresholds";
import { saveErrorMessage } from "../../services/saveErrors";
import type { CustomerInput, CustomerProfile, DashboardThresholds } from "../../types/domain";
import type { Navigate } from "../../types/nav";
import { ApiNote, Loading } from "../../components/ui";

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
        <h2 style={{ margin: 0 }}>{c.name} {c.isDemo && <span className="badge warn">DEMO customer — test data</span>}</h2>
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
          <dt>Kind</dt><dd>{c.isDemo ? "Demo customer: test data; simulated JDE allowed" : "Real customer: live connections only, nothing simulated"}</dd>
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
      <ApiNote endpoint="GET/PUT /admin/customer-profile, POST /admin/customers" />
    </section>
  );
}

/** Where this customer's other configuration lives. */
function CustomerConfigLinks({ onNavigate }: { onNavigate?: Navigate }) {
  const links: [string, Parameters<Navigate>[0], string][] = [
    ["Connected systems", "admin-integrations", "JD Edwards connection, Jira, test connections"],
    ["ERP / JDE Landscape", "admin-erp", "Engagement scope, approval policy, DEV binding"],
    ["Business Domains", "domains", "Domains and their owners"],
    ["Process Framework", "admin-process", "Process framework import and versions"],
    ["Agents", "admin-agents", "Which agents run for this customer"],
    ["Users", "admin-users", "Members, roles, invitations"],
    ["Requirements", "userstories", "This customer's requests"],
    ["User Stories", "userstories", "This customer's user stories"],
  ];
  return (
    <section className="panel">
      <h2>This customer's configuration</h2>
      <table className="data"><tbody>{links.map(([label, page, what]) => (
        <tr key={label}><td><button className="linkish" onClick={() => onNavigate?.(page, label === "Requirements" ? { view: "requests" } : label === "User Stories" ? { view: "all" } : undefined)}>{label}</button></td>
          <td className="hint">{what}</td></tr>))}</tbody></table>
    </section>
  );
}

export function CustomerSetup({ onNavigate }: { onNavigate?: Navigate }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
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
      .catch((e) => setThresholdsError(saveErrorMessage(e, "Could not load the dashboard thresholds.")));
  }

  useEffect(() => {
    api.getCustomerProfile().then(setProfile);
    api.getSession().then((s) => {
      const active = s.customers.find((c) => c.id === s.activeCustomerId);
      setIsAdmin(!!active?.roles?.includes("admin"));
    });
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
      setThresholdsError(saveErrorMessage(e, "Could not save the dashboard thresholds."));
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
          <h1>Customer Setup</h1>
          <div className="sub">The active customer's information, its configuration, and who can work on it.</div>
        </div>
      </div>

      {!profile ? (
        <Loading what="the customer profile" />
      ) : (
        <div className="stack">
          <CustomerEditor profile={profile} isAdmin={isAdmin} onSaved={setProfile} />
          <CustomerConfigLinks onNavigate={onNavigate} />

          <section className="panel">
            <h2>Members</h2>
            <div className="sub" style={{ marginBottom: 12 }}>
              Who can sign in to this customer and with which roles. Manage them under Admin › Users.
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
            <h2>Dashboard alert thresholds</h2>
            <div className="sub" style={{ marginBottom: 12 }}>
              When a KPI count on the Jade Dashboard should draw attention — a count above the
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
            <ApiNote endpoint="GET/PUT /admin/dashboard-thresholds" />
          </section>
        </div>
      )}
    </>
  );
}
