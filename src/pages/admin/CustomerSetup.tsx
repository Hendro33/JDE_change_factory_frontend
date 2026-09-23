import { useEffect, useState } from "react";
import { api } from "../../services/api";
import {
  DEFAULT_DASHBOARD_THRESHOLDS,
  clearLegacyLocalThresholds,
  readLegacyLocalThresholds,
} from "../../services/dashboardThresholds";
import { saveErrorMessage } from "../../services/saveErrors";
import type { CustomerProfile, DashboardThresholds } from "../../types/domain";
import { ApiNote, Loading } from "../../components/ui";

export function CustomerSetup() {
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
          <div className="sub">The active customer's profile and who is entitled to it.</div>
        </div>
      </div>

      {!profile ? (
        <Loading what="the customer profile" />
      ) : (
        <div className="stack">
          <section className="panel">
            <h2>{profile.customer.name}</h2>
            <dl className="facts">
              <dt>Customer id</dt><dd className="mono">{profile.customer.id}</dd>
              <dt>Short name</dt><dd>{profile.customer.shortName}</dd>
              <dt>JDE Tools Release</dt><dd>{profile.customer.toolsRelease}</dd>
              <dt>Environment</dt><dd>{profile.customer.environment}</dd>
            </dl>
            <ApiNote endpoint="GET /admin/customer-profile" />
          </section>

          <section className="panel">
            <h2>Entitled identities</h2>
            <div className="sub" style={{ marginBottom: 12 }}>
              Who can reach this customer today. Identity/authorisation is still a documented
              stand-in for real authentication — this list comes from a static entitlement table,
              not a login system.
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
