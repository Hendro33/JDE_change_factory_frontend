import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type {
  ApprovedVersion,
  ApproverRole,
  EngagementScope,
  EnvironmentBinding,
  ErpLandscape as ErpLandscapeData,
  SpikeExperiment,
} from "../../types/domain";
import { ApiNote, Loading } from "../../components/ui";
import { saveErrorMessage } from "../../services/saveErrors";

const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

const EMPTY_ENVIRONMENT: EnvironmentBinding = {
  devEnvironmentId: "", devPathCode: "", aisDataSourceName: "", isolationConfirmed: false, isolationEvidence: "",
};

const APPROVER_ROLES: { role: ApproverRole; label: string }[] = [
  { role: "admin", label: "Admin" },
  { role: "product_manager", label: "Product Manager" },
  { role: "domain_owner", label: "Domain Owner" },
];

function approvedVersionsToText(v: ApprovedVersion[]): string {
  return v
    .map((a) => `${a.capabilityId ?? ""}|${a.application}|${a.version}|${a.options.join(",")}|${a.allowedValues.join(",")}|${a.notes}`)
    .join("\n");
}

/**
 * One line per entry: capability|application|version|options|allowedValues|notes.
 * A five-field line (the older format, without the capability) keeps the
 * capability of the saved row with the same application|version.
 */
function approvedVersionsFromText(text: string, previous: ApprovedVersion[]): ApprovedVersion[] {
  const key = (a: string, v: string) => `${a.trim().toUpperCase()}|${v.trim().toUpperCase()}`;
  const capabilityByKey = new Map(previous.map((p) => [key(p.application, p.version), p.capabilityId]));
  return lines(text).map((line) => {
    const parts = line.split("|");
    const [capability, application = "", version = "", options = "", allowedValues = "", notes = ""] =
      parts.length >= 6 ? parts : [undefined, ...parts];
    return {
      capabilityId: capability !== undefined ? capability.trim() : capabilityByKey.get(key(application, version)) ?? "",
      application: application.trim(),
      version: version.trim(),
      options: options.split(",").map((s) => s.trim()).filter(Boolean),
      allowedValues: allowedValues.split(",").map((s) => s.trim()).filter(Boolean),
      notes: notes.trim(),
    };
  });
}

function spikesToText(v: SpikeExperiment[]): string {
  return v
    .map((x) => `${x.capabilityId}|${x.capabilityRevision}|${x.application}|${x.version}|${x.option}|${x.expiresAt}|${x.note}`)
    .join("\n");
}

/** One line per experiment: capability|revision|application|version|option|expiresAt|note. Always DEV. */
function spikesFromText(text: string): SpikeExperiment[] {
  return lines(text).map((line) => {
    const [capabilityId = "", capabilityRevision = "", application = "", version = "", option = "", expiresAt = "", note = ""] =
      line.split("|");
    return {
      capabilityId: capabilityId.trim(),
      capabilityRevision: capabilityRevision.trim(),
      application: application.trim(),
      version: version.trim(),
      option: option.trim(),
      environment: "DEV",
      expiresAt: expiresAt.trim(),
      note: note.trim(),
    };
  });
}

const isExpired = (iso: string) => !(Date.parse(iso) > Date.now());

