import { useEffect, useState } from "react";
import { api, IS_MOCK_MODE } from "../services/api";
import { saveErrorMessage } from "../services/saveErrors";
import { processApi, type AsBuiltRecord, type AsBuiltView, type Checkpoint, type MapVersion, type PinnedRef } from "../services/processApi";
import type { Change } from "../types/domain";
import type { Navigate, NavTarget } from "../types/nav";
import { Loading } from "../components/ui";
import { ProcessMapDiagram } from "../components/ProcessMapDiagram";
import { JourneyBar } from "./ProcessWork";

function Checkpoints({ items }: { items: Checkpoint[] }) {
  return (
    <ul style={{ listStyle: "none", paddingLeft: 0 }}>{items.map((c) => (
      <li key={c.id}><span className={`badge ${c.complete ? "ok" : "stop"}`}>{c.complete ? "complete" : "missing"}</span> {c.label}
        <span className="hint"> -- {c.detail}</span></li>))}</ul>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function RecordView({ rec, onNavigate }: { rec: AsBuiltRecord; onNavigate?: Navigate }) {
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
        {us?.acceptance_criteria?.length > 0 && <ul>{us.acceptance_criteria.map((a: any) => <li key={a.id}>{a.id}: {a.text}</li>)}</ul>}</section>
      <section><h3>Processes</h3>
        {!mapping ? <p className="notstated">No reviewer decision.</p> : mapping.status === "no_mapping"
          ? <p>No mapping applies ({mapping.reviewer_name}): {mapping.no_mapping_reason}</p>
          : <><p className="hint">Confirmed by {mapping.reviewer_name}, mapping revision {mapping.revision}</p>
            <ul>{mapping.refs.map((r: PinnedRef) => (
              <li key={r.node_key}><button className="linkish" onClick={() => onNavigate?.("admin-process", { framework: r.framework_id, version: String(r.version), node: r.node_key })}>
                <span className="mono">{r.framework_id}@v{r.version}:{r.node_key}</span></button> {r.path.map((p) => p.name).join(" › ")}
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
        </>) : func ? <p>Exact change {func.exact_change.application}/{func.exact_change.version} option {func.exact_change.option} → {func.exact_change.proposed_value}</p>
          : <p className="notstated">No implementation recorded.</p>}
      </section>
      <section><h3>Verification</h3>
        {tech?.verification ? (
          <table className="grid"><thead><tr><th>Test</th><th>Kind</th><th>Result</th></tr></thead>
            <tbody>{tech.verification.results.map((r: any) => <tr key={r.name}><td>{r.name}</td><td>{r.kind}</td>
              <td><span className={`badge ${r.passed ? "ok" : "stop"}`}>{r.passed ? "passed" : "failed"}</span></td></tr>)}</tbody></table>
        ) : <p className="notstated">No verification evidence.</p>}
      </section>
      <section><h3>Deviations from the design</h3>{c.deviations.length ? <ul>{c.deviations.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : <p>None found.</p>}</section>
      <section><h3>Unresolved limitations</h3>{c.limitations.length ? <ul>{c.limitations.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : <p>None recorded.</p>}</section>
      <p className="hint mono">record sha256 {rec.content_sha256}</p>
    </div>
  );
}

export function AsBuilt({ navFilter, navToken, onNavigate }: Partial<NavTarget> & { onNavigate?: Navigate }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<AsBuiltView | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (IS_MOCK_MODE) return;
    api.listChanges().then((all) => {
      const list = all.filter((c) => c.architectDecision);
      setChanges(list);
      setOpenId((cur) => navFilter?.story ?? cur ?? list.find((c) => c.id === "S-BW-RETURNS")?.id ?? list[0]?.id ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navToken]);
  const load = (select?: number) => {
    if (!openId) return;
    processApi.asBuilt(openId).then((v) => { setView(v); setShown(select ?? v.records[0]?.version ?? null); setError(null); })
      .catch((e) => setError(saveErrorMessage(e, "Could not load the as-built record.")));
  };
  useEffect(() => load(), [openId]);

  async function act(fn: () => Promise<AsBuiltRecord>) {
    setBusy(true); setError(null);
    try { const r = await fn(); load(r.version); } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  if (IS_MOCK_MODE) return <section className="panel"><h1>As-built Records</h1><p className="notstated">Needs the real backend.</p></section>;
  if (!changes) return <Loading what="stories" />;
  const rec = view?.records.find((r) => r.version === shown);

  return (
    <div className="stack">
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>As-built Records</h1>
        <p className="hint">What was actually delivered: generated from the story, its confirmed processes and maps, the approved design,
          the applied implementation and its verification evidence -- with deviations and open limitations. Finalised only when every required checkpoint is complete.</p>
        <div className="btnrow">{changes.map((c) => (
          <button key={c.id} className={`btn small${c.id === openId ? " primary" : ""}`} onClick={() => setOpenId(c.id)}>{c.id}</button>))}</div>
      </section>
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {view && openId && (<>
        <section className="panel">
          <JourneyBar storyId={openId} at="asbuilt" onNavigate={onNavigate} />
          <h2>Checkpoints now {view.delivery_mode_now === "simulation" && <span className="badge warn">SIMULATED delivery</span>}</h2>
          <Checkpoints items={view.checkpoints_now} />
          <div className="btnrow"><button className="btn primary" disabled={busy} onClick={() => act(() => processApi.generateAsBuilt(openId))}>Generate new version</button></div>
        </section>
        {view.records.length > 0 && (
          <section className="panel">
            <div className="btnrow">{view.records.map((r) => (
              <button key={r.version} className={`btn small${r.version === shown ? " primary" : ""}`} onClick={() => setShown(r.version)}>
                v{r.version} · {r.status}</button>))}</div>
            {rec && (<>
              <h2>{openId} as-built record · version {rec.version}{" "}
                <span className={`badge ${rec.status === "final" ? "ok" : rec.status === "draft" ? "warn" : "grey"}`}>{rec.status.toUpperCase()}</span></h2>
              <p className="hint">Generated by {rec.generated_by} at {rec.generated_at.slice(0, 16).replace("T", " ")}
                {rec.finalised_at && <> · finalised by {rec.finalised_by} at {rec.finalised_at.slice(0, 16).replace("T", " ")}</>}</p>
              <div className="btnrow">
                <button className="btn small" onClick={() => processApi.downloadMarkdown(openId, rec.version).catch((e) => setError(String(e)))}>Download Markdown</button>
                {rec.status === "draft" && view.can_finalise && (
                  <button className="btn primary" disabled={busy || !rec.content.all_checkpoints_complete}
                          onClick={() => act(() => processApi.finaliseAsBuilt(openId, rec.version))}>Finalise this version</button>)}
                {rec.status === "draft" && !rec.content.all_checkpoints_complete && <span className="hint">Cannot finalise: required checkpoints are missing.</span>}
              </div>
              <RecordView rec={rec} onNavigate={onNavigate} />
            </>)}
          </section>
        )}
      </>)}
    </div>
  );
}
