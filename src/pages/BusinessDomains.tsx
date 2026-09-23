import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { BusinessDomain } from "../types/domain";
import type { Navigate } from "../types/nav";
import { ApiNote, Loading, NotStated } from "../components/ui";
import { saveErrorMessage } from "../services/saveErrors";

const STATUS_OPTIONS: BusinessDomain["status"][] = ["active", "proposed", "retired"];

/**
 * The customer's business domain taxonomy (Increment: domain-aware
 * governance / Continuous Delivery Flow navigation; Administration).
 * A small, representative set classified against APQC — not the full
 * catalogue. Clicking a domain row jumps to User Stories filtered to
 * it; the status selector and "New domain" form are the Admin write
 * path onto the same list GET /business-domains already serves.
 */
/** The people who can actually approve for this domain -- never the legacy free-text note. */
export function ownersOf(d: BusinessDomain | undefined) {
  const owners = d?.assignedOwners ?? [];
  return owners.length ? owners.join(", ") : <span className="notstated">none assigned — nobody can approve</span>;
}

export function BusinessDomains({ onNavigate }: { onNavigate: Navigate }) {
  const [domains, setDomains] = useState<BusinessDomain[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apqcCode, setApqcCode] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [description, setDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const load = () => {
    api
      .listBusinessDomains()
      .then(setDomains)
      .catch((e) => setListError(saveErrorMessage(e, "Could not load business domains.")));
  };
  useEffect(load, []);

  async function createDomain() {
    setSaving(true);
    setCreateError(null);
    try {
      await api.createBusinessDomain({ apqcCode, name, level, description });
      setApqcCode(""); setName(""); setLevel(""); setDescription("");
      setShowNew(false);
      load();
    } catch (e) {
      setCreateError(saveErrorMessage(e, "Could not create the business domain."));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(domain: BusinessDomain, status: BusinessDomain["status"]) {
    setListError(null);
    try {
      await api.updateBusinessDomainStatus(domain.id, status, domain.revision);
    } catch (e) {
      setListError(`${domain.name}: ${saveErrorMessage(e, "Could not change the status.")}`);
    }
    // Reload either way: on success to show the saved state, on failure so
    // the selector falls back to what is actually stored.
    load();
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Business Domains</h1>
          <div className="sub">
            The customer's own business taxonomy, classified against APQC — the ownership hook
            for the User Stories raised against each one.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="meta">{domains?.length ?? 0} domains</div>
          <button className="btn primary" onClick={() => setShowNew((v) => !v)}>
            {showNew ? "Cancel" : "New domain"}
          </button>
        </div>
      </div>

      {showNew && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>New business domain</h2>
          <div className="grid halves">
            <div className="field">
              <label htmlFor="apqcCode">APQC code</label>
              <input id="apqcCode" type="text" value={apqcCode} onChange={(e) => setApqcCode(e.target.value)} placeholder="4.4.1" />
            </div>
            <div className="field">
              <label htmlFor="level">Level <span className="hint">(dotted depth, matches APQC code)</span></label>
              <input id="level" type="text" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="4.4.1" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="description">Description <span className="hint">(optional)</span></label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <p className="hint">Domain Owners are assigned per person in Admin &gt; Users, not typed here.</p>
          {createError && (
            <div className="callout" style={{ borderColor: "var(--stop)", marginBottom: 12 }}>
              <strong>Could not create</strong>
              {createError}
            </div>
          )}
          <button className="btn primary" disabled={saving || !apqcCode.trim() || !name.trim() || !level.trim()} onClick={createDomain}>
            {saving ? "Creating…" : "Create domain"}
          </button>
          <ApiNote endpoint="POST /admin/business-domains" />
        </section>
      )}

      {listError && (
        <div className="callout" style={{ borderColor: "var(--stop)", marginBottom: 16 }}>
          <strong>Not saved</strong>
          {listError}
        </div>
      )}

      {!domains ? (listError ? null : <Loading what="business domains" />) : domains.length === 0 ? (
        <div className="empty">No business domains defined for this customer yet.</div>
      ) : (
        <section className="panel">
          <table className="data">
            <thead>
              <tr><th>APQC code</th><th>Domain</th><th>Level</th><th>Domain Owner</th><th>Status</th></tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id} className="clickable" onClick={() => onNavigate("userstories", { view: "all", domainId: d.id })}>
                  <td className="mono">{d.apqcCode}</td>
                  <td>
                    <div>{d.name}</div>
                    {d.description && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{d.description}</div>}
                  </td>
                  <td className="mono">{d.level}</td>
                  <td>{ownersOf(d)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      value={d.status}
                      onChange={(e) => changeStatus(d, e.target.value as BusinessDomain["status"])}
                      className={`badge ${d.status === "active" ? "ok" : "grey"}`}
                      style={{ cursor: "pointer" }}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ApiNote endpoint="GET /business-domains" />
        </section>
      )}
    </>
  );
}
