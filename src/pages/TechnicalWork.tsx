import { useEffect, useState } from "react";
import { api, IS_MOCK_MODE } from "../services/api";
import { saveErrorMessage } from "../services/saveErrors";
import { technicalApi, type PackageView, type TechnicalWorkView } from "../services/technicalApi";
import type { Change, CompanyRole } from "../types/domain";
import { Loading } from "../components/ui";

const TECHNICAL_ROUTES = new Set(["Technical Agent", "Mixed", "Clarification Required"]);

type StepState = "done" | "failed" | "waiting" | "blocked" | "unknown" | "todo";
const stepTone: Record<StepState, string> = { done: "ok", failed: "stop", waiting: "warn", blocked: "stop", unknown: "stop", todo: "grey" };

/** Each milestone separately -- never collapsed into one success. */
function milestoneSteps(p: PackageView): { label: string; state: StepState; detail?: string }[] {
  const a = p.approval;
  const s = a?.milestone_states;
  const stateOf = (v: string | undefined, ok: string): StepState =>
    v === ok ? "done" : v === "failed" ? "failed" : v === "unknown" ? "unknown" : v === "in_progress" ? "waiting" : "todo";
  const verified = a?.verification;
  return [
    { label: "Prepared", state: "done", detail: `revision ${p.revision}` },
    { label: "Exact approval", state: a?.status === "approved" ? "done" : a?.status === "rejected" ? "failed" : "waiting",
      detail: a?.status ?? "none" },
    { label: "Applied (checked in, not active)", state: stateOf(s?.apply, "applied") },
    { label: "Built", state: stateOf(s?.build, "built") },
    { label: "Human CNC activation", state: a?.cnc_activation ? "done" : s?.build === "built" ? "waiting" : "todo",
      detail: a?.cnc_activation ? `${a.cnc_activation.package_name} by ${a.cnc_activation.by}` : s?.build === "built" ? "awaiting a CNC" : undefined },
    { label: "Verified", state: verified ? (verified.passed && verified.runtime_is_approved_artifact ? "done" : "failed") : "todo",
      detail: verified ? `${verified.results.filter((r) => r.passed).length}/${verified.results.length} tests passed` : undefined },
  ];
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="mono" style={{ fontSize: 12.5, overflowX: "auto", background: "var(--wash)", padding: 10, borderRadius: 6 }}>
      {diff.split("\n").map((line, i) => (
        <div key={i} style={{ color: line.startsWith("+") && !line.startsWith("+++") ? "var(--ok)"
          : line.startsWith("-") && !line.startsWith("---") ? "var(--stop)" : undefined }}>{line || " "}</div>
      ))}
    </pre>
  );
}

