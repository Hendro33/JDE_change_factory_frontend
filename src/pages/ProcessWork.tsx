import { useEffect, useState } from "react";
import { api, IS_MOCK_MODE } from "../services/api";
import { saveErrorMessage } from "../services/saveErrors";
import {
  processApi, type DiffLine, type FrameworkNode, type MapContent, type MapStep, type PinnedRef, type RefinementView,
  type StoryProcessView,
} from "../services/processApi";
import type { Change } from "../types/domain";
import type { Navigate, NavTarget } from "../types/nav";
import { Loading } from "../components/ui";
import { ProcessMapDiagram } from "../components/ProcessMapDiagram";

const refTone: Record<string, string> = { current: "ok", unchanged: "ok", changed: "warn", removed: "stop", framework_inactive: "stop" };

/** The connected journey for one story, each stop a link. */
export function JourneyBar({ storyId, at, onNavigate, frameworkId }: { storyId: string; at: string; onNavigate?: Navigate; frameworkId?: string }) {
  const stops: [string, string, () => void][] = [
    ["hierarchy", "Process hierarchy", () => onNavigate?.("admin-process", frameworkId ? { framework: frameworkId } : undefined)],
    ["process", "Story & processes", () => onNavigate?.("process", { story: storyId })],
    ["maps", "Process maps", () => onNavigate?.("process", { story: storyId, section: "maps" })],
    ["design", "Design", () => onNavigate?.("architecture", { story: storyId })],
    ["implementation", "Implementation", () => onNavigate?.("technical", { story: storyId })],
    ["asbuilt", "As-built record", () => onNavigate?.("asbuilt", { story: storyId })],
  ];
  return (
    <nav aria-label="Story journey" className="btnrow" style={{ flexWrap: "wrap", gap: 4 }}>
      {stops.map(([key, label, go], i) => (
        <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button className={`btn small${at === key ? " primary" : ""}`} onClick={go}>{label}</button>
          {i < stops.length - 1 && <span aria-hidden="true">→</span>}
        </span>
      ))}
    </nav>
  );
}

function RefList({ refs, onNavigate }: { refs: PinnedRef[]; onNavigate?: Navigate }) {
  return (
    <ul>{refs.map((r) => (
      <li key={`${r.framework_id}:${r.version}:${r.node_key}`}>
        <button className="linkish" onClick={() => onNavigate?.("admin-process", { framework: r.framework_id, version: String(r.version), node: r.node_key })}>
          <span className="mono">{r.node_key}</span></button> {r.path.map((p) => p.name).join(" › ")}
        <span className="hint"> · {r.framework_name} v{r.version}</span>
        {r.status_now && <> <span className={`badge ${refTone[r.status_now.state] ?? "grey"}`} title={r.status_now.detail}>{r.status_now.state === "changed" ? "changed in the active version" : r.status_now.state.replace("_", " ")}</span></>}
        {r.rationale && <div className="hint">{r.rationale}</div>}
      </li>
    ))}</ul>
  );
}

