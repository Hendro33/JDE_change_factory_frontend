import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type {
  ApprovedVersion,
  ApproverRole,
  EngagementScope,
  EnvironmentBinding,
  ErpLandscape as ErpLandscapeData,
  Mechanism,
  SpikeExperiment,
  TestScope,
  TestSideEffect,
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

const MECHANISMS: { mechanism: Mechanism; label: string }[] = [
  { mechanism: "ais_form_service_request", label: "AIS form service request (processing-option write)" },
  { mechanism: "ais_orchestration", label: "AIS orchestration (post-change test)" },
];

/**
 * Mirrors the option categories in capability_catalog.json's enforcement
 * contract for processing_option_update. The server is authoritative: it
 * refuses an unknown category, and the gate never writes a protected one.
 */
const OPTION_CATEGORIES: { category: string; label: string; protected: boolean }[] = [
  { category: "defaults_and_display", label: "Defaults and display", protected: false },
  { category: "document_and_order_types", label: "Document and order types", protected: false },
  { category: "workflow_and_status", label: "Workflow and status", protected: false },
  { category: "pricing", label: "Pricing", protected: true },
  { category: "tax", label: "Tax", protected: true },
  { category: "gl_posting_and_aai", label: "GL posting and AAIs", protected: true },
  { category: "security_and_authorisation", label: "Security and authorisation", protected: true },
  { category: "payments_and_banking", label: "Payments and banking", protected: true },
  { category: "outbound_integration", label: "Outbound integration", protected: true },
];
const categoryInfo = (c: string) => OPTION_CATEGORIES.find((x) => x.category === c);

const PERMITTED_TEST_EFFECTS: TestSideEffect[] = ["none", "creates_dev_transaction"];

function approvedVersionsToText(v: ApprovedVersion[]): string {
  return v
    .map((a) => `${a.capabilityId ?? ""}|${a.optionCategory ?? ""}|${a.application}|${a.version}|${a.options.join(",")}|${a.allowedValues.join(",")}|${a.notes}`)
    .join("\n");
}

/**
 * One line per entry: capability|category|application|version|options|allowedValues|notes.
 * Older lines are still read: six fields (no category) leave the category
 * empty, which blocks execution until it is classified; five fields (no
 * capability either) keep the capability of the saved row with the same
 * application|version.
 */
function approvedVersionsFromText(text: string, previous: ApprovedVersion[]): ApprovedVersion[] {
  const key = (a: string, v: string) => `${a.trim().toUpperCase()}|${v.trim().toUpperCase()}`;
  const capabilityByKey = new Map(previous.map((p) => [key(p.application, p.version), p.capabilityId]));
  return lines(text).map((line) => {
    const parts = line.split("|");
    const [capability, category = "", application = "", version = "", options = "", allowedValues = "", notes = ""] =
      parts.length >= 7 ? parts : parts.length === 6 ? [parts[0], "", ...parts.slice(1)] : [undefined, "", ...parts];
    return {
      capabilityId: capability !== undefined ? capability.trim() : capabilityByKey.get(key(application, version)) ?? "",
      optionCategory: category.trim(),
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

function testsToText(t: TestScope | undefined): string {
  return (t?.approvedTests ?? []).map((x) => `${x.orchestration}|${x.sideEffects.join(",")}|${x.note}`).join("\n");
}

/** One line per test: orchestration|sideEffect,sideEffect|note. */
function testsFromText(text: string): TestScope {
  return {
    approvedTests: lines(text).map((line) => {
      const [orchestration = "", effects = "", note = ""] = line.split("|");
      return {
        orchestration: orchestration.trim(),
        sideEffects: effects.split(",").map((s) => s.trim()).filter(Boolean) as TestSideEffect[],
        note: note.trim(),
      };
    }),
  };
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
  const [neverTouch, setNeverTouch] = useState<string[]>([]);
  const [neverTouchNotesText, setNeverTouchNotesText] = useState("");
  const [mechanisms, setMechanisms] = useState<Mechanism[]>([]);
  const [testsText, setTestsText] = useState("");
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
      setNeverTouch(s.functionalAgent.neverTouchCategories);
      setNeverTouchNotesText((s.functionalAgent.neverTouchNotes ?? []).join("\n"));
      setMechanisms(s.mechanismsAllowed ?? []);
      setTestsText(testsToText(s.testScope));
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
          neverTouchCategories: neverTouch,
          neverTouchNotes: lines(neverTouchNotesText),
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
        mechanismsAllowed: mechanisms,
        testScope: testsFromText(testsText),
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
                      <thead><tr><th>Capability</th><th>Category</th><th>Application</th><th>Version</th><th>Options</th><th>Allowed values</th><th>Notes</th></tr></thead>
                      <tbody>
                        {scope.functionalAgent.approvedVersions.map((v, i) => (
                          <tr key={i}>
                            <td className="mono">{v.capabilityId || <span className="badge warn">none — cannot run</span>}</td>
                            <td><CategoryBadge category={v.optionCategory} neverTouch={scope.functionalAgent.neverTouchCategories} /></td>
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
                  <strong>Mechanisms allowed</strong>
                  <p style={{ margin: "4px 0 0" }}>
                    {(scope.mechanismsAllowed ?? []).length === 0 ? (
                      <><span className="badge warn">None</span> no write or test can run</>
                    ) : (
                      (scope.mechanismsAllowed ?? []).map((m) => MECHANISMS.find((x) => x.mechanism === m)?.label ?? m).join("; ")
                    )}
                  </p>
                </div>
                <div>
                  <strong>Approved tests</strong>
                  {(scope.testScope?.approvedTests ?? []).length === 0 ? (
                    <p className="notstated">None — no post-change test can run</p>
                  ) : (
                    <table className="data">
                      <thead><tr><th>Orchestration</th><th>Declared side effects</th><th>Note</th></tr></thead>
                      <tbody>
                        {(scope.testScope?.approvedTests ?? []).map((t, i) => (
                          <tr key={i}>
                            <td className="mono">{t.orchestration}</td>
                            <td>
                              {t.sideEffects.map((e) => (
                                <span key={e} className={`badge ${PERMITTED_TEST_EFFECTS.includes(e) ? "grey" : "warn"}`} style={{ marginRight: 4 }}>
                                  {e}{PERMITTED_TEST_EFFECTS.includes(e) ? "" : " — refused"}
                                </span>
                              ))}
                            </td>
                            <td>{t.note}</td>
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
                  <dt>Never-touch categories <span className="hint">(enforced)</span></dt>
                  <dd>
                    {scope.functionalAgent.neverTouchCategories.map((c) => categoryInfo(c)?.label ?? c).join(", ") || <span className="notstated">none</span>}
                    <span className="hint"> — in addition to the always-protected categories</span>
                  </dd>
                  <dt>Never-touch notes <span className="hint">(reference only, not enforced)</span></dt>
                  <dd>{(scope.functionalAgent.neverTouchNotes ?? []).join("; ") || <span className="notstated">none</span>}</dd>
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
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700, marginBottom: 6 }}>Mechanisms allowed <span className="hint">(enforced)</span></legend>
                  <span className="hint">A write or test whose mechanism is not ticked is refused.</span>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "6px 0" }}>
                    {MECHANISMS.map(({ mechanism, label }) => (
                      <label key={mechanism} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={mechanisms.includes(mechanism)}
                          onChange={() => setMechanisms((m) => (m.includes(mechanism) ? m.filter((x) => x !== mechanism) : [...m, mechanism]))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="field">
                  <label htmlFor="approvedVersions">
                    Functional Agent — approved versions <span className="hint">(one per line: capability|category|application|version|options,comma|allowedValues,comma|notes — category is one of: {OPTION_CATEGORIES.filter((c) => !c.protected).map((c) => c.category).join(", ")}; protected categories are refused)</span>
                  </label>
                  <textarea id="approvedVersions" value={approvedVersionsText} onChange={(e) => setApprovedVersionsText(e.target.value)} placeholder="processing_option_update|document_and_order_types|P4210|CIQ0001|PDOCTYPE|SO,SV|Default document type on a named sales order version" />
                </div>
                <div className="field">
                  <label htmlFor="approvedTests">
                    Approved tests <span className="hint">(enforced; one per line: orchestration|sideEffect,sideEffect|note — side effects: none, creates_dev_transaction; posting, payment, outbound_integration and batch_run are refused)</span>
                  </label>
                  <textarea id="approvedTests" value={testsText} onChange={(e) => setTestsText(e.target.value)} placeholder="ORCH_CREATE_TEST_SO|creates_dev_transaction|Creates one DEV sales order" />
                </div>
                <div className="field">
                  <label htmlFor="spikeExperiments">
                    Spike experiments <span className="hint">(one per line: capability|revision|application|version|option|window ends (ISO date-time with timezone)|note — DEV only; approved under your name when first saved)</span>
                  </label>
                  <textarea id="spikeExperiments" value={spikesText} onChange={(e) => setSpikesText(e.target.value)} placeholder="processing_option_update|r1|P4210|CIQ0001|PDOCTYPE|2026-10-31T17:00:00+01:00|Experiment A" />
                </div>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700, marginBottom: 6 }}>Never-touch categories <span className="hint">(enforced)</span></legend>
                  <span className="hint">Protected categories are always refused and cannot be unticked.</span>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "6px 0" }}>
                    {OPTION_CATEGORIES.map(({ category, label, protected: prot }) => (
                      <label key={category} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          disabled={prot}
                          checked={prot || neverTouch.includes(category)}
                          onChange={() => setNeverTouch((n) => (n.includes(category) ? n.filter((x) => x !== category) : [...n, category]))}
                        />
                        {label}{prot && <span className="hint"> (protected)</span>}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="field">
                  <label htmlFor="neverTouchNotes">Never-touch notes <span className="hint">(one per line; reference only — a note is not enforcement)</span></label>
                  <textarea id="neverTouchNotes" value={neverTouchNotesText} onChange={(e) => setNeverTouchNotesText(e.target.value)} placeholder="Ask Finance before touching credit-check options" />
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

          <GateCoverage />
        </div>
      )}
    </>
  );
}

/**
 * What the execution gate actually does today, kept next to the scope it
 * reads so nobody mistakes a field on this screen for a control. Mirrors
 * docs/stage1/04_REVIEW_PACK.md §4 (safeguard inventory).
 */
function GateCoverage() {
  return (
    <section className="panel">
      <h2>What the execution gate enforces</h2>
      <div className="grid halves">
        <div>
          <strong>Checked before every JDE write or test run</strong>
          <ul style={{ fontSize: 13.5, paddingLeft: 18 }}>
            <li>The story is approved, and linked to this company</li>
            <li>The exact change is approved by a role this company's approval policy allows, and has not expired</li>
            <li>The operation is byte-for-byte the one approved</li>
            <li>The capability has a complete enforcement contract (only processing-option update does), and is validated or inside a current spike window</li>
            <li>The target is approved for this capability, through a mechanism this company allows</li>
            <li>The option's category is declared, not protected (pricing, tax, GL/AAI, security, payments, outbound integration) and not never-touch</li>
            <li>DEV isolation is confirmed, and the JDE connection points at the bound DEV environment</li>
            <li>The target is an approved version and option, the value is allowed, and the version is not XJDE/ZJDE</li>
            <li>No earlier attempt is in flight, already applied, or of unknown outcome</li>
            <li>A test runs only after its write is applied, only the test named in the approval, only if it is an approved test, and only if its declared side effects are none or a DEV transaction</li>
          </ul>
        </div>
        <div>
          <strong>Recorded here but not enforced</strong>
          <ul style={{ fontSize: 13.5, paddingLeft: 18 }}>
            <li>Never-touch notes and the free-text approver lists (reference only)</li>
            <li>Whether a test's declared side effects are true: they are declared by a person, not observed</li>
            <li>Technical Agent object types, product code and naming prefix: no technical write tool exists</li>
          </ul>
          <strong>Not available yet</strong>
          <ul style={{ fontSize: 13.5, paddingLeft: 18 }}>
            <li>Any live JDE write: the processing-option request is not recorded (Experiment A)</li>
            <li>Reading a live value back automatically: a person reads it in JDE and records it</li>
            <li>Every capability except processing-option update: proposal only, for Human Implementation</li>
            <li>Change Sets (several dependent operations): refused</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function CategoryBadge({ category, neverTouch }: { category?: string; neverTouch: string[] }) {
  if (!category) return <span className="badge warn">not classified — cannot run</span>;
  const info = categoryInfo(category);
  if (!info) return <span className="badge warn">{category} — unknown</span>;
  if (info.protected) return <span className="badge warn">{info.label} — protected, refused</span>;
  if (neverTouch.includes(category)) return <span className="badge warn">{info.label} — never-touch, refused</span>;
  return <span className="badge grey">{info.label}</span>;
}

function NotStatedInline() {
  return <span className="notstated">not stated</span>;
}
