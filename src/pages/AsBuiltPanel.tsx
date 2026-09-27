import { VisualFacts } from "../components/workspaceVisuals";
import { useEffect, useState } from "react";
import { IS_MOCK_MODE } from "../services/api";
import { saveErrorMessage } from "../services/saveErrors";
import { processApi, type AsBuiltRecord, type AsBuiltView, type Checkpoint, type MapVersion, type PinnedRef } from "../services/processApi";
import { Link } from "../router";
import { Details, Loading } from "../components/design";
import { ProcessMapDiagram } from "../components/ProcessMapDiagram";

export function Checkpoints({ items }: { items: Checkpoint[] }) {
  return (
    <ul style={{ listStyle: "none", paddingLeft: 0 }}>{items.map((c) => (
      <li key={c.id}><span className={`badge ${c.complete ? "ok" : "stop"}`}>{c.complete ? "complete" : "missing"}</span> {c.label}
        <span className="hint"> -- {c.detail}</span></li>))}</ul>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function RecordView({ rec }: { rec: AsBuiltRecord }) {
  const c = rec.content as any;
  const us = c.story?.user_story;
  const mapping = c.process?.mapping;
  const tech = c.implementation?.technical;
  const func = c.implementation?.functional;
  const design = c.design;
  return (
    <div className="stack">
      {c.simulated_notice && <div className="callout" style={{ borderColor: "var(--warn)" }}><strong>{c.simulated_notice}</strong></div>}
      <section><h3>Delivery checkpoints</h3><Checkpoints items={c.checkpoints} /></section>
      <section><h3>Story</h3><p>{us?.statement ?? c.story?.title}</p>
        {c.story_revision && <p className="hint">Story revision {c.story_revision.revision} by {c.story_revision.author_name}, applying {c.story_revision.applied_findings.length} finding(s);
          process mapping revision {c.story_revision.process_refs?.mapping_revision ?? "none"}.</p>}
        {us?.business_rules?.length > 0 && <ul>{us.business_rules.map((r: string) => <li key={r}>{r}</li>)}</ul>}
        {us?.acceptance_criteria?.length > 0 && <ul>{us.acceptance_criteria.map((a: any) => <li key={a.id}>{a.id}: {a.text}</li>)}</ul>}</section>
      <section><h3>Processes</h3>
        {!mapping ? <p className="notstated">No reviewer decision.</p> : mapping.status === "no_mapping"
          ? <p>No mapping applies ({mapping.reviewer_name}): {mapping.no_mapping_reason}</p>
          : <><p className="hint">Confirmed by {mapping.reviewer_name}, mapping revision {mapping.revision}</p>
            <ul>{mapping.refs.map((r: PinnedRef) => (
              <li key={r.node_key}><Link to={`/business?node=${encodeURIComponent(r.node_key)}`}>{r.path.map((p) => p.name).join(" › ")}</Link>
                <span className="hint mono"> {r.node_key} v{r.version}</span>
                {r.status_now && r.status_now.state !== "current" && r.status_now.state !== "unchanged" && <span className="badge warn"> {r.status_now.state}</span>}</li>))}</ul></>}
      </section>
      {(["as_is", "to_be"] as const).map((k) => {
        const v: MapVersion | null = c.process?.maps?.[k];
        return (
          <section key={k}><h3>{k === "as_is" ? "As-is" : "To-be"} process map {v ? `(version ${v.version})` : ""}</h3>
            {v ? <ProcessMapDiagram content={v.content} /> : <p className="notstated">None recorded.</p>}</section>
        );
      })}
      <section><h3>Design</h3>
        {design?.architect_decision ? <p>Route <strong>{design.architect_decision.recommended_route}</strong>; objects {(design.architect_decision.objects_affected ?? []).join(", ") || "none"}.
          {design.baseline && <> Evidence baseline <span className="mono">{design.baseline.baseline_id}</span> ({design.baseline.status.replace(/_/g, " ")}).</>}
          {design.design_approval && <> Approved by {design.design_approval.approved_by}.</>}</p> : <p className="notstated">No design.</p>}
      </section>
      <section><h3>Implementation</h3>
        {tech ? (<>
          <p>Package revision {tech.revision} ({tech.mode}) approved by {tech.approval?.approved_by}. Objects: {tech.objects.map((o: any) => `${o.object_name} (${o.object_type})`).join(", ")}.</p>
          <p className="hint">{tech.format_label}</p>
          <details><summary>Exact change (diff)</summary><pre className="mono" style={{ fontSize: 12, overflowX: "auto" }}>{tech.diff}</pre></details>
          {tech.cnc_activation && <p>CNC activation of {tech.cnc_activation.package_name} by {tech.cnc_activation.by} ({tech.cnc_activation.evidence_reference}){tech.cnc_activation.simulated ? " -- SIMULATED" : ""}.</p>}
        </>) : func ? (<>
          <p>Exact change <span className="mono">{func.change_id}</span> ({func.capability_id}), {func.environment}: <span className="mono">{func.operation.tool}</span>{" "}
            {func.operation.application}/{func.operation.version} option {func.operation.option}:{" "}
            <strong>{String(func.binding?.before_state?.value)} → {String(func.operation.value)}</strong></p>
          <p>Approved by {func.approval?.approvedBy ?? func.approval?.approved_by} (roles {(func.approver_authority?.roles ?? []).join(", ")}).</p>
          <ul>{(["write", "test"] as const).flatMap((k) => (func.attempts?.[k] ?? []).map((a: any) => (
            <li key={a.attempt_id}>{k} attempt: <strong>{a.outcome}</strong> -- {a.detail}</li>)))}</ul>
        </>) : <p className="notstated">No implementation recorded.</p>}
      </section>
      <section><h3>Verification</h3>
        {tech?.verification ? (
          <table className="grid"><thead><tr><th>Test</th><th>Kind</th><th>Result</th></tr></thead>
            <tbody>{tech.verification.results.map((r: any) => <tr key={r.name}><td>{r.name}</td><td>{r.kind}</td>
              <td><span className={`badge ${r.passed ? "ok" : "stop"}`}>{r.passed ? "passed" : "failed"}</span></td></tr>)}</tbody></table>
        ) : func ? (<>
          <div>Test orchestration {func.test_orchestration}: {func.exact_change.execution.test_state}{" "}
            {func.test_is_stub && <span className="badge warn">SIMULATION STUB -- fixed PASS, not behavioural evidence</span>}
            <div className="hint">{func.test_note}</div></div>
          <p><strong>Verification (read-back)</strong></p>
          <p>Read-back of the target: <strong>{String(func.readback?.value)}</strong>{" "}
            <span className={`badge ${func.readback?.matches_approved ? "ok" : "stop"}`}>{func.readback?.matches_approved ? "matches the approved value" : "does not match"}</span>
            <span className="hint"> {func.readback?.source}</span></p>
        </>) : <p className="notstated">No verification evidence.</p>}
      </section>
      <section><h3>Deviations from the design</h3>{c.deviations.length ? <ul>{c.deviations.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : <p>None found.</p>}</section>
      <section><h3>Unresolved limitations</h3>{c.limitations.length ? <ul>{c.limitations.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : <p>None recorded.</p>}</section>
      <p className="hint mono">record sha256 {rec.content_sha256}</p>
    </div>
  );
}

/**
 * Release: the as-built record of what was actually delivered, its
 * required checkpoints, and finalising it (which completes the story).
 */
export function AsBuiltPanel({ storyId, onChanged }: { storyId: string; onChanged?: () => void }) {
  const [view, setView] = useState<AsBuiltView | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (select?: number) => {
    processApi.asBuilt(storyId).then((v) => { setView(v); setShown(select ?? v.records[0]?.version ?? null); setError(null); })
      .catch((e) => setError(saveErrorMessage(e, "Could not load the as-built record.")));
  };
  useEffect(() => load(), [storyId]);

  async function act(fn: () => Promise<AsBuiltRecord>) {
    setBusy(true); setError(null);
    try { const r = await fn(); load(r.version); onChanged?.(); } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  if (IS_MOCK_MODE) return <p className="notstated">As-built records need the real backend.</p>;
  if (!view) return error ? <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div> : <Loading what="the as-built record" />;
  const rec = view.records.find((r) => r.version === shown);
  const missing = view.checkpoints_now.filter((c) => !c.complete);
  const snapshot = rec?.content as any;
  const deliveredObjects: string[] = snapshot?.implementation?.technical?.objects?.map((o: any) => `${o.object_name} (${o.object_type})`) ?? (snapshot?.implementation?.functional ? [`${snapshot.implementation.functional.operation.application} / ${snapshot.implementation.functional.operation.version} · ${snapshot.implementation.functional.operation.option}`] : []);

  return (
    <div className="stack vr-pilot">
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      <p style={{ margin: 0 }}>
        {missing.length === 0
          ? "Every required delivery checkpoint is complete."
          : `${missing.length} required checkpoint${missing.length === 1 ? " is" : "s are"} not complete yet: ${missing.map((c) => c.label.toLowerCase()).join("; ")}.`}
        {view.delivery_mode_now === "simulation" && <> <span className="tag sim">Simulation</span></>}
      </p>
      <Details summary={`Delivery checkpoints (${view.checkpoints_now.length - missing.length} of ${view.checkpoints_now.length} complete)`}>
        <Checkpoints items={view.checkpoints_now} />
      </Details>
      <div className="btnrow">
        <button className="btn" disabled={busy} onClick={() => act(() => processApi.generateAsBuilt(storyId))}>
          {view.records.length ? "Generate a new version" : "Generate the as-built record"}</button>
        {rec && rec.status === "draft" && view.can_finalise && (
          <button className="btn primary" disabled={busy || !rec.content.all_checkpoints_complete}
                  onClick={() => act(() => processApi.finaliseAsBuilt(storyId, rec.version))}>Finalise and complete the story</button>)}
        {rec && rec.status === "draft" && !rec.content.all_checkpoints_complete && <span className="hint">Can be finalised once every checkpoint is complete.</span>}
      </div>
      {view.records.length > 0 && (
        <div className="stack">
          <div className="btnrow">{view.records.map((r) => (
            <button key={r.version} className={`btn small${r.version === shown ? " primary" : ""}`} onClick={() => setShown(r.version)}>
              Version {r.version} · {r.status}</button>))}</div>
          {rec && (<>
            <p className="hint" style={{ margin: 0 }}>Version {rec.version}{" "}
              <span className={`badge ${rec.status === "final" ? "ok" : rec.status === "draft" ? "warn" : "grey"}`}>{rec.status}</span>
              {" "}generated by {rec.generated_by} at {rec.generated_at.slice(0, 16).replace("T", " ")}
              {rec.finalised_at && <> · finalised by {rec.finalised_by} at {rec.finalised_at.slice(0, 16).replace("T", " ")}</>}
              {" "}· <button className="linkish" onClick={() => processApi.downloadMarkdown(storyId, rec.version).catch((e) => setError(String(e)))}>Download as Markdown</button></p>
            <section aria-label="As-built summary"><VisualFacts items={[
              {label:"Record",value:`Version ${rec.version} · ${rec.status}`},
              {label:"Delivery checkpoints",value:`${view.checkpoints_now.length - missing.length} / ${view.checkpoints_now.length}`,tone:missing.length ? "" : "ok"},
              {label:"Deviations",value:rec.content.deviations.length,tone:rec.content.deviations.length ? "stop" : ""},
              {label:"Open limitations",value:rec.content.limitations.length,tone:rec.content.limitations.length ? "stop" : ""},
            ]} /><p>{(rec.content as any).story?.user_story?.statement ?? (rec.content as any).story?.title}</p>
              <div className="vr-object-list" aria-label="Delivered objects and configuration">{deliveredObjects.map((o) => <span key={o}>{o}</span>)}</div>
              <span className="vr-note">Record version, not a production release version. Release / CNC promotion remains outside JADE.</span>
            </section>
            <Details summary="Read the as-built record">
              <RecordView rec={rec} />
            </Details>
          </>)}
        </div>
      )}
    </div>
  );
}