function PackageCard({ storyId, p, roles, onChanged }: { storyId: string; p: PackageView; roles: CompanyRole[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pkgName, setPkgName] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const c = p.content;
  const a = p.approval;
  const canApprove = roles.includes("product_manager") || roles.includes("admin") || roles.includes("domain_owner");
  const canOperate = roles.includes("product_manager") || roles.includes("admin");
  const isCnc = roles.includes("cnc_operator");

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  return (
    <section className="panel" style={{ opacity: p.superseded_by ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Package revision {p.revision}{" "}
          {p.superseded_by ? <span className="badge grey">superseded by revision {p.superseded_by}</span> : <span className="badge info">current</span>}{" "}
          <span className="badge warn">{c.mode === "simulation" ? "SIMULATION" : c.mode}</span></h3>
        <span className="hint mono">sha256 {p.content_sha256.slice(0, 16)}… · change {a?.change_id ?? "—"}</span>
      </div>
      <p className="hint">Generated source is a candidate, not an implemented JDE change. It becomes active in the simulated DEV only after
        an approved application, a successful build and a recorded human CNC activation.</p>

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
        <dt>Toolchain</dt>
        <dd>{c.toolchain.adapter} {c.toolchain.adapter_version} · build {c.toolchain.requires_build ? "required" : "no"} · CNC activation {c.toolchain.requires_cnc_activation ? "required" : "no"}
          <div className="hint">Live adapter: {c.toolchain.live_adapter.available ? "available" : `unavailable -- ${c.toolchain.live_adapter.reason}`}</div></dd>
        <dt>Dependencies</dt><dd>{c.dependencies.join("; ") || "—"}</dd>
        <dt>Missing evidence</dt><dd>{c.missing_evidence.length ? c.missing_evidence.join("; ") : <span className="notstated">none stated</span>}</dd>
        <dt>Unsupported</dt><dd>{c.unsupported.length ? c.unsupported.join("; ") : <span className="notstated">none stated</span>}</dd>
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
            <td>{r ? <span className={`badge ${r.passed ? "ok" : "stop"}`}>{r.passed ? "passed" : "failed"}</span> : <span className="notstated">not run</span>}
              {r && !r.passed && <div className="hint">{r.error ?? JSON.stringify(r.actual)}</div>}</td></tr>);
        })}</tbody></table>
      {a?.verification && <p className="hint">Active simulated runtime {a.verification.runtime_is_approved_artifact ? "IS" : "is NOT"} the approved artifact.</p>}

      {(a?.milestones ?? []).filter((m) => m.log?.length).map((m, i) => (
        <div key={i} className="callout" style={{ borderColor: m.milestone === "build_failed" ? "var(--stop)" : undefined }}>
          <strong>{m.milestone.replace(/_/g, " ")}</strong>{m.log!.map((l) => <div key={l} className="mono" style={{ fontSize: 12.5 }}>{l}</div>)}</div>
      ))}

      <div className="callout" style={{ borderColor: p.eligibility.eligible ? "var(--ok)" : "var(--stop)" }}>
        <strong>Execution eligibility: {p.eligibility.eligible ? "eligible (simulation only)" : "not eligible"}</strong>
        {p.eligibility.reasons.map((r) => <div key={r} className="hint">{r}</div>)}
        {a?.status === "approved" && <div className="hint">Approved by {a.approved_by}. An approval is history; eligibility is re-checked before every milestone.</div>}
        {(a?.invalidations ?? []).map((i) => <div key={i.at_iso} className="hint">Invalidated {i.at_iso}: {i.kind} -- {i.detail}</div>)}
      </div>

      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {!p.superseded_by && (
        <div className="stack" style={{ gap: 8 }}>
          {a?.status === "pending" && canApprove && (
            <div className="btnrow">
              <input aria-label="Approval note" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn primary" disabled={busy} onClick={() => act(() => technicalApi.approvePackage(storyId, p.revision, note))}>Approve this exact revision (simulation only)</button>
              <button className="btn danger" disabled={busy || !note.trim()} onClick={() => act(() => technicalApi.rejectPackage(storyId, p.revision, note))}>Reject</button>
            </div>
          )}
          {a?.status === "approved" && canOperate && (
            <div className="btnrow">
              <button className="btn" disabled={busy} onClick={() => act(() => technicalApi.milestone(storyId, p.revision, "apply"))}>Apply (simulation)</button>
              <button className="btn" disabled={busy} onClick={() => act(() => technicalApi.milestone(storyId, p.revision, "build"))}>Build (simulation)</button>
              <button className="btn" disabled={busy} onClick={() => act(() => technicalApi.milestone(storyId, p.revision, "verify"))}>Run verification tests</button>
              {(a.milestone_states.apply === "unknown" || a.milestone_states.build === "unknown") && (
                <button className="btn" disabled={busy} onClick={() => act(() => technicalApi.reconcile(storyId, p.revision,
                  a.milestone_states.apply === "unknown" ? "apply" : "build", "reconciled from the Technical work screen"))}>Reconcile the unknown outcome</button>
              )}
            </div>
          )}
          {a?.status === "approved" && a.milestone_states.build === "built" && !a.cnc_activation && (
            isCnc ? (
              <div className="btnrow">
                <input aria-label="Package name" placeholder="Package name" value={pkgName} onChange={(e) => setPkgName(e.target.value)} />
                <input aria-label="Evidence reference" placeholder="Evidence reference (ticket, log)" value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} />
                <button className="btn primary" disabled={busy || !pkgName.trim() || !evidenceRef.trim()}
                  onClick={() => act(() => technicalApi.recordCnc(storyId, p.revision, pkgName, evidenceRef, "recorded from the Technical work screen"))}>
                  Record CNC activation</button>
              </div>
            ) : <p className="hint">Awaiting a human CNC activation. Only a CNC operator can record it; Jade never deploys a package.</p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Technical work: the approved Architect design and its evidence baseline,
 * the Technical Agent's runs and package revisions, exact approval and
 * eligibility, and every milestone separately. Everything is SIMULATION.
 */
export function TechnicalWork() {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<TechnicalWorkView | null>(null);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listChanges().then((all) => {
      const list = all.filter((c) => TECHNICAL_ROUTES.has(c.architectDecision?.recommendedRoute ?? ""));
      setChanges(list);
      setOpenId((cur) => cur ?? list[0]?.id ?? null);
    });
    api.getSession().then((s) => setRoles(s.customers.find((c) => c.id === s.activeCustomerId)?.roles ?? []));
  }, []);

  const load = () => {
    if (!openId) { setView(null); return; }
    technicalApi.work(openId).then((v) => { setView(v); setError(null); })
      .catch((e) => setError(saveErrorMessage(e, "Could not load the technical work.")));
  };
  useEffect(load, [openId]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); load(); } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  if (IS_MOCK_MODE) return <section className="panel"><h1>Technical Work</h1><p className="notstated">Technical work needs the real backend; the demo never simulates the Technical Agent.</p></section>;
  if (!changes) return <Loading what="technical work" />;
  const a = view?.assignment;
  const canApprove = roles.includes("product_manager") || roles.includes("admin") || roles.includes("domain_owner");

  return (
    <div className="stack">
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Technical Work</h1>
        <p className="hint">From an approved Architect design to a verified change in the <strong>simulated</strong> DEV estate. The Technical Agent prepares;
          people approve the design and each exact package revision; a human CNC activates; Jade's executor re-checks everything before each milestone.</p>
        {changes.length === 0 ? <p className="notstated">No story has a design routed to the Technical Agent.</p> : (
          <div className="btnrow">{changes.map((c) => (
            <button key={c.id} className={`btn small${c.id === openId ? " primary" : ""}`} onClick={() => setOpenId(c.id)}>{c.id}</button>
          ))}</div>
        )}
      </section>
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {view && (
        <>
          <div className="callout" style={{ borderColor: "var(--warn)" }}>
            <strong>{view.simulation_label ?? "LIVE"}</strong>
            <div>{view.format_label}</div>
            <div className="hint">Capability {view.capability.capability_id}: {view.capability.status} -- {view.capability.technical_validation}</div>
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
                    <button className="btn primary" disabled={busy} onClick={() => act(() => technicalApi.approveDesign(view.story_id, a.design_revision, "approved from the Technical work screen"))}>Approve design revision {a.design_revision}</button>
                  ) : <span className="notstated">not approved{a.route === "Clarification Required" ? " -- the Architect needs a business answer first" : ""}</span>}</dd>
              </dl>
            )}
          </section>
          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Technical Agent runs</h2>
            {a?.design_approval && (
              <div className="btnrow" style={{ marginBottom: 8 }}>
                {(["prepare", "execute", "verify"] as const).map((p) => (
                  <button key={p} className="btn small" disabled={busy} onClick={() => act(() => technicalApi.startRun(view.story_id, p))}>Start: {p}</button>
                ))}
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
          {view.packages.map((p) => <PackageCard key={p.revision} storyId={view.story_id} p={p} roles={roles} onChanged={load} />)}
          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Human actions</h2>
            {view.human_actions.length === 0 ? <p className="notstated">None yet.</p> : (
              <ul>{view.human_actions.map((h, i) => (
                <li key={i}><strong style={{ display: "inline" }}>{h.action.replace(/_/g, " ")}</strong> by {h.by} -- {h.detail}{h.simulated ? " (simulated hand-off)" : ""}</li>
              ))}</ul>
            )}
          </section>
          {view.estate && (
            <section className="panel">
              <h2 style={{ marginTop: 0 }}>Simulated DEV estate {view.estate.environment} (revision {view.estate.revision})</h2>
              <table className="data"><thead><tr><th>Object</th><th>Active runtime</th><th>Checked in (not active)</th><th>Last build</th></tr></thead>
                <tbody>{Object.entries(view.estate.objects).map(([k, o]) => (
                  <tr key={k}><td className="mono">{k}</td><td className="mono">{o.active_sha256.slice(0, 12)}… ({o.active_package})</td>
                    <td className="mono">{o.checked_in_sha256 ? `${o.checked_in_sha256.slice(0, 12)}…` : "—"}</td>
                    <td>{o.build ? <span className={`badge ${o.build.status === "built" ? "ok" : "stop"}`}>{o.build.status}</span> : "—"}</td></tr>
                ))}</tbody></table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
