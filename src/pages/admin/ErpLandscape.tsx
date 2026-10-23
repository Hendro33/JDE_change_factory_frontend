import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type {
  ApprovedConfiguration,
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
import { Loading } from "../../components/ui";
import { Details } from "../../components/design";
import { saveErrorMessage } from "../../services/saveErrors";

const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

const EMPTY_ENVIRONMENT: EnvironmentBinding = {
  devEnvironmentId: "", devPathCode: "", aisDataSourceName: "", isolationConfirmed: false, isolationEvidence: "",
};

const APPROVER_ROLES: { role: ApproverRole; label: string }[] = [
  { role: "admin", label: "Admin" },
  { role: "product_manager", label: "Application Manager" },
  { role: "domain_owner", label: "Domain Owner" },
];

const MECHANISMS: { mechanism: Mechanism; label: string }[] = [
  { mechanism: "ais_form_service_request", label: "Configuration change (applied in DEV by a person, item by item, read back through AIS)" },
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

/** The Functional Agent's kinds of change (capability_catalog.json); the server refuses unknown ids. */
const FUNCTIONAL_KINDS: { id: string; label: string }[] = [
  { id: "udc_value_maintenance", label: "User defined codes (UDC values)" },
  { id: "constants_and_setup_master_data", label: "Set-up and constants tables (incl. AAIs, next numbers)" },
  { id: "document_type_definition", label: "Document types" },
  { id: "line_type_definition", label: "Line types" },
  { id: "order_activity_status_rules", label: "Order activity rules" },
  { id: "processing_option_update", label: "Processing options on customer versions" },
  { id: "batch_version_data_selection", label: "Batch version data selection" },
  { id: "batch_version_data_sequencing", label: "Batch version data sequencing" },
];
const kindLabel = (id: string) => FUNCTIONAL_KINDS.find((k) => k.id === id)?.label ?? id;

/** OMW object types the Technical Agent may prepare (custom objects, system codes 55-59). */
const TECHNICAL_TYPES: { id: string; label: string }[] = [
  { id: "UBE", label: "Reports and batch programs (UBE)" },
  { id: "APPL", label: "Interactive applications (APPL)" },
  { id: "BSFN", label: "Business functions (BSFN)" },
  { id: "NER", label: "Named event rules (NER)" },
  { id: "TBLE", label: "Tables (TBLE)" },
  { id: "BSVW", label: "Business views (BSVW)" },
  { id: "DSTR", label: "Data structures (DSTR)" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

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

function configurationToText(v: ApprovedConfiguration[]): string {
  return v
    .map((c) => `${c.capabilityId}|${c.category}|${c.target}|${c.fields.join(",")}|${c.actions.join(",")}|` +
      `${Object.entries(c.allowedValues).map(([f, vs]) => `${f}=${vs.join(",")}`).join(";")}|${c.notes}`)
    .join("\n");
}

/**
 * One line per entry: capability|category|target|fields,comma|actions,comma|FIELD=v1,v2;FIELD2=v|notes.
 * The target may itself contain "|" (a batch version "R42565|CIQ0001", key
 * values "F40039:DCTO=SW|SX"): it is everything between the category and the
 * last four fields.
 */
function configurationFromText(text: string): ApprovedConfiguration[] {
  return lines(text).map((line) => {
    const parts = line.split("|");
    const [capabilityId = "", category = ""] = parts;
    const tail = parts.length >= 7 ? parts.slice(-4) : ["", "", "", ""];
    const target = parts.length >= 7 ? parts.slice(2, -4).join("|") : (parts[2] ?? "");
    const [fields, actions, allowed, notes] = tail;
    const allowedValues: Record<string, string[]> = {};
    for (const pair of allowed.split(";").map((x) => x.trim()).filter(Boolean)) {
      const [f, vs = ""] = pair.split("=");
      allowedValues[f.trim().toUpperCase()] = vs.split(",").map((x) => x.trim()).filter(Boolean);
    }
    return {
      capabilityId: capabilityId.trim(), category: category.trim(), target: target.trim(),
      fields: fields.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean),
      actions: actions.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) as ("add" | "update")[],
      allowedValues, notes: notes.trim(),
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
  const [allowedKinds, setAllowedKinds] = useState<string[]>([]);
  const [approvedVersionsText, setApprovedVersionsText] = useState("");
  const [configurationText, setConfigurationText] = useState("");
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

  // The advanced section opens by itself when it holds something.
  const hasAdvanced = !!scope && (scope.functionalAgent.approvedVersions.length > 0
    || (scope.functionalAgent.approvedConfiguration ?? []).length > 0 || (scope.testScope?.approvedTests ?? []).length > 0
    || (scope.functionalAgent.spikeExperiments ?? []).length > 0);

  const load = () => {
    setLoadError(null);
    const onLoadError = (e: unknown) => setLoadError(saveErrorMessage(e, "Could not load the ERP landscape."));
    api.getErpLandscape().then(setLandscape).catch(onLoadError);
    api.getEngagementScope().then((s) => {
      setScope(s);
      setToolsRelease(s.toolsRelease);
      setAllowedKinds(s.functionalAgent.allowedCapabilities ?? []);
      setApprovedVersionsText(approvedVersionsToText(s.functionalAgent.approvedVersions));
      setConfigurationText(configurationToText(s.functionalAgent.approvedConfiguration ?? []));
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

  /** Everything allowed, as for a trial on a demo environment. */
  function trialDefaults() {
    setAllowedKinds(FUNCTIONAL_KINDS.map((k) => k.id));
    setObjectTypesText(TECHNICAL_TYPES.map((t) => t.id).join("\n"));
    setPolicyRoles((r) => (r.length ? r : ["admin", "product_manager"]));
    setPolicyHours(168);
    setMechanisms(MECHANISMS.map((m) => m.mechanism));
  }

  async function save() {
    if (!scope) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateEngagementScope({
        toolsRelease,
        environment,
        functionalAgent: {
          allowedCapabilities: allowedKinds,
          approvedVersions: approvedVersionsFromText(approvedVersionsText, scope.functionalAgent.approvedVersions),
          approvedConfiguration: configurationFromText(configurationText),
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
          <h1>Scope, approvals and environments</h1>
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
            <div className="sub" style={{ marginBottom: 8 }}>
              Connection settings live in one place: Admin → Integrations → JDE. This page only shows them.
            </div>
            <dl className="facts">
              <dt>Discovery profile</dt>
              <dd>
                {landscape.discoveryProfile?.configured ? (
                  <>
                    {landscape.discoveryProfile.connectionName ? <strong>{landscape.discoveryProfile.connectionName} · </strong> : null}
                    {landscape.discoveryProfile.environment} ({landscape.discoveryProfile.environmentPurpose === "isolated_trial" ? "approved isolated trial" : "development"}) · path code {landscape.discoveryProfile.pathCode} · application{" "}
                    {landscape.discoveryProfile.applicationRelease}, Tools {landscape.discoveryProfile.toolsRelease} · revision{" "}
                    {landscape.discoveryProfile.revision}{" "}
                    <span className="badge ok">live</span>{" "}
                    <span className={`badge ${landscape.discoveryProfile.discoveryEnabled ? "ok" : "grey"}`}>
                      {landscape.discoveryProfile.discoveryEnabled ? "discovery enabled" : landscape.discoveryProfile.disabled ? "disabled" : "discovery off"}
                    </span>
                    <div className="hint">
                      {Object.entries(landscape.discoveryProfile.health).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
                    </div>
                  </>
                ) : <span className="notstated">not configured — Admin → Integrations → JDE</span>}
              </dd>
              <dt>Delivery</dt>
              <dd>
                <span className="badge info">Recorded</span>{" "}
                <span className={`badge ${landscape.ais.liveVerification ? "ok" : "warn"}`}>{landscape.ais.liveVerification ? "Live verification on" : "Live verification not available yet"}</span>
                <div className="hint">
                  {landscape.ais.liveVerification
                    ? <>Approved changes are applied in DEV by JADE's agents with the customer's DEV write user (a person only where JD Edwards cannot accommodate an item otherwise) and verified live through the JD Edwards connection{landscape.ais.environment ? <> (environment <span className="mono">{landscape.ais.environment}</span>{landscape.ais.role ? <>, role <span className="mono">{landscape.ais.role}</span></> : null})</> : null}.</>
                    : <>Until the JD Edwards connection and agent execution are set up, changes are applied in DEV by a person and recorded. Live read-back starts once the JD Edwards
                      connection is tested and enabled (Systems &amp; Connections → JD Edwards). Until then, the person recording a step states the value they read in JDE, with evidence.</>}
                </div>
              </dd>
              <dt>Engagement scope</dt>
              <dd><span className={`badge ${landscape.engagementScopeConfigured ? "ok" : "warn"}`}>{landscape.engagementScopeConfigured ? "Configured" : "Not yet configured"}</span></dd>
            </dl>
            <div className="callout" style={{ marginTop: 16 }}>
              <strong>What is per company, and what is not yet</strong>
              {landscape.scopeGloballySharedNote}
            </div>
          </section>

          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Engagement Scope</h2>
              {!editing && <button className="btn" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            <div className="sub" style={{ marginBottom: 12 }}>
              What each agent may change in JDE for this customer, who approves, and the one DEV environment it happens in.
              The Architect is never limited by this: it explores freely and designs the best solution, then uses these
              permissions only to decide who delivers it — the Functional Agent, the Technical Agent or a person.
              Every change still needs a person's approval.
            </div>

            {!editing ? (
              <div className="stack">
                <div>
                  <strong>Functional Agent may change</strong>
                  {(scope.functionalAgent.allowedCapabilities ?? []).length === 0 ? (
                    <p className="notstated">Nothing yet{scope.functionalAgent.approvedVersions.length + (scope.functionalAgent.approvedConfiguration ?? []).length
                      ? " — only the targets listed under Advanced" : " — configuration changes go to a person"}</p>
                  ) : (
                    <p style={{ margin: "4px 0 0" }}>{(scope.functionalAgent.allowedCapabilities ?? []).map(kindLabel).join(" · ")}
                      <span className="hint"> — any target; nothing has to be listed per table, code or version</span></p>
                  )}
                </div>
                <div>
                  <strong>Technical Agent may prepare</strong>
                  <p style={{ margin: "4px 0 0" }}>
                    {scope.technicalAgent.authorizedObjectTypes.join(", ") || <span className="notstated">nothing yet — development work goes to a person</span>}
                    {scope.technicalAgent.authorizedObjectTypes.length > 0 && <span className="hint"> — custom objects in system codes 55–59</span>}
                  </p>
                </div>
                <div>
                  <strong>Who approves a change</strong>
                  {scope.approvalPolicy ? (
                    <p style={{ margin: "4px 0 0" }}>
                      {scope.approvalPolicy.exactChangeApproverRoles.map((r) => APPROVER_ROLES.find((x) => x.role === r)?.label ?? r).join(", ")}
                      {" "}· approval valid for {scope.approvalPolicy.approvalValidHours} hours
                    </p>
                  ) : (
                    <p style={{ margin: "4px 0 0" }}><span className="badge warn">Nobody yet</span> nothing can be approved</p>
                  )}
                </div>
                <div>
                  <strong>DEV environment</strong>
                  <p style={{ margin: "4px 0 0" }}>
                    <span className="mono">{scope.environment?.devEnvironmentId || "—"}</span> / <span className="mono">{scope.environment?.devPathCode || "—"}</span>{" "}
                    {!(scope.environment?.devEnvironmentId && scope.environment?.devPathCode)
                      && <span className="badge warn">name the DEV environment and path code — nothing can be delivered without them</span>}
                  </p>
                </div>
                <Details summary="Advanced: detailed allowlists, tests and technical rules" open={hasAdvanced}>
                  <div className="stack">
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
                  <strong>Functional Agent — approved configuration</strong>
                  {(scope.functionalAgent.approvedConfiguration ?? []).length === 0 ? (
                    <p className="notstated">None configured — only the approved processing-option versions above can be proposed</p>
                  ) : (
                    <table className="data">
                      <thead><tr><th>Capability</th><th>Category</th><th>Target</th><th>Fields</th><th>Actions</th><th>Allowed values</th><th>Notes</th></tr></thead>
                      <tbody>
                        {(scope.functionalAgent.approvedConfiguration ?? []).map((c, i) => (
                          <tr key={i}>
                            <td className="mono">{c.capabilityId}</td>
                            <td><CategoryBadge category={c.category} neverTouch={scope.functionalAgent.neverTouchCategories} /></td>
                            <td className="mono">{c.target}</td>
                            <td className="mono">{c.fields.join(", ") || <span className="notstated">—</span>}</td>
                            <td>{c.actions.join(", ") || <span className="notstated">—</span>}</td>
                            <td className="mono">{Object.entries(c.allowedValues).map(([f, vs]) => `${f}: ${vs.join(", ")}`).join("; ") || <span className="notstated">any</span>}</td>
                            <td>{c.notes}</td>
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
                      <dt>Tools release</dt><dd>{scope.toolsRelease || <NotStatedInline />}</dd>
                      <dt>Data source</dt><dd>{scope.environment?.aisDataSourceName || <NotStatedInline />}</dd>
                      <dt>Never-touch categories</dt>
                      <dd>{scope.functionalAgent.neverTouchCategories.map((c) => categoryInfo(c)?.label ?? c).join(", ") || <span className="notstated">none</span>}
                        <span className="hint"> — applies to listed targets</span></dd>
                      <dt>Reserved product code</dt><dd>{scope.technicalAgent.reservedProductCode || <span className="notstated">any of 55–59</span>}</dd>
                      <dt>Naming prefix</dt><dd>{scope.technicalAgent.namingPrefix || <NotStatedInline />}</dd>
                    </dl>
                  </div>
                </Details>
                <p className="hint">{scope.updatedAt ? `Last saved ${new Date(scope.updatedAt).toLocaleString("en-GB")} by ${scope.updatedBy}` : "Never saved."}</p>
              </div>
            ) : (
              <div className="stack">
                <div className="btnrow">
                  <button className="btn" type="button" onClick={trialDefaults}>Allow everything (trial)</button>
                  <span className="hint">Ticks every kind of change for both agents and sets approval to Admin and Application Manager. You still confirm the DEV environment yourself.</span>
                </div>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700, marginBottom: 6 }}>Functional Agent may change</legend>
                  <span className="hint">Any target within a ticked kind. Never XJDE/ZJDE versions, never outside the DEV environment below.</span>
                  <div className="stack" style={{ gap: 4, margin: "6px 0" }}>
                    {FUNCTIONAL_KINDS.map(({ id, label }) => (
                      <label key={id} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                        <input type="checkbox" checked={allowedKinds.includes(id)} onChange={() => setAllowedKinds((k) => toggle(k, id))} />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700, marginBottom: 6 }}>Technical Agent may prepare</legend>
                  <span className="hint">Custom objects in system codes 55–59 only; people apply them through OMW.</span>
                  <div className="stack" style={{ gap: 4, margin: "6px 0" }}>
                    {TECHNICAL_TYPES.map(({ id, label }) => {
                      const types = lines(objectTypesText);
                      return (
                        <label key={id} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                          <input type="checkbox" checked={types.includes(id)} onChange={() => setObjectTypesText(toggle(types, id).join("\n"))} />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700, marginBottom: 6 }}>Who approves a change</legend>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "6px 0" }}>
                    {APPROVER_ROLES.map(({ role, label }) => (
                      <label key={role} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                        <input type="checkbox" checked={policyRoles.includes(role)} onChange={() => setPolicyRoles((r) => toggle(r, role))} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <label htmlFor="policyHours" style={{ fontWeight: 400 }}>Approval valid for (hours, 1–168)</label>
                  <input id="policyHours" type="number" min={1} max={168} value={policyHours} onChange={(e) => setPolicyHours(Number(e.target.value))} />
                </fieldset>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 700, marginBottom: 6 }}>DEV environment</legend>
                  <div className="grid halves">
                    <div className="field">
                      <label htmlFor="devEnvironmentId">JDE environment</label>
                      <input id="devEnvironmentId" type="text" value={environment.devEnvironmentId} onChange={(e) => setEnvironment({ ...environment, devEnvironmentId: e.target.value.toUpperCase() })} placeholder="JPS920" />
                    </div>
                    <div className="field">
                      <label htmlFor="devPathCode">Path code</label>
                      <input id="devPathCode" type="text" value={environment.devPathCode} onChange={(e) => setEnvironment({ ...environment, devPathCode: e.target.value.toUpperCase() })} placeholder="PS920" />
                    </div>
                  </div>
                </fieldset>
                <Details summary="Advanced: detailed allowlists, tests and technical rules" open={hasAdvanced}>
                  <div className="stack">
                    <p className="hint">Only needed to allow single targets of a kind that is not ticked above, or to run post-change tests.</p>
                    <div className="field">
                      <label htmlFor="toolsRelease">Tools Release</label>
                      <input id="toolsRelease" type="text" value={toolsRelease} onChange={(e) => setToolsRelease(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="aisDataSourceName">Business data source</label>
                      <input id="aisDataSourceName" type="text" value={environment.aisDataSourceName} onChange={(e) => setEnvironment({ ...environment, aisDataSourceName: e.target.value })} />
                    </div>
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
                  <label htmlFor="approvedConfiguration">
                    Functional Agent — approved configuration <span className="hint">(enforced; one per line: capability|category|target|fields,comma|actions,comma|FIELD=value,value;FIELD=value|notes — target is a UDC type 00/DT, a table with optional key values F40039:DCTO=SW|SX, or a batch version R42565|CIQ0001; actions are add and/or update, never delete; UDC fields: DRDL01, DRDL02, DRSPHD)</span>
                  </label>
                  <textarea id="approvedConfiguration" value={configurationText} onChange={(e) => setConfigurationText(e.target.value)}
                    placeholder={"udc_value_maintenance|document_and_order_types|00/DT|DRDL01,DRSPHD|add,update||Order types\ndocument_type_definition|document_and_order_types|F40039:DCTO=SW|SX|DCT4,DCDL01|add|DCT4=SO|New sales order types"} />
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
                      <label htmlFor="reservedProductCode">Reserved product code <span className="hint">(empty = any of 55–59)</span></label>
                      <input id="reservedProductCode" type="text" value={reservedProductCode} onChange={(e) => setReservedProductCode(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="namingPrefix">Object name prefix <span className="hint">(empty = none)</span></label>
                      <input id="namingPrefix" type="text" value={namingPrefix} onChange={(e) => setNamingPrefix(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="technicalApprovers">Technical approvers <span className="hint">(one per line; reference only)</span></label>
                      <textarea id="technicalApprovers" value={technicalApproversText} onChange={(e) => setTechnicalApproversText(e.target.value)} />
                    </div>
                  </div>
                </Details>
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
          </section>

          <GateCoverage />
        </div>
      )}
    </>
  );
}

/**
 * What the delivery gate actually does today, kept next to the scope it
 * reads so nobody mistakes a field on this screen for a control. Mirrors
 * docs/stage1/04_REVIEW_PACK.md §4 (safeguard inventory).
 */
function GateCoverage() {
  return (
    <Details summary="What the delivery gate enforces" tone="technical">
    <section>
      <div className="grid halves">
        <div>
          <strong>Checked before a delivery step or test is recorded</strong>
          <ul style={{ fontSize: 15, paddingLeft: 18 }}>
            <li>The story is approved, and linked to this company</li>
            <li>The exact change is approved by a role this company's approval policy allows, and has not expired</li>
            <li>The operation is byte-for-byte the one approved</li>
            <li>The capability has a complete enforcement contract (only processing-option update does), and is validated or inside a current spike window</li>
            <li>The target is approved for this capability, through a mechanism this company allows</li>
            <li>The option's category is declared, not protected (pricing, tax, GL/AAI, security, payments, outbound integration) and not never-touch</li>
            <li>The customer's DEV environment is named, and the JDE connection points at it</li>
            <li>The target is an approved version and option, the value is allowed, and the version is not XJDE/ZJDE</li>
            <li>No earlier step is in flight, already recorded, or of unknown outcome</li>
            <li>Only the approved value is recorded as applied: JADE reads it back live, or the person states the value they read in JDE with evidence</li>
            <li>A test runs only after the change is recorded as applied, only the test named in the approval, only if it is an approved test, and only if its declared side effects are none or a DEV transaction</li>
          </ul>
        </div>
        <div>
          <strong>Recorded here but not enforced</strong>
          <ul style={{ fontSize: 15, paddingLeft: 18 }}>
            <li>Never-touch notes and the free-text approver lists (reference only)</li>
            <li>Whether a test's declared side effects are true: they are declared by a person, not observed</li>
            <li>Technical check-in, build and verification results: recorded as stated by the person, with their evidence</li>
          </ul>
          <strong>Never done by JADE</strong>
          <ul style={{ fontSize: 15, paddingLeft: 18 }}>
            <li>Writing to JD Edwards: a person applies every change in DEV and records it</li>
            <li>Every capability except processing-option update and the technical package route: proposal only, for Human Implementation</li>
            <li>Change Sets (several dependent operations): refused</li>
          </ul>
        </div>
      </div>
    </section>
    </Details>
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
