import { useEffect, useState } from "react";
import { saveErrorMessage } from "../services/saveErrors";
import { technicalApi, type PackageView, type TechnicalWorkView } from "../services/technicalApi";
import type { CompanyRole } from "../types/domain";
import { Loading } from "../components/design";
import { recordedAt } from "../components/ExecutionPanel";

type StepState = "done" | "failed" | "waiting" | "blocked" | "unknown" | "todo";
const stepTone: Record<StepState, string> = { done: "ok", failed: "stop", waiting: "warn", blocked: "stop", unknown: "stop", todo: "grey" };

/** Each milestone separately -- never collapsed into one success. */
export function milestoneSteps(p: PackageView): { label: string; state: StepState; detail?: string }[] {
  const a = p.approval;
  const s = a?.milestone_states;
  const stateOf = (v: string | undefined, ok: string): StepState =>
    v === ok ? "done" : v === "failed" ? "failed" : v === "unknown" || v === "diverged" ? "unknown" : v === "in_progress" ? "waiting" : "todo";
  const verified = a?.verification;
  return [
    { label: "Prepared", state: "done", detail: `revision ${p.revision}` },
    { label: "Exact approval", state: a?.status === "approved" ? "done" : a?.status === "rejected" ? "failed" : "waiting",
      detail: a?.status ?? "none" },
    { label: "Checked in through OMW (not active)", state: stateOf(s?.apply, "applied") },
    { label: "Built", state: stateOf(s?.build, "built") },
    { label: "CNC activation in DEV", state: a?.cnc_activation ? "done" : s?.build === "built" ? "waiting" : "todo",
      detail: a?.cnc_activation ? `${a.cnc_activation.package_name} by ${a.cnc_activation.by}` : s?.build === "built" ? "awaiting a CNC" : undefined },
    { label: "Verified", state: verified ? (verified.passed && verified.runtime_is_approved_artifact ? "done" : "failed") : "todo",
      detail: verified ? `${verified.results.filter((r) => r.passed).length}/${verified.results.length} tests passed` : undefined },
  ];
}

export function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="mono" style={{ fontSize: 12.5, overflowX: "auto", background: "var(--wash)", padding: 10, borderRadius: 6 }}>
      {diff.split("\n").map((line, i) => (
        <div key={i} style={{ color: line.startsWith("+") && !line.startsWith("+++") ? "var(--ok)"
          : line.startsWith("-") && !line.startsWith("---") ? "var(--stop)" : undefined }}>{line || " "}</div>
      ))}
    </pre>
  );
}

/**
 * What was recorded for each delivery step of a package: who recorded it,
 * when, and with which evidence (OMW project, build reference, CNC package,
 * verification evidence).
 */
export function RecordedSteps({ p }: { p: PackageView }) {
  const a = p.approval;
  if (!a) return null;
  const rows: { step: string; by?: string; at?: number | null; detail: string; evidence?: string }[] = [];
  for (const t of a.attempts?.write ?? []) {
    const r = t.recorded ?? {};
    rows.push({ step: "Check-in through OMW", by: r.by, at: t.finished_at ?? t.started_at,
      detail: `${r.omw_project ? `OMW project ${r.omw_project}` : t.detail}${r.note ? ` — ${r.note}` : ""}`, evidence: r.evidence_reference });
  }
  for (const t of a.attempts?.build ?? []) {
    const r = t.recorded ?? {};
    rows.push({ step: t.outcome === "built" ? "Build succeeded" : t.outcome === "failed" ? "Build failed" : `Build (${t.outcome})`,
      by: r.by, at: t.finished_at ?? t.started_at, detail: t.detail, evidence: r.build_reference });
  }
  if (a.cnc_activation) {
    const c = a.cnc_activation;
    rows.push({ step: "CNC activation in DEV", by: c.by, at: c.at, detail: `package ${c.package_name}${c.note ? ` — ${c.note}` : ""}`, evidence: c.evidence_reference });
  }
  if (a.verification) {
    const v = a.verification;
    rows.push({ step: v.passed && v.runtime_is_approved_artifact ? "Verified" : "Verification did not pass", by: v.by, at: v.at,
      detail: `${v.results.filter((r) => r.passed).length}/${v.results.length} tests passed; the active DEV runtime ${v.runtime_is_approved_artifact ? "is" : "is NOT"} the approved package (stated by the recorder)${v.note ? ` — ${v.note}` : ""}`,
      evidence: v.evidence_reference });
  }
  if (rows.length === 0) return <p className="notstated">No delivery step recorded yet.</p>;
  return (
    <table className="data">
      <thead><tr><th>Step</th><th>Recorded by</th><th>When</th><th>Detail</th><th>Evidence</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}><td>{r.step}</td><td>{r.by ?? "—"}</td><td className="hint">{recordedAt(r.at)}</td><td>{r.detail}</td>
          <td>{r.evidence || <span className="notstated">none</span>}</td></tr>
      ))}</tbody>
    </table>
  );
}