function MappingSection({ view, nodes, onChanged, onNavigate }: { view: StoryProcessView; nodes: FrameworkNode[]; onChanged: () => void; onNavigate?: Navigate }) {
  const run = view.runs[0];
  const suggestions = run?.result.suggested_processes ?? [];
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const mapped = new Set((view.mapping?.refs ?? []).map((r) => r.node_key));
    setChosen(Object.fromEntries(suggestions.map((s) => [s.node_key, view.mapping ? mapped.has(s.node_key) : true])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.run_id, view.mapping?.revision]);
  const fw = view.framework;
  const findings: [string, string, string[]][] = [
    ["accepted_requirements", "Missing requirements", run?.result.missing_requirements ?? []],
    ["accepted_controls", "Missing controls", run?.result.missing_controls ?? []],
    ["accepted_acceptance_criteria", "Missing acceptance criteria", run?.result.missing_acceptance_criteria ?? []],
  ];

  async function decide(status: "confirmed" | "no_mapping") {
    if (!fw) return;
    setBusy(true); setError(null);
    const refs = [
      ...suggestions.filter((s) => chosen[s.node_key]).map((s) => ({ framework_id: s.framework_id, version: s.version, node_key: s.node_key, rationale: s.rationale })),
      ...extra.split(/[,\s]+/).filter(Boolean).map((k) => ({ framework_id: fw.framework_id, version: fw.version, node_key: k, rationale: "added by the reviewer" })),
    ];
    try {
      await processApi.decide(view.story_id, { status, refs: status === "confirmed" ? refs : [], noMappingReason: reason,
        findings: {}, analysisRunId: run?.run_id ?? null, note, expectedRevision: view.mapping?.revision ?? 0 });
      setExtra(""); setReason(""); onChanged();
    } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>Story finalisation: affected processes</h2>
      {!fw ? <p className="notstated">No process framework is selected and active (Admin › Process Framework).</p> : (
        <p className="hint">Framework: <strong>{fw.name}</strong> v{fw.version} · {fw.source_kind === "synthetic_fixture"
          ? <span className="badge warn">SYNTHETIC fixture -- not APQC content</span> : fw.source_label}</p>
      )}
      <h3>Agent suggestions</h3>
      {!run ? <p className="notstated">No process analysis yet.</p> : (
        <div className="callout">
          <div>{run.scripted ? <span className="badge warn">SCRIPTED STAND-IN -- not a model run</span>
            : <span className="badge grey">Refinement agent run{run.model ? ` (${run.model})` : ""}</span>}
            {" "}<span className="hint">{run.run_id} · {run.status} · framework v{run.framework_version}</span></div>
          {run.error && <p style={{ color: "var(--stop)" }}>{run.error}</p>}
          {run.result.summary && <p>{run.result.summary}</p>}
          {suggestions.map((s) => (
            <label key={s.node_key} style={{ display: "block" }}>
              <input type="checkbox" disabled={!view.can_review} checked={!!chosen[s.node_key]}
                     onChange={(e) => setChosen({ ...chosen, [s.node_key]: e.target.checked })} />{" "}
              <span className="mono">{s.node_key}</span> {s.path.map((p) => p.name).join(" › ")} <span className="hint">({s.confidence}) {s.rationale}</span>
            </label>
          ))}
          {(run.result.rejected_suggestions ?? []).length > 0 && <p className="hint">Rejected (not in the framework): {run.result.rejected_suggestions!.join("; ")}</p>}
          {findings.some(([, , items]) => items.length > 0) && (
            <p className="hint">{findings.reduce((n, [, , items]) => n + items.length, 0)} missing requirement / control /
              acceptance-criterion finding(s): reviewed as story changes in <a href="#story-refinement">Story refinement</a> below.</p>)}
        </div>
      )}
      {view.can_review && fw && (
        <div className="btnrow"><button className="btn small" disabled={busy || run?.status === "running"}
          onClick={() => processApi.startAnalysis(view.story_id).then(onChanged).catch((e) => setError(saveErrorMessage(e, "Refused.")))}>
          Run refinement process analysis (real agent)</button>
          <span className="hint">Needs the Claude CLI configured for the backend; results are suggestions only.</span></div>
      )}

      <h3>Reviewer decision</h3>
      {view.mapping ? (
        <div className="callout" style={{ borderColor: view.mapping.status === "confirmed" ? "var(--ok)" : "var(--warn)" }}>
          <strong>{view.mapping.status === "confirmed" ? "Processes confirmed" : "No process mapping applies"}</strong>
          {" "}by {view.mapping.reviewer_name} · revision {view.mapping.revision} · {view.mapping.created_at.slice(0, 16).replace("T", " ")}
          {view.mapping.status === "confirmed" ? <RefList refs={view.mapping.refs} onNavigate={onNavigate} /> : <p>{view.mapping.no_mapping_reason}</p>}
          {Object.entries(view.mapping.findings).filter(([, v]) => v.length).map(([k, v]) => (
            <div key={k} className="hint">{k.replace(/_/g, " ")}: {v.join("; ")}</div>))}
        </div>
      ) : <p className="notstated">Not decided yet.</p>}
      {view.can_review && fw ? (
        <div className="stack">
          <label>Add processes by node id (from {fw.name} v{fw.version}):
            <input aria-label="Add process node ids" list="pf-nodes" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. SYN-5.1.2" />
            <datalist id="pf-nodes">{nodes.map((n) => <option key={n.node_key} value={n.node_key}>{n.name}</option>)}</datalist>
          </label>
          <label>Note <input aria-label="Decision note" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="btnrow">
            <button className="btn primary" disabled={busy} onClick={() => decide("confirmed")}>Confirm selected processes</button>
          </div>
          <label>Or record why no mapping applies:
            <input aria-label="No mapping reason" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="btnrow"><button className="btn small" disabled={busy || reason.trim().length < 10} onClick={() => decide("no_mapping")}>Record no mapping</button></div>
        </div>
      ) : !view.can_review && <p className="hint">Only a Product Manager, or the Domain Owner assigned to this story's business domain, can decide.</p>}
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {view.mapping_history.length > 1 && (
        <details><summary>Decision history ({view.mapping_history.length})</summary>
          <ul>{view.mapping_history.map((m) => <li key={m.revision}>r{m.revision} {m.status} by {m.reviewer_name} -- {m.refs.map((r) => `${r.node_key}@v${r.version}`).join(", ") || m.no_mapping_reason}</li>)}</ul>
        </details>
      )}
    </section>
  );
}


const sourceLabel: Record<string, JSX.Element> = {
  scripted_refinement: <span className="badge warn">scripted stand-in</span>,
  refinement_agent: <span className="badge grey">refinement agent</span>,
  architect: <span className="badge grey">Architect</span>,
};
const statusTone2: Record<string, string> = { proposed: "warn", applied: "ok", rejected: "stop", deferred: "grey" };

/** Accepted findings become a reviewed, attributed story revision -- agents never change the story themselves. */
function StoryRefinement({ storyId, onChanged }: { storyId: string; onChanged: () => void }) {
  const [v, setV] = useState<RefinementView | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = () => processApi.refinement(storyId).then((x) => { setV(x); setSel({}); setDiff(null); })
    .catch((e) => setError(saveErrorMessage(e, "Could not load findings.")));
  useEffect(() => { load(); setNotice(null); }, [storyId]);
  if (!v) return null;
  const chosen = Object.keys(sel).filter((k) => sel[k]);
  const open = (s: string) => s === "proposed" || s === "deferred";

  async function act(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true); setError(null);
    try { await fn(); if (msg) setNotice(msg); await load(); onChanged(); } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }
  return (
    <section className="panel" id="story-refinement">
      <h2 style={{ marginTop: 0 }}>Story refinement from findings</h2>
      <p className="hint">Agents only propose. A reviewer selects findings, checks the exact change to the approved story, and applies it
        as a new story revision. Applying one flags the design for reassessment and stops existing approvals from executing.</p>
      {v.findings.length === 0 ? <p className="notstated">No findings yet.</p> : (
        <table className="grid" style={{ fontSize: 13 }}>
          <thead><tr><th></th><th>Finding</th><th>Kind</th><th>From</th><th>Status</th><th></th></tr></thead>
          <tbody>{v.findings.map((f) => (
            <tr key={f.finding_id}>
              <td>{open(f.status) && v.can_review && <input type="checkbox" aria-label={`Select finding ${f.text}`} checked={!!sel[f.finding_id]}
                     onChange={(e) => { setSel({ ...sel, [f.finding_id]: e.target.checked }); setDiff(null); }} />}</td>
              <td>{f.text}</td><td>{f.kind.replace(/_/g, " ")}</td><td>{sourceLabel[f.source] ?? f.source}</td>
              <td><span className={`badge ${statusTone2[f.status]}`}>{f.status}{f.applied_in_revision ? ` in r${f.applied_in_revision}` : ""}</span>
                {f.reason && <div className="hint">{f.reason}{f.decided_by ? ` -- ${f.decided_by}` : ""}</div>}</td>
              <td>{v.can_review && f.status !== "applied" && (
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <input aria-label={`Reason for ${f.text}`} placeholder="reason" size={12} value={reason[f.finding_id] ?? ""}
                         onChange={(e) => setReason({ ...reason, [f.finding_id]: e.target.value })} />
                  {f.status !== "deferred" && <button className="btn small" disabled={busy} onClick={() => act(() => processApi.setFindingStatus(storyId, f.finding_id, "deferred", reason[f.finding_id] ?? ""))}>Defer</button>}
                  {f.status !== "rejected" && <button className="btn small" disabled={busy} onClick={() => act(() => processApi.setFindingStatus(storyId, f.finding_id, "rejected", reason[f.finding_id] ?? ""))}>Reject</button>}
                  {f.status !== "proposed" && <button className="btn small" disabled={busy} onClick={() => act(() => processApi.setFindingStatus(storyId, f.finding_id, "proposed", ""))}>Reopen</button>}
                </span>)}</td>
            </tr>))}</tbody>
        </table>
      )}
      {v.can_review && (
        <div className="btnrow" style={{ marginTop: 8 }}>
          <button className="btn small" disabled={busy || chosen.length === 0}
                  onClick={() => processApi.previewRefinement(storyId, chosen).then((d) => setDiff(d.diff)).catch((e) => setError(saveErrorMessage(e, "Refused.")))}>
            Preview story changes ({chosen.length})</button>
        </div>
      )}
      {diff && (
        <div className="callout">
          <strong>Proposed change to the approved story (revision {v.current_revision || 1} → {(v.current_revision || 1) + 1})</strong>
          {["business_rules", "acceptance_criteria"].map((sec) => (
            <div key={sec}><div className="hint">{sec === "business_rules" ? "Requirements and controls" : "Acceptance criteria"}</div>
              <pre className="mono" style={{ fontSize: 12.5, margin: 0, whiteSpace: "pre-wrap" }}>{diff.filter((d) => d.section === sec).map((d, i) => (
                <div key={i} style={{ color: d.op === "+" ? "var(--ok)" : undefined }}>{d.op} {d.line}</div>))}</pre></div>))}
          <label>Note <input aria-label="Revision note" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="btnrow"><button className="btn primary" disabled={busy}
            onClick={() => act(() => processApi.applyRefinement(storyId, chosen, note, v.current_revision),
              `Story revision ${(v.current_revision || 1) + 1} saved; the design is flagged for reassessment.`)}>Apply as a new story revision</button></div>
        </div>
      )}
      {notice && <div className="callout" style={{ borderColor: "var(--ok)" }}>{notice}</div>}
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {v.revisions.length > 0 && (
        <details open><summary>Story revisions ({v.revisions.length})</summary>
          <ul>{v.revisions.map((r) => (
            <li key={r.revision}><strong>r{r.revision}</strong> {r.source === "approved_story" ? "the approved story before refinement"
              : <>by {r.author_name} · {r.created_at.slice(0, 16).replace("T", " ")} · applied: {r.applied_findings.map((a) => a.text).join("; ")}</>}
              <div className="hint">process mapping revision {r.process_refs.mapping_revision ?? "none"}: {r.process_refs.refs.map((x) => `${x.node_key}@v${x.version}`).join(", ") || "no processes"}</div></li>))}</ul>
        </details>)}
    </section>
  );
}

