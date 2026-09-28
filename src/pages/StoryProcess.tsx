import { useEffect, useState } from "react";
import { saveErrorMessage } from "../services/saveErrors";
import {
  processApi, type DiffLine, type FrameworkNode, type MapContent, type MapStep, type PinnedRef, type RefinementView,
  type StoryProcessView,
} from "../services/processApi";
import { Link } from "../router";
import { Details, Loading } from "../components/design";
import { ProcessMapDiagram } from "../components/ProcessMapDiagram";
import { cleanAgentText } from "./stories/storyContext";

const refTone: Record<string, string> = { current: "ok", unchanged: "ok", changed: "warn", removed: "stop", framework_inactive: "stop" };

export function RefList({ refs }: { refs: PinnedRef[] }) {
  return (
    <ul className="compactlist">{refs.map((r) => (
      <li key={`${r.framework_id}:${r.version}:${r.node_key}`}>
        <Link to={`/business?node=${encodeURIComponent(r.node_key)}`}>{r.path.map((p) => p.name).join(" › ")}</Link>
        {r.status_now && !["current", "unchanged"].includes(r.status_now.state) && <> <span className={`badge ${refTone[r.status_now.state] ?? "grey"}`} title={r.status_now.detail}>{r.status_now.state === "changed" ? "changed since" : r.status_now.state.replace("_", " ")}</span></>}
        {r.rationale && <div className="hint">{cleanAgentText(r.rationale).text}</div>}
      </li>
    ))}</ul>
  );
}