/**
 * The next recorded delivery step for an approved package, as a form:
 * check-in through OMW, build, CNC activation (CNC operator only) and
 * verification against the package's test plan. Jade re-checks the package,
 * approval, basis and scope before recording each step.
 */
export function PackageActions({ storyId, p, roles, onChanged }: { storyId: string; p: PackageView; roles: CompanyRole[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // check-in
  const [omwProject, setOmwProject] = useState("");
  const [applyEvidence, setApplyEvidence] = useState("");
  const [applyNote, setApplyNote] = useState("");
  // build
  const [buildOutcome, setBuildOutcome] = useState<"" | "succeeded" | "failed">("");
  const [buildReference, setBuildReference] = useState("");
  const [buildLog, setBuildLog] = useState("");
  // CNC
  const [pkgName, setPkgName] = useState("");
  const [cncEvidence, setCncEvidence] = useState("");
  const [cncNote, setCncNote] = useState("");
  // verification
  const plan = p.content.test_plan;
  const [results, setResults] = useState<Record<string, { passed: "" | "passed" | "failed"; note: string }>>({});
  const [runtimeIsApproved, setRuntimeIsApproved] = useState(false);
  const [verifyEvidence, setVerifyEvidence] = useState("");
  const [verifyNote, setVerifyNote] = useState("");

  const a = p.approval;
  if (!a || a.status !== "approved" || p.superseded_by) return null;
  const s = a.milestone_states;
  const canRecord = roles.includes("product_manager");
  const isCnc = roles.includes("cnc_operator");
  const cncRequired = p.content.toolchain?.requires_cnc_activation !== false;

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); setNotice(done); onChanged(); } catch (e) { setError(saveErrorMessage(e, "Nothing was recorded.")); } finally { setBusy(false); }
  }

  const unclear = ["unknown", "diverged"].includes(s.apply) || ["unknown", "diverged"].includes(s.build);
  const needApply = !unclear && s.apply !== "applied";
  const needBuild = !unclear && s.apply === "applied" && s.build !== "built" && s.build !== "failed";
  const buildFailed = s.build === "failed";
  const needCnc = s.build === "built" && !a.cnc_activation && cncRequired;
  const needVerify = s.build === "built" && (!!a.cnc_activation || !cncRequired) && !a.verification;
  const allResults = plan.every((t) => results[t.name]?.passed);
  const setResult = (name: string, patch: Partial<{ passed: "" | "passed" | "failed"; note: string }>) =>
    setResults({ ...results, [name]: { passed: results[name]?.passed ?? "", note: results[name]?.note ?? "", ...patch } });
  const needsRole = <p className="hint">Recording this step needs the Application Manager role.</p>;

  return (
    <div className="stack" style={{ gap: 8 }}>
      {unclear && (
        <div className="callout" style={{ borderColor: "var(--stop)" }}>
          <strong>An earlier step has an unclear outcome</strong>
          The check-in or build of this revision is recorded as {s.apply !== "applied" ? s.apply : s.build}. Check the actual state in DEV with
          the developer and CNC. It cannot be settled from this screen; the Jade Administrator can see the full record.
        </div>
      )}

      {needApply && (
        canRecord ? (
          <div className="callout">
            <strong>Record the check-in through OMW</strong>
            A developer checks exactly this candidate in through OMW in DEV (it is not active yet). Record the OMW project and evidence.
            <div className="grid halves" style={{ marginTop: 8 }}>
              <div className="field"><label htmlFor={`omw-${p.revision}`}>OMW project</label>
                <input id={`omw-${p.revision}`} type="text" value={omwProject} onChange={(e) => setOmwProject(e.target.value)} /></div>
              <div className="field"><label htmlFor={`apply-ev-${p.revision}`}>Evidence reference <span className="hint">(ticket, screenshot or log)</span></label>
                <input id={`apply-ev-${p.revision}`} type="text" value={applyEvidence} onChange={(e) => setApplyEvidence(e.target.value)} /></div>
            </div>
            <div className="field"><label htmlFor={`apply-note-${p.revision}`}>Note <span className="hint">(optional)</span></label>
              <input id={`apply-note-${p.revision}`} type="text" value={applyNote} onChange={(e) => setApplyNote(e.target.value)} /></div>
            <button className="btn primary" disabled={busy || !omwProject.trim() || !applyEvidence.trim()}
              onClick={() => act(() => technicalApi.recordApply(storyId, p.revision, { omwProject: omwProject.trim(), evidenceReference: applyEvidence.trim(), note: applyNote.trim() }),
                `Check-in recorded: OMW project ${omwProject.trim()}, evidence ${applyEvidence.trim()}.`)}>Record check-in</button>
          </div>
        ) : needsRole
      )}

      {needBuild && (
        canRecord ? (
          <div className="callout">
            <strong>Record the build</strong>
            Build the checked-in objects in DEV and record the result. A failed build goes to a repair: a new package revision.
            <div className="field" style={{ marginTop: 8 }}>
              <span style={{ display: "block", fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Result</span>
              <label style={{ display: "inline", fontWeight: 400, marginRight: 16 }}><input type="radio" name={`build-${p.revision}`} checked={buildOutcome === "succeeded"} onChange={() => setBuildOutcome("succeeded")} /> Succeeded</label>
              <label style={{ display: "inline", fontWeight: 400 }}><input type="radio" name={`build-${p.revision}`} checked={buildOutcome === "failed"} onChange={() => setBuildOutcome("failed")} /> Failed</label>
            </div>
            <div className="field"><label htmlFor={`build-ref-${p.revision}`}>Build reference <span className="hint">(package build name, job or ticket)</span></label>
              <input id={`build-ref-${p.revision}`} type="text" value={buildReference} onChange={(e) => setBuildReference(e.target.value)} /></div>
            <div className="field"><label htmlFor={`build-log-${p.revision}`}>Build log <span className="hint">(paste the relevant lines; the first 50 are kept)</span></label>
              <textarea id={`build-log-${p.revision}`} value={buildLog} onChange={(e) => setBuildLog(e.target.value)} /></div>
            <button className="btn primary" disabled={busy || !buildOutcome || !buildReference.trim()}
              onClick={() => act(() => technicalApi.recordBuild(storyId, p.revision, { succeeded: buildOutcome === "succeeded", buildReference: buildReference.trim(), log: buildLog }),
                `Build recorded as ${buildOutcome === "succeeded" ? "succeeded" : "failed"} (${buildReference.trim()}).`)}>Record build</button>
          </div>
        ) : needsRole
      )}

      {buildFailed && (
        <div className="callout" style={{ borderColor: "var(--stop)" }}>
          <strong>The build failed</strong>
          Start a repair: JADE prepares a corrected package revision from the build log, for a fresh approval.
        </div>
      )}

      {needCnc && (
        isCnc ? (
          <div className="callout">
            <strong>Record the CNC activation in DEV</strong>
            <div className="grid halves" style={{ marginTop: 8 }}>
              <div className="field"><label htmlFor={`cnc-pkg-${p.revision}`}>Package name</label>
                <input id={`cnc-pkg-${p.revision}`} type="text" value={pkgName} onChange={(e) => setPkgName(e.target.value)} /></div>
              <div className="field"><label htmlFor={`cnc-ev-${p.revision}`}>Evidence reference <span className="hint">(ticket or log)</span></label>
                <input id={`cnc-ev-${p.revision}`} type="text" value={cncEvidence} onChange={(e) => setCncEvidence(e.target.value)} /></div>
            </div>
            <div className="field"><label htmlFor={`cnc-note-${p.revision}`}>Note <span className="hint">(optional)</span></label>
              <input id={`cnc-note-${p.revision}`} type="text" value={cncNote} onChange={(e) => setCncNote(e.target.value)} /></div>
            <button className="btn primary" disabled={busy || !pkgName.trim() || !cncEvidence.trim()}
              onClick={() => act(() => technicalApi.recordCnc(storyId, p.revision, pkgName.trim(), cncEvidence.trim(), cncNote.trim()),
                `CNC activation recorded: package ${pkgName.trim()}, evidence ${cncEvidence.trim()}.`)}>Record CNC activation</button>
          </div>
        ) : <p className="hint">Awaiting the CNC activation in DEV. Only a CNC operator can record it; Jade never deploys a package.</p>
      )}

      {needVerify && (
        canRecord ? (
          <div className="callout">
            <strong>Record the verification</strong>
            Run the approved test plan in DEV against the active runtime and record a result for every test.
            {plan.length === 0 ? <p className="notstated">This package has no test plan, so there is nothing to verify against.</p> : (
              <table className="data" style={{ marginTop: 8 }}>
                <thead><tr><th>Test</th><th>Expected</th><th>Result</th><th>Note</th></tr></thead>
                <tbody>{plan.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name}<div className="hint">{t.kind}{t.event ? ` · ${t.event}` : ""}</div>
                      <div className="hint mono" style={{ fontSize: 12 }}>inputs {JSON.stringify(t.inputs)}</div></td>
                    <td className="mono" style={{ fontSize: 12 }}>{JSON.stringify(t.expected)}</td>
                    <td>
                      <select aria-label={`Result of ${t.name}`} value={results[t.name]?.passed ?? ""} onChange={(e) => setResult(t.name, { passed: e.target.value as "" | "passed" | "failed" })}>
                        <option value="">Choose…</option><option value="passed">Passed</option><option value="failed">Failed</option>
                      </select>
                    </td>
                    <td><input type="text" aria-label={`Note for ${t.name}`} value={results[t.name]?.note ?? ""} onChange={(e) => setResult(t.name, { note: e.target.value })} /></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <label style={{ display: "flex", gap: 6, fontWeight: 400, marginTop: 8 }}>
              <input type="checkbox" checked={runtimeIsApproved} onChange={(e) => setRuntimeIsApproved(e.target.checked)} />
              The active DEV runtime is the approved package (revision {p.revision})
            </label>
            <div className="grid halves" style={{ marginTop: 8 }}>
              <div className="field"><label htmlFor={`ver-ev-${p.revision}`}>Evidence reference <span className="hint">(test log, ticket or screenshots)</span></label>
                <input id={`ver-ev-${p.revision}`} type="text" value={verifyEvidence} onChange={(e) => setVerifyEvidence(e.target.value)} /></div>
              <div className="field"><label htmlFor={`ver-note-${p.revision}`}>Note <span className="hint">(optional)</span></label>
                <input id={`ver-note-${p.revision}`} type="text" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} /></div>
            </div>
            <button className="btn primary" disabled={busy || plan.length === 0 || !allResults || !verifyEvidence.trim()}
              onClick={() => act(() => technicalApi.recordVerification(storyId, p.revision, {
                results: plan.map((t) => ({ name: t.name, passed: results[t.name]?.passed === "passed", note: results[t.name]?.note ?? "" })),
                runtimeIsApprovedArtifact: runtimeIsApproved, evidenceReference: verifyEvidence.trim(), note: verifyNote.trim(),
              }), `Verification recorded: ${plan.filter((t) => results[t.name]?.passed === "passed").length}/${plan.length} tests passed.`)}>Record verification</button>
            {!allResults && plan.length > 0 && <div className="hint">Every test in the plan needs a result.</div>}
          </div>
        ) : needsRole
      )}

      {notice && <div className="callout" role="status"><strong>Recorded</strong>{notice}</div>}
      {error && <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}><strong>Not recorded</strong>{error}</div>}
    </div>
  );
}

export function PackageCard({ storyId, p, roles, onChanged }: { storyId: string; p: PackageView; roles: CompanyRole[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const c = p.content;
  const a = p.approval;
  const canApprove = roles.includes("product_manager") || roles.includes("admin") || roles.includes("domain_owner");

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  return (
    <section className="panel" style={{ opacity: p.superseded_by ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Package revision {p.revision}{" "}
          {p.superseded_by ? <span className="badge grey">superseded by revision {p.superseded_by}</span> : <span className="badge info">current</span>}</h3>
        <span className="hint mono">sha256 {p.content_sha256.slice(0, 16)}… · change {a?.change_id ?? "—"}</span>
      </div>
      <p className="hint">A developer-ready specification. JADE never changes JD Edwards: a developer checks the candidate in through OMW, it is
        built, a CNC activates it in DEV and the test plan is run -- each step is recorded here and re-checked against this exact approval.</p>

      <div className="btnrow" style={{ margin: "8px 0" }}>
        {milestoneSteps(p).map((s) => (
          <span key={s.label} className={`badge ${stepTone[s.state]}`} title={s.detail}>
            {s.label}: {s.state}{s.detail ? ` (${s.detail})` : ""}</span>
        ))}
      </div>

      <dl className="facts">
        <dt>Design and baseline</dt>
        <dd>design revision {c.design.design_revision} · baseline <span className="mono">{c.design.baseline_id}</span> · design approval <span className="mono">{c.design.design_approval_id}</span></dd>
        <dt>Target</dt><dd>{c.target_environment} · {c.objects.map((o) => `${o.object_name} (${o.object_type}, system code ${o.system_code}, ${o.format})`).join("; ")}</dd>
        <dt>Sources</dt>
        <dd>{c.sources.map((s) => (
          <div key={s.evidence_id}><span className="mono">{s.evidence_id}</span> sha256 {s.sha256.slice(0, 12)}…{" "}
            <span className={`badge ${s.classification === "verified_active_runtime" ? "ok" : s.classification === "runtime_export_attested" ? "warn" : "grey"}`}>{s.classification.replace(/_/g, " ")}</span>
            <div className="hint">{s.runtime_check?.detail} · {s.provenance?.repository} {s.provenance?.commit_ref}</div></div>
        ))}</dd>
        <dt>Candidates</dt>
        <dd>{c.candidates.map((k) => (
          <div key={k.object_key}><span className="mono">{k.file_name}</span> ({k.format}) <span className="hint mono">before {k.before_sha256.slice(0, 12)}… → after {k.after_sha256.slice(0, 12)}…</span></div>
        ))}</dd>
        <dt>Toolchain</dt>
        <dd>{c.toolchain.adapter ?? "—"} {c.toolchain.adapter_version ?? ""} · build {c.toolchain.requires_build ? "required" : "no"} · CNC activation {c.toolchain.requires_cnc_activation ? "required" : "no"}</dd>
        <dt>Dependencies</dt><dd>{c.dependencies.join("; ") || "—"}</dd>
        <dt>Missing evidence</dt><dd>{c.missing_evidence.length ? c.missing_evidence.join("; ") : <span className="notstated">none stated</span>}</dd>
        <dt>Unsupported</dt><dd>{c.unsupported.length ? c.unsupported.join("; ") : <span className="notstated">none stated</span>}</dd>
        {c.recovery?.plan && <><dt>Recovery</dt><dd>{c.recovery.plan}{c.recovery.constraints?.length > 0 && <div className="hint">{c.recovery.constraints.join("; ")}</div>}</dd></>}
        {c.repair_of && <><dt>Repair of</dt><dd>revision {c.repair_of.revision}: {c.repair_of.reason}</dd></>}
      </dl>

      <strong>How it satisfies the design</strong>
      <p>{c.explanation}</p>
      {c.requirement_trace.length > 0 && <ul>{c.requirement_trace.map((t, i) => <li key={i}><strong style={{ display: "inline" }}>{t.requirement}</strong>: {t.how}</li>)}</ul>}

      <strong>Exact diff</strong>
      <DiffView diff={c.diff} />

      <strong>Test plan</strong>
      <table className="data"><thead><tr><th>Test</th><th>Kind</th><th>Inputs</th><th>Expected</th><th>Result</th></tr></thead>
        <tbody>{c.test_plan.map((t) => {
          const r = a?.verification?.results.find((x) => x.name === t.name);
          return (<tr key={t.name}><td>{t.name}</td><td>{t.kind}</td><td className="mono" style={{ fontSize: 12 }}>{JSON.stringify(t.inputs)}</td>
            <td className="mono" style={{ fontSize: 12 }}>{JSON.stringify(t.expected)}</td>
            <td>{r ? <span className={`badge ${r.passed ? "ok" : "stop"}`}>{r.passed ? "passed" : "failed"}</span> : <span className="notstated">not recorded</span>}
              {r?.note && <div className="hint">{r.note}</div>}</td></tr>);
        })}</tbody></table>
      {a?.verification && <p className="hint">Recorded by {a.verification.by ?? "—"}: the active DEV runtime {a.verification.runtime_is_approved_artifact ? "IS" : "is NOT"} the approved package.</p>}

      <strong>Recorded delivery steps</strong>
      <RecordedSteps p={p} />

      {(a?.milestones ?? []).filter((m) => m.log?.length).map((m, i) => (
        <div key={i} className="callout" style={{ borderColor: m.milestone === "build_failed" ? "var(--stop)" : undefined }}>
          <strong>{m.milestone.replace(/_/g, " ")}{m.build_reference ? ` (${m.build_reference})` : ""}</strong>{m.log!.map((l, j) => <div key={j} className="mono" style={{ fontSize: 12.5 }}>{l}</div>)}</div>
      ))}

      <div className="callout" style={{ borderColor: p.eligibility.eligible ? "var(--ok)" : "var(--stop)" }}>
        <strong>Next step{p.eligibility.next_milestone ? `: ${p.eligibility.next_milestone.replace(/_/g, " ")}` : ""} -- {p.eligibility.eligible ? "can be recorded" : p.eligibility.next_milestone ? "cannot be recorded yet" : "none left"}</strong>
        {p.eligibility.reasons.map((r) => <div key={r} className="hint">{r}</div>)}
        {a?.status === "approved" && <div className="hint">Approved by {a.approved_by}. An approval is history; every step is re-checked before it is recorded.</div>}
        {(a?.invalidations ?? []).map((i) => <div key={i.at_iso} className="hint">Invalidated {i.at_iso}: {i.kind} -- {i.detail}</div>)}
      </div>

      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {!p.superseded_by && (
        <div className="stack" style={{ gap: 8 }}>
          {a?.status === "pending" && canApprove && (
            <div className="btnrow">
              <input aria-label="Approval note" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn primary" disabled={busy} onClick={() => act(() => technicalApi.approvePackage(storyId, p.revision, note))}>Approve this exact revision</button>
              <button className="btn danger" disabled={busy || !note.trim()} onClick={() => act(() => technicalApi.rejectPackage(storyId, p.revision, note))}>Reject</button>
            </div>
          )}
          <PackageActions storyId={storyId} p={p} roles={roles} onChanged={onChanged} />
        </div>
      )}
    </section>
  );
}

/**
 * The full technical record of a story's implementation (Technical tab):
 * the design and evidence baseline, the Technical Agent's runs, every
 * package revision with its diff, sources, toolchain, eligibility and the
 * recorded delivery steps, and the human actions. Every control is a
 * governed, recorded action.
 */
export function TechnicalWorkPanel({ storyId, roles, onChanged, designOnly = false }: { storyId: string; roles: CompanyRole[]; onChanged?: () => void; designOnly?: boolean }) {
  const [view, setView] = useState<TechnicalWorkView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    technicalApi.work(storyId).then((v) => { setView(v); setError(null); })
      .catch((e) => setError(saveErrorMessage(e, "Could not load the technical work.")));
  };
  useEffect(load, [storyId]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); load(); onChanged?.(); } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  if (!view) return error ? <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div> : <Loading what="technical work" />;
  const a = view.assignment;
  const canApprove = roles.includes("product_manager") || roles.includes("admin") || roles.includes("domain_owner");
  const canRun = roles.includes("product_manager") || roles.includes("admin");
  const changed = () => { load(); onChanged?.(); };
  const current = view.packages.find((p) => !p.superseded_by);
  const buildFailed = current?.approval?.milestone_states.build === "failed";

  return (
    <div className="stack">
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      <div className="callout">
        <strong>Recorded delivery{view.environment ? ` in ${view.environment}` : ""}</strong>
        <div>JADE prepares and checks; people check in, build, activate and verify in DEV and record each step here.</div>
        <div className="hint">Capability {view.capability.capability_id}: {view.capability.status ?? "—"}{view.capability.technical_validation ? ` -- ${view.capability.technical_validation}` : ""}</div>
      </div>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Architect design and evidence baseline</h2>
        {!a ? <p className="notstated">{view.assignment_problem}</p> : (
          <dl className="facts">
            <dt>Design</dt><dd>revision {a.design_revision} · route <strong style={{ display: "inline" }}>{a.route}</strong></dd>
            <dt>Evidence baseline</dt><dd><span className="mono">{a.baseline_id}</span> · sha256 {a.manifest_sha256.slice(0, 12)}… ·{" "}
              <span className={`badge ${a.baseline_status === "current" ? "ok" : "stop"}`}>{a.baseline_status?.replace(/_/g, " ")}</span></dd>
            <dt>Affected objects</dt><dd>{a.architect_decision.objects_affected.join(", ") || "—"}</dd>
            <dt>Specification</dt><dd>{a.implementation_spec.sequence.join("; ")}</dd>
            <dt>Target environment</dt><dd>{a.target_environment}</dd>
            <dt>Design approval</dt>
            <dd>{a.design_approval ? <>Approved by {a.design_approval.approved_by} ({new Date(a.design_approval.approved_at).toLocaleString("en-GB")}) for revision {a.design_approval.design_revision}</>
              : canApprove && (a.route === "Technical Agent" || a.route === "Mixed") ? (
                <button className="btn primary" disabled={busy} onClick={() => act(() => technicalApi.approveDesign(view.story_id, a.design_revision, "approved from the Technical view"))}>Approve design revision {a.design_revision}</button>
              ) : <span className="notstated">not approved{a.route === "Clarification Required" ? " -- the Architect needs a business answer first" : ""}</span>}</dd>
          </dl>
        )}
      </section>
      {!designOnly && <>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Technical Agent runs</h2>
        {a?.design_approval && canRun && (
          <div className="btnrow" style={{ marginBottom: 8 }}>
            <button className="btn small" disabled={busy} onClick={() => act(() => technicalApi.startRun(view.story_id, "prepare"))}>Start: prepare a package</button>
            {buildFailed && <button className="btn small primary" disabled={busy} onClick={() => act(() => technicalApi.startRun(view.story_id, "repair"))}>Start: repair the failed build</button>}
          </div>
        )}
        {view.runs.length === 0 ? <p className="notstated">No runs yet.</p> : (
          <table className="data"><thead><tr><th>Run</th><th>Purpose</th><th>Status</th><th>Outcome</th><th>Model / cost</th><th>When</th></tr></thead>
            <tbody>{view.runs.map((r) => (
              <tr key={r.run_id}><td className="mono">{r.run_id}</td><td>{r.purpose}</td>
                <td><span className={`badge ${r.status === "completed" ? "ok" : r.status === "failed" ? "stop" : "warn"}`}>{r.status}</span>{r.error && <div className="hint">{r.error}</div>}</td>
                <td>{r.outcome.kind?.replace(/_/g, " ") ?? "—"}{r.outcome.questions?.map((q) => <div key={q} className="hint">Q: {q}</div>)}</td>
                <td className="hint">{r.model ?? "—"}{r.usage.total_cost_usd != null ? ` · USD ${r.usage.total_cost_usd.toFixed(3)}` : ""}</td>
                <td className="hint">{new Date(r.started_at).toLocaleString("en-GB")}</td></tr>
            ))}</tbody></table>
        )}
      </section>
      {view.packages.map((p) => <PackageCard key={p.revision} storyId={view.story_id} p={p} roles={roles} onChanged={changed} />)}
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Human actions</h2>
        {view.human_actions.length === 0 ? <p className="notstated">None yet.</p> : (
          <ul>{view.human_actions.map((h, i) => (
            <li key={i}><strong style={{ display: "inline" }}>{h.action.replace(/_/g, " ")}</strong> by {h.by} -- {h.detail}</li>
          ))}</ul>
        )}
      </section>
      </>}
    </div>
  );
}
