import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { ApprovedVersion, EngagementScope, ErpLandscape as ErpLandscapeData } from "../../types/domain";
import { ApiNote, Loading } from "../../components/ui";

const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

function approvedVersionsToText(v: ApprovedVersion[]): string {
  return v
    .map((a) => `${a.application}|${a.version}|${a.options.join(",")}|${a.allowedValues.join(",")}|${a.notes}`)
    .join("\n");
}

function approvedVersionsFromText(text: string): ApprovedVersion[] {
  return lines(text).map((line) => {
    const [application = "", version = "", options = "", allowedValues = "", notes = ""] = line.split("|");
    return {
      application: application.trim(),
      version: version.trim(),
      options: options.split(",").map((s) => s.trim()).filter(Boolean),
      allowedValues: allowedValues.split(",").map((s) => s.trim()).filter(Boolean),
      notes: notes.trim(),
    };
  });
}

export function ErpLandscape() {
  const [landscape, setLandscape] = useState<ErpLandscapeData | null>(null);
  const [scope, setScope] = useState<EngagementScope | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state, only meaningful while editing.
  const [toolsRelease, setToolsRelease] = useState("");
  const [approvedVersionsText, setApprovedVersionsText] = useState("");
  const [neverTouchText, setNeverTouchText] = useState("");
  const [functionalApproversText, setFunctionalApproversText] = useState("");
  const [objectTypesText, setObjectTypesText] = useState("");
  const [reservedProductCode, setReservedProductCode] = useState("");
  const [namingPrefix, setNamingPrefix] = useState("");
  const [technicalApproversText, setTechnicalApproversText] = useState("");
  const [updatedBy, setUpdatedBy] = useState(() => localStorage.getItem("ciq_approver") ?? "");

  const load = () => {
    api.getErpLandscape().then(setLandscape);
    api.getEngagementScope().then((s) => {
      setScope(s);
      setToolsRelease(s.toolsRelease);
      setApprovedVersionsText(approvedVersionsToText(s.functionalAgent.approvedVersions));
      setNeverTouchText(s.functionalAgent.neverTouchCategories.join("\n"));
      setFunctionalApproversText(s.functionalAgent.approvers.join("\n"));
      setObjectTypesText(s.technicalAgent.authorizedObjectTypes.join("\n"));
      setReservedProductCode(s.technicalAgent.reservedProductCode);
      setNamingPrefix(s.technicalAgent.namingPrefix);
      setTechnicalApproversText(s.technicalAgent.approvers.join("\n"));
    });
  };

  useEffect(load, []);

  async function save() {
    setSaving(true);
    localStorage.setItem("ciq_approver", updatedBy.trim());
    await api.updateEngagementScope({
      toolsRelease,
      functionalAgent: {
        approvedVersions: approvedVersionsFromText(approvedVersionsText),
        neverTouchCategories: lines(neverTouchText),
        approvers: lines(functionalApproversText),
      },
      technicalAgent: {
        authorizedObjectTypes: lines(objectTypesText),
        reservedProductCode,
        namingPrefix,
        approvers: lines(technicalApproversText),
      },
      updatedBy: updatedBy.trim(),
    });
    setSaving(false);
    setEditing(false);
    load();
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>ERP / JDE Landscape</h1>
          <div className="sub">This customer's JD Edwards estate, connection status, and engagement scope.</div>
        </div>
      </div>

      {!landscape || !scope ? (
        <Loading what="the ERP landscape" />
      ) : (
        <div className="stack">
          <section className="panel">
            <h2>JDE connection status</h2>
            <dl className="facts">
              <dt>Tools Release</dt><dd>{landscape.toolsRelease}</dd>
              <dt>Environment</dt><dd>{landscape.environment}</dd>
              <dt>AIS mode</dt>
              <dd><span className={`badge ${landscape.ais.mockMode ? "grey" : "ok"}`}>{landscape.ais.mockMode ? "Mock" : "Live"}</span></dd>
              <dt>AIS base URL</dt>
              <dd><span className={`badge ${landscape.ais.baseUrlConfigured ? "ok" : "grey"}`}>{landscape.ais.baseUrlConfigured ? "Configured" : "Not configured"}</span></dd>
              <dt>AIS environment</dt><dd>{landscape.ais.environment ?? <span className="notstated">not set</span>}</dd>
              <dt>AIS role</dt><dd>{landscape.ais.role ?? <span className="notstated">not set</span>}</dd>
              <dt>Engagement scope</dt>
              <dd><span className={`badge ${landscape.engagementScopeConfigured ? "ok" : "warn"}`}>{landscape.engagementScopeConfigured ? "Configured" : "Not yet configured"}</span></dd>
            </dl>
            <div className="callout" style={{ marginTop: 16 }}>
              <strong>This connection is still global, not per-customer</strong>
              {landscape.scopeGloballySharedNote}
            </div>
            <ApiNote endpoint="GET /admin/erp-landscape" />
          </section>

          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Engagement Scope</h2>
              {!editing && <button className="btn" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            <div className="sub" style={{ marginBottom: 12 }}>
              What this engagement is actually authorised to touch in JDE (design doc Appendix D.2 / E.2) —
              this customer's own intended source for scope.json. No configuration means no default
              permission, same rule the backend applies.
            </div>

            {!editing ? (
              <div className="stack">
                <div>
                  <strong>Functional Agent — approved versions</strong>
                  {scope.functionalAgent.approvedVersions.length === 0 ? (
                    <p className="notstated">None configured</p>
                  ) : (
                    <table className="data">
                      <thead><tr><th>Application</th><th>Version</th><th>Options</th><th>Allowed values</th><th>Notes</th></tr></thead>
                      <tbody>
                        {scope.functionalAgent.approvedVersions.map((v, i) => (
                          <tr key={i}>
                            <td className="mono">{v.application}</td>
                            <td className="mono">{v.version}</td>
                            <td>{v.options.join(", ")}</td>
                            <td>{v.allowedValues.join(", ") || <span className="notstated">any</span>}</td>
                            <td>{v.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <dl className="facts">
                  <dt>Never-touch categories</dt>
                  <dd>{scope.functionalAgent.neverTouchCategories.join(", ") || <span className="notstated">none listed</span>}</dd>
                  <dt>Functional approvers</dt>
                  <dd>{scope.functionalAgent.approvers.join(", ") || <span className="notstated">none listed</span>}</dd>
                  <dt>Authorized object types</dt>
                  <dd>{scope.technicalAgent.authorizedObjectTypes.join(", ") || <span className="notstated">none — Technical Agent writes refuse every request</span>}</dd>
                  <dt>Reserved product code</dt>
                  <dd>{scope.technicalAgent.reservedProductCode || <NotStatedInline />}</dd>
                  <dt>Naming prefix</dt>
                  <dd>{scope.technicalAgent.namingPrefix || <NotStatedInline />}</dd>
                  <dt>Technical approvers</dt>
                  <dd>{scope.technicalAgent.approvers.join(", ") || <span className="notstated">none listed</span>}</dd>
                  <dt>Last updated</dt>
                  <dd>{scope.updatedAt ? `${new Date(scope.updatedAt).toLocaleString("en-GB")} by ${scope.updatedBy}` : <span className="notstated">never configured</span>}</dd>
                </dl>
              </div>
            ) : (
              <div className="stack">
                <div className="field">
                  <label htmlFor="toolsRelease">Tools Release</label>
                  <input id="toolsRelease" type="text" value={toolsRelease} onChange={(e) => setToolsRelease(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="approvedVersions">
                    Functional Agent — approved versions <span className="hint">(one per line: application|version|options,comma|allowedValues,comma|notes)</span>
                  </label>
                  <textarea id="approvedVersions" value={approvedVersionsText} onChange={(e) => setApprovedVersionsText(e.target.value)} placeholder="P4210|CIQ0001|PDOCTYPE|SO,SV|Default document type on a named sales order version" />
                </div>
                <div className="field">
                  <label htmlFor="neverTouch">Never-touch categories <span className="hint">(one per line)</span></label>
                  <textarea id="neverTouch" value={neverTouchText} onChange={(e) => setNeverTouchText(e.target.value)} placeholder="Tax calculation processing options" />
                </div>
                <div className="field">
                  <label htmlFor="functionalApprovers">Functional approvers <span className="hint">(one per line)</span></label>
                  <textarea id="functionalApprovers" value={functionalApproversText} onChange={(e) => setFunctionalApproversText(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="objectTypes">Authorized technical object types <span className="hint">(one per line)</span></label>
                  <textarea id="objectTypes" value={objectTypesText} onChange={(e) => setObjectTypesText(e.target.value)} placeholder="ExternalFormApplication" />
                </div>
                <div className="field">
                  <label htmlFor="reservedProductCode">Reserved product code</label>
                  <input id="reservedProductCode" type="text" value={reservedProductCode} onChange={(e) => setReservedProductCode(e.target.value)} placeholder="55-59" />
                </div>
                <div className="field">
                  <label htmlFor="namingPrefix">Naming prefix</label>
                  <input id="namingPrefix" type="text" value={namingPrefix} onChange={(e) => setNamingPrefix(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="technicalApprovers">Technical approvers <span className="hint">(one per line)</span></label>
                  <textarea id="technicalApprovers" value={technicalApproversText} onChange={(e) => setTechnicalApproversText(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="updatedBy">Your name</label>
                  <input id="updatedBy" type="text" value={updatedBy} onChange={(e) => setUpdatedBy(e.target.value)} placeholder="Every change is recorded against a person" />
                </div>
                <div className="btnrow">
                  <button className="btn primary" disabled={saving || !updatedBy.trim()} onClick={save}>
                    {saving ? "Saving…" : "Save engagement scope"}
                  </button>
                  <button className="btn" onClick={() => { setEditing(false); load(); }}>Cancel</button>
                </div>
              </div>
            )}
            <ApiNote endpoint="GET/PUT /admin/engagement-scope" />
          </section>
        </div>
      )}
    </>
  );
}

function NotStatedInline() {
  return <span className="notstated">not stated</span>;
}