export function ErpLandscape() {
  const [landscape, setLandscape] = useState<ErpLandscapeData | null>(null);
  const [scope, setScope] = useState<EngagementScope | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state, only meaningful while editing.
  const [toolsRelease, setToolsRelease] = useState("");
  const [approvedVersionsText, setApprovedVersionsText] = useState("");
  const [neverTouchText, setNeverTouchText] = useState("");
  const [functionalApproversText, setFunctionalApproversText] = useState("");
  const [objectTypesText, setObjectTypesText] = useState("");
  const [reservedProductCode, setReservedProductCode] = useState("");
  const [namingPrefix, setNamingPrefix] = useState("");
  const [technicalApproversText, setTechnicalApproversText] = useState("");
  const [environment, setEnvironment] = useState<EnvironmentBinding>(EMPTY_ENVIRONMENT);
  const [spikesText, setSpikesText] = useState("");
  const [policyRoles, setPolicyRoles] = useState<ApproverRole[]>([]);
  const [policyHours, setPolicyHours] = useState(24);

  const load = () => {
    setLoadError(null);
    const onLoadError = (e: unknown) => setLoadError(saveErrorMessage(e, "Could not load the ERP landscape."));
    api.getErpLandscape().then(setLandscape).catch(onLoadError);
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
      setEnvironment(s.environment ?? EMPTY_ENVIRONMENT);
      setSpikesText(spikesToText(s.functionalAgent.spikeExperiments ?? []));
      setPolicyRoles(s.approvalPolicy?.exactChangeApproverRoles ?? []);
      setPolicyHours(s.approvalPolicy?.approvalValidHours ?? 24);
    }).catch(onLoadError);
  };

  useEffect(load, []);

  async function save() {
    if (!scope) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateEngagementScope({
        toolsRelease,
        environment,
        functionalAgent: {
          approvedVersions: approvedVersionsFromText(approvedVersionsText, scope.functionalAgent.approvedVersions),
          spikeExperiments: spikesFromText(spikesText),
          neverTouchCategories: lines(neverTouchText),
          approvers: lines(functionalApproversText),
        },
        technicalAgent: {
          authorizedObjectTypes: lines(objectTypesText),
          reservedProductCode,
          namingPrefix,
          approvers: lines(technicalApproversText),
        },
        // No roles selected means no policy: nothing can be approved or run.
        approvalPolicy: policyRoles.length
          ? { policyVersion: 1, exactChangeApproverRoles: policyRoles, approvalValidHours: policyHours }
          : null,
        expectedRevision: scope.revision,
      });
      setEditing(false);
      load();
    } catch (e) {
      // Stay in edit mode with the typed values intact.
      setSaveError(saveErrorMessage(e, "Could not save the engagement scope."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>ERP / JDE Landscape</h1>
          <div className="sub">This customer's JD Edwards estate, connection status, and engagement scope.</div>
        </div>
      </div>

      {loadError && (
        <div className="callout" style={{ borderColor: "var(--stop)", marginBottom: 16 }}>
          <strong>Could not load</strong>
          {loadError}
        </div>
      )}

      {!landscape || !scope ? (
        loadError ? null : <Loading what="the ERP landscape" />
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
              <strong>What is per company, and what is not yet</strong>
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
              What this company's changes may touch in JDE and who may approve them (design doc Appendix
              D.2 / E.2). The execution gate enforces exactly what is saved here, for this company's stories
              only. Anything missing authorises nothing: no approval policy means nothing can be approved,
              and an unconfirmed DEV environment means nothing can run.
            </div>

            {!editing ? (
              <div className="stack">
                <div>
                  <strong>Approval policy</strong>
                  {scope.approvalPolicy ? (
                    <p style={{ margin: "4px 0 0" }}>
                      Exact changes may be approved by:{" "}
                      {scope.approvalPolicy.exactChangeApproverRoles
                        .map((r) => APPROVER_ROLES.find((x) => x.role === r)?.label ?? r)
                        .join(", ")}
                      . An approval stays valid for {scope.approvalPolicy.approvalValidHours} hours.
                    </p>
                  ) : (
                    <p style={{ margin: "4px 0 0" }}>
                      <span className="badge warn">None</span> Nobody can approve an exact change for this company,
                      so nothing can run.
                    </p>
                  )}
                </div>
                <div>
                  <strong>DEV environment binding</strong>
                  <dl className="facts" style={{ marginTop: 4 }}>
                    <dt>Environment</dt><dd className="mono">{scope.environment?.devEnvironmentId || <NotStatedInline />}</dd>
                    <dt>Path code</dt><dd className="mono">{scope.environment?.devPathCode || <NotStatedInline />}</dd>
                    <dt>Data source</dt><dd>{scope.environment?.aisDataSourceName || <NotStatedInline />}</dd>
                    <dt>Isolation</dt>
                    <dd>
                      {scope.environment?.isolationConfirmed ? (
                        <>
                          <span className="badge ok">Confirmed</span>{" "}
                          by {scope.environment.isolationConfirmedBy}
                          {scope.environment.isolationConfirmedAt && `, ${new Date(scope.environment.isolationConfirmedAt).toLocaleString("en-GB")}`}
                        </>
                      ) : (
                        <><span className="badge warn">Not confirmed</span> nothing can run until it is</>
                      )}
                    </dd>
                    <dt>Evidence</dt><dd>{scope.environment?.isolationEvidence || <NotStatedInline />}</dd>
                  </dl>
                </div>
                <div>
                  <strong>Functional Agent — approved versions</strong>
                  {scope.functionalAgent.approvedVersions.length === 0 ? (
                    <p className="notstated">None configured</p>
                  ) : (
                    <table className="data">
                      <thead><tr><th>Capability</th><th>Application</th><th>Version</th><th>Options</th><th>Allowed values</th><th>Notes</th></tr></thead>
                      <tbody>
                        {scope.functionalAgent.approvedVersions.map((v, i) => (
                          <tr key={i}>
                            <td className="mono">{v.capabilityId || <span className="badge warn">none — cannot run</span>}</td>
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
                <div>
                  <strong>Spike experiments (dated DEV test windows)</strong>
                  {(scope.functionalAgent.spikeExperiments ?? []).length === 0 ? (
                    <p className="notstated">None</p>
                  ) : (
                    <table className="data">
                      <thead><tr><th>Capability</th><th>Target</th><th>Window ends</th><th>Approved by</th><th>Note</th></tr></thead>
                      <tbody>
                        {(scope.functionalAgent.spikeExperiments ?? []).map((x, i) => (
                          <tr key={i}>
                            <td className="mono">{x.capabilityId} {x.capabilityRevision}</td>
                            <td className="mono">{[x.application, x.version, x.option].filter(Boolean).join(" / ")}</td>
                            <td>
                              {new Date(x.expiresAt).toLocaleString("en-GB")}{" "}
                              {isExpired(x.expiresAt) && <span className="badge grey">Expired</span>}
                            </td>
                            <td>{x.approvedBy}</td>
                            <td>{x.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <dl className="facts">
                  <dt>Never-touch categories <span className="hint">(reference only)</span></dt>
                  <dd>{scope.functionalAgent.neverTouchCategories.join(", ") || <span className="notstated">none listed</span>}</dd>
                  <dt>Functional approvers <span className="hint">(reference only)</span></dt>
                  <dd>{scope.functionalAgent.approvers.join(", ") || <span className="notstated">none listed</span>}</dd>
                  <dt>Authorized object types</dt>
                  <dd>{scope.technicalAgent.authorizedObjectTypes.join(", ") || <span className="notstated">none — Technical Agent writes refuse every request</span>}</dd>
                  <dt>Reserved product code</dt>
                  <dd>{scope.technicalAgent.reservedProductCode || <NotStatedInline />}</dd>
                  <dt>Naming prefix</dt>
                  <dd>{scope.technicalAgent.namingPrefix || <NotStatedInline />}</dd>
                  <dt>Technical approvers <span className="hint">(reference only)</span></dt>
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
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700, marginBottom: 6 }}>Approval policy</legend>
                  <span className="hint">Which roles may approve an exact change. Select none and nothing can be approved or run.</span>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "6px 0" }}>
                    {APPROVER_ROLES.map(({ role, label }) => (
                      <label key={role} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={policyRoles.includes(role)}
                          onChange={() => setPolicyRoles((r) => (r.includes(role) ? r.filter((x) => x !== role) : [...r, role]))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <label htmlFor="policyHours" style={{ fontWeight: 400 }}>Approval valid for (hours, 1–168)</label>
                  <input id="policyHours" type="number" min={1} max={168} value={policyHours} onChange={(e) => setPolicyHours(Number(e.target.value))} />
                </fieldset>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700, marginBottom: 6 }}>DEV environment binding</legend>
                  <div className="grid halves">
                    <div className="field">
                      <label htmlFor="devEnvironmentId">JDE environment</label>
                      <input id="devEnvironmentId" type="text" value={environment.devEnvironmentId} onChange={(e) => setEnvironment({ ...environment, devEnvironmentId: e.target.value })} placeholder="JDV920" />
                    </div>
                    <div className="field">
                      <label htmlFor="devPathCode">Path code</label>
                      <input id="devPathCode" type="text" value={environment.devPathCode} onChange={(e) => setEnvironment({ ...environment, devPathCode: e.target.value })} placeholder="DV920" />
                    </div>
                  </div>
                  <label htmlFor="aisDataSourceName">Business data source</label>
                  <input id="aisDataSourceName" type="text" value={environment.aisDataSourceName} onChange={(e) => setEnvironment({ ...environment, aisDataSourceName: e.target.value })} />
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400, margin: "8px 0" }}>
                    <input type="checkbox" checked={environment.isolationConfirmed} onChange={(e) => setEnvironment({ ...environment, isolationConfirmed: e.target.checked })} />
                    I have checked that this environment's OCM mappings and data sources cannot affect another environment
                  </label>
                  <label htmlFor="isolationEvidence">How isolation was checked</label>
                  <textarea id="isolationEvidence" value={environment.isolationEvidence} onChange={(e) => setEnvironment({ ...environment, isolationEvidence: e.target.value })} />
                </fieldset>
                <div className="field">
                  <label htmlFor="approvedVersions">
                    Functional Agent — approved versions <span className="hint">(one per line: capability|application|version|options,comma|allowedValues,comma|notes)</span>
                  </label>
                  <textarea id="approvedVersions" value={approvedVersionsText} onChange={(e) => setApprovedVersionsText(e.target.value)} placeholder="processing_option_update|P4210|CIQ0001|PDOCTYPE|SO,SV|Default document type on a named sales order version" />
                </div>
                <div className="field">
                  <label htmlFor="spikeExperiments">
                    Spike experiments <span className="hint">(one per line: capability|revision|application|version|option|window ends (ISO date-time with timezone)|note — DEV only; approved under your name when first saved)</span>
                  </label>
                  <textarea id="spikeExperiments" value={spikesText} onChange={(e) => setSpikesText(e.target.value)} placeholder="processing_option_update|r1|P4210|CIQ0001|PDOCTYPE|2026-10-31T17:00:00+01:00|Experiment A" />
                </div>
                <div className="field">
                  <label htmlFor="neverTouch">Never-touch categories <span className="hint">(one per line; reference only, not enforced)</span></label>
                  <textarea id="neverTouch" value={neverTouchText} onChange={(e) => setNeverTouchText(e.target.value)} placeholder="Tax calculation processing options" />
                </div>
                <div className="field">
                  <label htmlFor="functionalApprovers">Functional approvers <span className="hint">(one per line; reference only — authority comes from the approval policy)</span></label>
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
                  <label htmlFor="technicalApprovers">Technical approvers <span className="hint">(one per line; reference only)</span></label>
                  <textarea id="technicalApprovers" value={technicalApproversText} onChange={(e) => setTechnicalApproversText(e.target.value)} />
                </div>
                <p className="hint">Saved under your signed-in name.</p>
                {saveError && (
                  <div className="callout" style={{ borderColor: "var(--stop)" }}>
                    <strong>Could not save</strong>
                    {saveError}
                  </div>
                )}
                <div className="btnrow">
                  <button className="btn primary" disabled={saving} onClick={save}>
                    {saving ? "Saving…" : "Save engagement scope"}
                  </button>
                  <button className="btn" onClick={() => { setEditing(false); setSaveError(null); load(); }}>
                    {saveError ? "Discard my edits and reload" : "Cancel"}
                  </button>
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