export function MappingSection({ view, nodes, onChanged }: { view: StoryProcessView; nodes: FrameworkNode[]; onChanged: () => void }) {
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
    // Confirming processes needs the active framework; recording that no
    // mapping applies does not (a new customer may not have loaded one yet).
    if (!fw && status === "confirmed") return;
    setBusy(true); setError(null);
    const refs = !fw ? [] : [
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
    <div className="subsection">
      <h3 style={{ marginTop: 0 }}>Affected business processes</h3>
      {!fw ? <p className="notstated">No process framework is active for this customer (Administration › Business Model).</p> : (
        <p className="hint">Framework: <strong>{fw.name}</strong> v{fw.version} · {fw.source_kind === "synthetic_fixture"
          ? <span className="badge warn">Synthetic framework (test data)</span> : fw.source_label}</p>
      )}
      <h4>JADE's suggestions</h4>
      {!run ? <p className="notstated">No process analysis yet.</p> : (
        <div className="callout">
          <div>{run.scripted ? <span className="tag sim" title="Scripted run, not a model run">Scripted</span>
            : <span className="badge grey">Process analysis</span>}
            {" "}<span className="hint">{run.status} · framework version {run.framework_version}</span></div>
          {run.error && <p style={{ color: "var(--stop)" }}>{run.error}</p>}
          {run.result.summary && <p>{cleanAgentText(run.result.summary).text}</p>}
          {suggestions.map((s) => (
            <label key={s.node_key} style={{ display: "block" }}>
              <input type="checkbox" disabled={!view.can_review} checked={!!chosen[s.node_key]}
                     onChange={(e) => setChosen({ ...chosen, [s.node_key]: e.target.checked })} />{" "}
              <span className="mono">{s.node_key}</span> {s.path.map((p) => p.name).join(" › ")} <span className="hint">({s.confidence}) {cleanAgentText(s.rationale).text}</span>
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
          Ask JADE to analyse the processes</button>
          <span className="hint">Results are suggestions for you to confirm.</span></div>
      )}

      <h4>Your decision</h4>
      {view.mapping ? (
        <div className="callout" style={{ borderColor: view.mapping.status === "confirmed" ? "var(--ok)" : "var(--warn)" }}>
          <strong>{view.mapping.status === "confirmed" ? "Processes confirmed" : "No process mapping applies"}</strong>
          {" "}by {view.mapping.reviewer_name} · revision {view.mapping.revision} · {view.mapping.created_at.slice(0, 16).replace("T", " ")}
          {view.mapping.status === "confirmed" ? <RefList refs={view.mapping.refs} /> : <p>{view.mapping.no_mapping_reason}</p>}
          {Object.entries(view.mapping.findings).filter(([, v]) => v.length).map(([k, v]) => (
            <div key={k} className="hint">{k.replace(/_/g, " ")}: {v.join("; ")}</div>))}
        </div>
      ) : <p className="notstated">Not decided yet.</p>}
      {view.can_review ? (
        <div className="stack">
          {fw && <>
            <label>Add processes by node id (from {fw.name} v{fw.version}):
              <input aria-label="Add process node ids" list="pf-nodes" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. SYN-5.1.2" />
              <datalist id="pf-nodes">{nodes.map((n) => <option key={n.node_key} value={n.node_key}>{n.name}</option>)}</datalist>
            </label>
            <label>Note <input aria-label="Decision note" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="btnrow">
              <button className="btn primary" disabled={busy} onClick={() => decide("confirmed")}>Confirm selected processes</button>
            </div>
          </>}
          <label>{fw ? "Or record why no mapping applies:" : "Record why no process mapping applies:"}
            <input aria-label="No mapping reason" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="btnrow"><button className="btn small" disabled={busy || reason.trim().length < 10} onClick={() => decide("no_mapping")}>Record no mapping</button></div>
        </div>
      ) : !view.can_review && <p className="hint">Only a Application Manager, or the Domain Owner assigned to this story's business domain, can decide.</p>}
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {view.mapping_history.length > 1 && (
        <details><summary>Decision history ({view.mapping_history.length})</summary>
          <ul>{view.mapping_history.map((m) => <li key={m.revision}>r{m.revision} {m.status} by {m.reviewer_name} -- {m.refs.map((r) => `${r.node_key}@v${r.version}`).join(", ") || m.no_mapping_reason}</li>)}</ul>
        </details>
      )}
    </div>
  );
}


const sourceLabel: Record<string, JSX.Element> = {
  scripted_refinement: <span className="tag sim" title="Scripted run, not a model run">Scripted</span>,
  refinement_agent: <span className="badge grey">JADE</span>,
  architect: <span className="badge grey">Architect</span>,
};
const statusTone2: Record<string, string> = { proposed: "warn", applied: "ok", rejected: "stop", deferred: "grey" };

/** Accepted findings become a reviewed, attributed story revision -- agents never change the story themselves. */
export function StoryRefinement({ storyId, onChanged }: { storyId: string; onChanged: () => void }) {
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
    <div className="subsection" id="story-refinement">
      <h3 style={{ marginTop: 0 }}>Improve the story from findings</h3>
      <p className="hint">JADE only proposes. Select findings, check the change to the approved story, and apply it as a new story revision.
        Applying one sends the solution back for reassessment and pauses existing approvals.</p>
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
    </div>
  );
}

const blankStep = (i: number): MapStep => ({ id: `S${i}`, label: "", type: "task", actor: "", system: "", controls: [], node_ref: null,
  story_ids: [], basis: "assumption", confirmation_source: "", notes: "" });

export function MapEditor({ view, kind, nodes, onSaved }: { view: StoryProcessView; kind: "as_is" | "to_be"; nodes: FrameworkNode[]; onSaved: (msg: string) => void }) {
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

/**
 * Everything about a story's business processes, inside its workspace:
 * the confirmed processes, JADE's suggestions and findings, and the
 * as-is / to-be maps. Each control is the same governed flow as before.
 */
export function StoryProcessPanel({ storyId, onChanged }: { storyId: string; onChanged?: () => void }) {
  const [view, setView] = useState<StoryProcessView | null>(null);
  const [nodes, setNodes] = useState<FrameworkNode[]>([]);
  const [kind, setKind] = useState<"as_is" | "to_be">("to_be");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    processApi.story(storyId).then((v) => { setView(v); setError(null); })
      .catch((e) => setError(saveErrorMessage(e, "Could not load the story's processes.")));
  };
  useEffect(load, [storyId]);
  useEffect(() => {
    if (view?.framework) processApi.version(view.framework.framework_id, view.framework.version).then((p) => setNodes(p.nodes)).catch(() => setNodes([]));
  }, [view?.framework?.framework_id, view?.framework?.version]);

  if (error) return <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>;
  if (!view) return <Loading what="processes" />;
  const changed = () => { load(); onChanged?.(); };
  const openFindings = (view.runs[0]?.result.missing_requirements?.length ?? 0) + (view.runs[0]?.result.missing_controls?.length ?? 0)
    + (view.runs[0]?.result.missing_acceptance_criteria?.length ?? 0);
  return (
    <div className="stack">
      {view.mapping?.status === "confirmed" ? (
        <div>
          <div className="minihead">Confirmed processes</div>
          <RefList refs={view.mapping.refs} />
        </div>
      ) : view.mapping?.status === "no_mapping" ? (
        <p>No process mapping applies: {view.mapping.no_mapping_reason}</p>
      ) : view.framework ? <p className="muted">The affected processes have not been confirmed yet.</p> : null}
      <div id="process-maps">
        <div className="btnrow">
          <button className={`btn small${kind === "to_be" ? " primary" : ""}`} onClick={() => setKind("to_be")}>To-be ({view.maps.to_be.versions.length})</button>
          <button className={`btn small${kind === "as_is" ? " primary" : ""}`} onClick={() => setKind("as_is")}>As-is ({view.maps.as_is.versions.length})</button>
        </div>
        {notice && <div className="callout" style={{ borderColor: "var(--ok)" }}>{notice}</div>}
        <MapEditor key={kind} view={view} kind={kind} nodes={nodes} onSaved={(m) => { setNotice(m); changed(); }} />
      </div>
      <Details summary={view.mapping ? "Change the affected processes" : "Confirm the affected processes"} open={!view.mapping && !!view.framework}>
        <MappingSection view={view} nodes={nodes} onChanged={changed} />
      </Details>
      <Details summary={`Improve the story from JADE's findings${openFindings ? ` (${openFindings})` : ""}`}>
        <StoryRefinement storyId={storyId} onChanged={changed} />
      </Details>
      {view.design && (
        <Details summary="How the solution used this process context" tone="technical">
          <dl className="facts">
            <dt>Design</dt><dd>revision {view.design.design_revision} · evidence baseline <span className="mono">{view.design.baseline_id}</span> · {view.design.status.replace(/_/g, " ")}</dd>
            <dt>Process context</dt><dd>{view.design.process_context_consulted ? "consulted" : "not consulted"} ·{" "}
              {view.design.process_context_recorded?.sha256 === view.fingerprint.sha256 ? "matches the story's processes now" : "differs from the story's processes now"}</dd>
          </dl>
          {view.design.reassessment.length > 0 && <ul>{view.design.reassessment.map((r, i) => <li key={i}>{r.kind.replace(/_/g, " ")}: {r.detail}</li>)}</ul>}
        </Details>
      )}
    </div>
  );
}