const blankStep = (i: number): MapStep => ({ id: `S${i}`, label: "", type: "task", actor: "", system: "", controls: [], node_ref: null,
  story_ids: [], basis: "assumption", confirmation_source: "", notes: "" });

function MapEditor({ view, kind, nodes, onSaved }: { view: StoryProcessView; kind: "as_is" | "to_be"; nodes: FrameworkNode[]; onSaved: (msg: string) => void }) {
  const versions = view.maps[kind].versions;
  const [shown, setShown] = useState<number | null>(versions[0]?.version ?? null);
  const [draft, setDraft] = useState<MapContent | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setShown(versions[0]?.version ?? null); setDraft(null); }, [versions[0]?.version, kind]);
  const current = versions.find((v) => v.version === shown);
  const content: MapContent = draft ?? current?.content ?? { title: kind === "as_is" ? "As-is process" : "To-be process", steps: [], connections: [] };
  const fw = view.framework;
  const set = (c: MapContent) => setDraft(c);
  const setStep = (i: number, patch: Partial<MapStep>) => set({ ...content, steps: content.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await processApi.saveMap(view.story_id, kind, content, note, versions[0]?.version ?? 0);
      setDraft(null); setNote("");
      onSaved(`Saved ${kind.replace("_", "-")} map version ${r.saved.version}` + (r.saved.material_change ? " (material change)" : " (wording only)")
        + (r.saved.design_flagged ? " -- the story's design is flagged for reassessment." : "."));
    } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  const editable = view.can_review && (draft !== null || shown === (versions[0]?.version ?? null));
  return (
    <div className="stack">
      <div className="btnrow">
        {versions.length === 0 ? <span className="notstated">No {kind.replace("_", "-")} map yet.</span> : versions.map((v) => (
          <button key={v.version} className={`btn small${v.version === shown && !draft ? " primary" : ""}`} onClick={() => { setShown(v.version); setDraft(null); }}>
            v{v.version}{v.material_change ? "" : " (wording)"}</button>))}
        {current && <span className="hint">by {current.created_by} · {current.created_at.slice(0, 16).replace("T", " ")}{current.note ? ` · ${current.note}` : ""}</span>}
        {draft && <span className="badge warn">Unsaved edits</span>}
      </div>
      <h3 style={{ margin: 0 }}>{content.title}</h3>
      <ProcessMapDiagram content={content} />
      {editable && (
        <details open={draft !== null}>
          <summary>Edit this map (structured editor)</summary>
          <label>Title <input aria-label="Map title" value={content.title} onChange={(e) => set({ ...content, title: e.target.value })} /></label>
          <div style={{ overflowX: "auto" }}>
          <table className="grid" style={{ fontSize: 12.5 }}>
            <thead><tr><th>Id</th><th>Step</th><th>Type</th><th>Actor</th><th>System</th><th>Controls (;)</th><th>Process</th><th>Stories (,)</th><th>Basis</th><th>Confirmed by / how</th><th></th></tr></thead>
            <tbody>{content.steps.map((s, i) => (
              <tr key={i}>
                <td><input aria-label={`Step ${i + 1} id`} value={s.id} size={4} onChange={(e) => setStep(i, { id: e.target.value })} /></td>
                <td><input aria-label={`Step ${i + 1} label`} value={s.label} onChange={(e) => setStep(i, { label: e.target.value })} /></td>
                <td><select aria-label={`Step ${i + 1} type`} value={s.type} onChange={(e) => setStep(i, { type: e.target.value as MapStep["type"] })}>
                  {["start", "task", "decision", "end"].map((t) => <option key={t}>{t}</option>)}</select></td>
                <td><input aria-label={`Step ${i + 1} actor`} value={s.actor} size={10} onChange={(e) => setStep(i, { actor: e.target.value })} /></td>
                <td><input aria-label={`Step ${i + 1} system`} value={s.system} size={10} onChange={(e) => setStep(i, { system: e.target.value })} /></td>
                <td><input aria-label={`Step ${i + 1} controls`} value={s.controls.join("; ")} onChange={(e) => setStep(i, { controls: e.target.value.split(";").map((x) => x.trim()).filter(Boolean) })} /></td>
                <td><select aria-label={`Step ${i + 1} process`} value={s.node_ref ? `${s.node_ref.framework_id}|${s.node_ref.version}|${s.node_ref.node_key}` : ""}
                  onChange={(e) => { const [framework_id, version, node_key] = e.target.value.split("|"); setStep(i, { node_ref: e.target.value ? { framework_id, version: Number(version), node_key } : null }); }}>
                  <option value="">--</option>
                  {s.node_ref && fw && (s.node_ref.version !== fw.version || s.node_ref.framework_id !== fw.framework_id) &&
                    <option value={`${s.node_ref.framework_id}|${s.node_ref.version}|${s.node_ref.node_key}`}>{s.node_ref.node_key} (v{s.node_ref.version})</option>}
                  {fw && nodes.map((n) => <option key={n.node_key} value={`${fw.framework_id}|${fw.version}|${n.node_key}`}>{n.node_key} {n.name.slice(0, 30)}</option>)}
                </select></td>
                <td><input aria-label={`Step ${i + 1} stories`} value={s.story_ids.join(", ")} size={10} onChange={(e) => setStep(i, { story_ids: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></td>
                <td><select aria-label={`Step ${i + 1} basis`} value={s.basis} onChange={(e) => setStep(i, { basis: e.target.value as MapStep["basis"] })}>
                  <option value="assumption">assumption</option><option value="confirmed">confirmed practice</option></select></td>
                <td><input aria-label={`Step ${i + 1} confirmation`} value={s.confirmation_source} disabled={s.basis !== "confirmed"} onChange={(e) => setStep(i, { confirmation_source: e.target.value })} /></td>
                <td><button className="btn small" aria-label={`Remove step ${i + 1}`} onClick={() => set({ ...content, steps: content.steps.filter((_, j) => j !== i),
                  connections: content.connections.filter((c) => c.from !== s.id && c.to !== s.id) })}>×</button></td>
              </tr>))}</tbody>
          </table>
          </div>
          <button className="btn small" onClick={() => set({ ...content, steps: [...content.steps, blankStep(content.steps.length + 1)] })}>Add step</button>
          <h4>Connections</h4>
          <table className="grid" style={{ fontSize: 12.5 }}><tbody>
            {content.connections.map((c, i) => (
              <tr key={i}>
                <td><select aria-label={`Connection ${i + 1} from`} value={c.from} onChange={(e) => set({ ...content, connections: content.connections.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })}>
                  {content.steps.map((s) => <option key={s.id}>{s.id}</option>)}</select></td>
                <td>→</td>
                <td><select aria-label={`Connection ${i + 1} to`} value={c.to} onChange={(e) => set({ ...content, connections: content.connections.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })}>
                  {content.steps.map((s) => <option key={s.id}>{s.id}</option>)}</select></td>
                <td><input aria-label={`Connection ${i + 1} label`} value={c.label} placeholder="label" onChange={(e) => set({ ...content, connections: content.connections.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></td>
                <td><button className="btn small" onClick={() => set({ ...content, connections: content.connections.filter((_, j) => j !== i) })}>×</button></td>
              </tr>))}
          </tbody></table>
          <button className="btn small" disabled={content.steps.length < 2} onClick={() => set({ ...content, connections: [...content.connections, { from: content.steps[0].id, to: content.steps[1].id, label: "" }] })}>Add connection</button>
          <label style={{ display: "block", marginTop: 8 }}>Change note <input aria-label="Map change note" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="btnrow">
            <button className="btn primary" disabled={busy || !draft} onClick={save}>Save as new version</button>
            {draft && <button className="btn small" onClick={() => setDraft(null)}>Discard edits</button>}
          </div>
          {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
        </details>
      )}
      {current && (
        <details><summary>Steps and controls ({content.steps.length})</summary>
          <table className="grid" style={{ fontSize: 12.5 }}>
            <thead><tr><th>Step</th><th>Actor</th><th>System</th><th>Controls</th><th>Process</th><th>Stories</th><th>Basis</th></tr></thead>
            <tbody>{content.steps.map((s) => (
              <tr key={s.id}><td><span className="mono">{s.id}</span> {s.label} <span className="hint">({s.type})</span></td><td>{s.actor}</td><td>{s.system}</td>
                <td>{s.controls.join("; ")}</td><td className="mono">{s.node_ref ? `${s.node_ref.node_key} v${s.node_ref.version}` : ""}</td><td>{s.story_ids.join(", ")}</td>
                <td>{s.basis === "confirmed" ? <span className="badge ok" title={s.confirmation_source}>confirmed</span> : <span className="badge warn">assumption</span>}</td></tr>))}</tbody>
          </table>
        </details>
      )}
    </div>
  );
}

export function ProcessWork({ navFilter, navToken, onNavigate }: Partial<NavTarget> & { onNavigate?: Navigate }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<StoryProcessView | null>(null);
  const [nodes, setNodes] = useState<FrameworkNode[]>([]);
  const [kind, setKind] = useState<"as_is" | "to_be">("to_be");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (IS_MOCK_MODE) return;
    api.listChanges().then((all) => {
      const list = all.filter((c) => c.userStory && !["RECEIVED", "REFINING", "REJECTED"].includes(c.state));
      setChanges(list);
      setOpenId((cur) => navFilter?.story ?? cur ?? list.find((c) => c.id === "S-BW-RETURNS")?.id ?? list[0]?.id ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navToken]);
  const load = () => {
    if (!openId) return;
    processApi.story(openId).then((v) => { setView(v); setError(null); }).catch((e) => setError(saveErrorMessage(e, "Could not load the story's processes.")));
  };
  useEffect(load, [openId]);
  useEffect(() => {
    if (view?.framework) processApi.version(view.framework.framework_id, view.framework.version).then((p) => setNodes(p.nodes)).catch(() => setNodes([]));
  }, [view?.framework?.framework_id, view?.framework?.version]);
  useEffect(() => { if (navFilter?.section === "maps") document.getElementById("process-maps")?.scrollIntoView(); }, [view, navFilter?.section]);

  if (IS_MOCK_MODE) return <section className="panel"><h1>Process & Maps</h1><p className="notstated">Needs the real backend.</p></section>;
  if (!changes) return <Loading what="stories" />;
  const change = changes.find((c) => c.id === openId);
  const d = view?.design;

  return (
    <div className="stack">
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Process & Maps</h1>
        <p className="hint">Finalise a story against the company's process framework, keep as-is and to-be maps beside it, and follow it through design and implementation to its as-built record.</p>
        <div className="btnrow">{changes.map((c) => (
          <button key={c.id} className={`btn small${c.id === openId ? " primary" : ""}`} onClick={() => { setOpenId(c.id); setNotice(null); }}>{c.id}</button>))}</div>
      </section>
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {view && change && (<>
        <section className="panel">
          <JourneyBar storyId={view.story_id} at="process" onNavigate={onNavigate} frameworkId={view.framework?.framework_id} />
          <h2>{view.story_id}: {change.userStory?.statement?.slice(0, 160) ?? view.title}</h2>
          <dl className="facts">
            <dt>Business domain</dt><dd>{view.business_domain_id ?? <span className="notstated">not assigned</span>}</dd>
            <dt>Route</dt><dd>{view.route ?? <span className="notstated">no design yet</span>}</dd>
          </dl>
          {change.userStory?.acceptanceCriteria?.length ? (
            <details><summary>Acceptance criteria ({change.userStory.acceptanceCriteria.length})</summary>
              <ul>{change.userStory.acceptanceCriteria.map((a) => <li key={a.id}>{a.id}: {a.text}</li>)}</ul></details>) : null}
        </section>
        <MappingSection view={view} nodes={nodes} onChanged={load} onNavigate={onNavigate} />
        <StoryRefinement storyId={view.story_id} onChanged={() => { load(); api.listChanges().then((all) => setChanges((cur) => cur && all.filter((c) => cur.some((x) => x.id === c.id)))); }} />
        <section className="panel" id="process-maps">
          <h2 style={{ marginTop: 0 }}>Process maps</h2>
          <div className="btnrow">
            <button className={`btn small${kind === "as_is" ? " primary" : ""}`} onClick={() => setKind("as_is")}>As-is ({view.maps.as_is.versions.length})</button>
            <button className={`btn small${kind === "to_be" ? " primary" : ""}`} onClick={() => setKind("to_be")}>To-be ({view.maps.to_be.versions.length})</button>
          </div>
          {notice && <div className="callout" style={{ borderColor: "var(--ok)" }}>{notice}</div>}
          <MapEditor key={kind} view={view} kind={kind} nodes={nodes} onSaved={(m) => { setNotice(m); load(); }} />
        </section>
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Design</h2>
          {!d ? <p className="notstated">No Architect design yet. The Architect receives this story's process context when it runs.</p> : (<>
            <dl className="facts">
              <dt>Design</dt><dd>revision {d.design_revision} · evidence baseline <span className="mono">{d.baseline_id}</span> ·{" "}
                <span className={`badge ${d.status === "current" ? "ok" : "stop"}`}>{d.status.replace(/_/g, " ")}</span></dd>
              <dt>Process context</dt><dd>{d.process_context_consulted ? "consulted by the Architect" : "not consulted"}{" · "}
                {d.process_context_recorded?.sha256 === view.fingerprint.sha256 ? <span className="badge ok">matches the story's processes now</span>
                  : <span className="badge warn">differs from the story's processes now</span>}</dd>
            </dl>
            {d.reassessment.length > 0 && (
              <div className="callout" style={{ borderColor: "var(--stop)" }}><strong>Flagged for reassessment</strong>
                <ul>{d.reassessment.map((r, i) => <li key={i}>{r.kind.replace(/_/g, " ")}: {r.detail}</li>)}</ul></div>)}
            {d.architect_process_findings && Object.entries(d.architect_process_findings).some(([, v]) => v.length) && (
              <div><strong>Architect's process findings</strong><ul>{Object.entries(d.architect_process_findings).flatMap(([k, v]) => v.map((x) => <li key={k + x}>{k.replace(/_/g, " ")}: {x}</li>))}</ul></div>)}
          </>)}
        </section>
      </>)}
    </div>
  );
}
