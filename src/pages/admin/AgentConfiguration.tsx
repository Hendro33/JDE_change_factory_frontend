import { useCallback, useEffect, useState } from "react";
import {
  aiApi,
  type AiRun,
  type Assignment,
  type PackContent,
  type PackRevision,
  type PackSummary,
  type RoleHealth,
  type RoleInfo,
} from "../../services/aiApi";
import { discoveryApi, type ArtifactView } from "../../services/discoveryApi";
import { saveErrorMessage } from "../../services/saveErrors";
import { Loading } from "../../components/ui";

const STATE_TONE: Record<RoleHealth["state"], string> = {
  "not configured": "warn", configured: "info", "connection tested": "info", working: "ok", disabled: "", failed: "stop",
};

const REQUEST_DOCUMENTS = "request_documents";

function shortTool(t: string) {
  return t.replace(/^mcp__/, "").replace(/__/g, " › ");
}

/**
 * Admin > Agent Configuration: which Start-up Pack each agent runs with,
 * the packs themselves (draft → publish → assign; rollback = assign an
 * earlier revision), and what each agent actually did.
 */
export function AgentConfiguration() {
  const [health, setHealth] = useState<RoleHealth[] | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [runs, setRuns] = useState<AiRun[]>([]);
  const [docs, setDocs] = useState<ArtifactView[]>([]);
  const [editing, setEditing] = useState<PackRevision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, r, p, ru] = await Promise.all([aiApi.health(), aiApi.roles(), aiApi.packs(), aiApi.runs()]);
      setHealth(h.roles); setRoles(r); setPacks(p.packs); setAssignments(p.assignments); setRuns(ru);
      discoveryApi.listArtifacts().then((a) => setDocs(a.filter((x) => x.kind === "reference_document"))).catch(() => setDocs([]));
    } catch (e) {
      setError(saveErrorMessage(e, "Could not load the agent configuration."));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act<T>(fn: () => Promise<T>, done: string, after?: (v: T) => void) {
    setError(null); setNotice(null);
    try {
      const v = await fn();
      after?.(v);
      setNotice(done);
      await load();
    } catch (e) {
      setError(saveErrorMessage(e, "That did not work."));
    }
  }

  if (!health) return error ? <div className="badge stop">{error}</div> : <Loading what="agent configuration" />;
  const label = (role: string) => roles.find((r) => r.role === role)?.label ?? role;

  return (
    <div className="stack" data-testid="agent-configuration">
      <section className="panel">
        <h2>Agent health</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          From real configuration and run records. "Working" means the agent's last successful run was made with this
          customer's own API key, as reported by the runtime — not a test and not a demo.
        </p>
        <table className="data">
          <thead><tr><th>Agent</th><th>State</th><th>Runs with</th><th>Last successful real run</th><th>Last run</th></tr></thead>
          <tbody>
            {health.map((h) => (
              <tr key={h.role} data-role={h.role}>
                <td>{h.label}</td>
                <td>
                  <span className={`badge ${STATE_TONE[h.state]}`}>{h.state}</span>
                  {h.blockedReason && <div className="hint">{h.blockedReason}</div>}
                </td>
                <td>
                  {h.pack ? <>{h.pack.packName} <span className="mono">r{h.pack.revision}</span><div className="hint mono">#{h.pack.sha256.slice(0, 12)}</div></> : "—"}
                  {h.configuredModel && <div className="hint">model {h.configuredModel}{h.activity ? ` (${h.activity.replace(/_/g, " ")})` : ""} · connection r{h.connectionRevision}</div>}
                </td>
                <td>
                  {h.lastSuccessfulRealRun ? (
                    <>{new Date(h.lastSuccessfulRealRun.started_at).toLocaleString()}
                      <div className="hint">reported model {h.lastSuccessfulRealRun.reported_model}</div></>
                  ) : <span className="hint">none yet</span>}
                </td>
                <td>
                  {h.lastRun ? (
                    <><span className={`badge ${h.lastRun.status === "completed" ? "ok" : h.lastRun.status === "running" ? "info" : "stop"}`}>{h.lastRun.status}</span>
                      <div className="hint">{new Date(h.lastRun.started_at).toLocaleString()}{h.lastRun.error ? ` — ${h.lastRun.error}` : ""}</div></>
                  ) : <span className="hint">never</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Assigned Start-up Packs</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Each agent runs with exactly one published pack revision. A run keeps the revision it started with; a change
          here applies to the next run. To roll back, assign an earlier revision. An agent with no pack cannot run.
        </p>
        <table className="data">
          <thead><tr><th>Agent</th><th>Assigned</th><th>Change to</th></tr></thead>
          <tbody>
            {roles.map((r) => (
              <AssignmentRow key={r.role} role={r} current={assignments[r.role]}
                packs={packs.filter((p) => p.role === r.role && !p.disabledAt)}
                onAssign={(packId, rev) => act(() => aiApi.assign(r.role, packId, rev, assignments[r.role]?.version ?? null),
                  `${r.label}: ${packId} r${rev} assigned.`)}
                onUnassign={() => act(() => aiApi.unassign(r.role), `${r.label} unassigned — it cannot run until a pack is assigned.`)} />
            ))}
          </tbody>
        </table>
      </section>

      {notice && <div className="badge ok" role="status">{notice}</div>}
      {error && <div className="badge stop" role="alert">{error}</div>}

      <section className="panel">
        <h2>Start-up Packs</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          A pack holds an agent's instructions, reusable skills, knowledge, expected inputs/outputs and the tools it
          requests. "Jade standard" packs come from Jade's reviewed agent definitions and change only through code
          review; copy one to make your own. Tools can only be chosen within what Jade's reviewed policy allows for
          that agent — approvals, gates and the tools themselves stay in reviewed backend code.
        </p>
        <table className="data">
          <thead><tr><th>Pack</th><th>Agent</th><th>Revisions</th><th></th></tr></thead>
          <tbody>
            {packs.map((p) => (
              <tr key={p.packId}>
                <td>
                  {p.name} {p.template && <span className="badge info">Jade standard</span>}{" "}
                  {p.disabledAt && <span className="badge warn">disabled</span>}
                  <div className="hint mono">{p.packId} · {p.source}</div>
                </td>
                <td>{label(p.role)}</td>
                <td>
                  {p.revisions.map((r) => (
                    <div key={r.revision}>
                      <button className="linkbtn" onClick={() => aiApi.revision(p.packId, r.revision).then(setEditing)}>
                        r{r.revision}
                      </button>{" "}
                      <span className={`badge ${r.status === "published" ? "ok" : "warn"}`}>{r.status}</span>{" "}
                      <span className="hint">{r.published_by ?? r.created_by} · {new Date(r.published_at ?? r.created_at).toLocaleDateString()}</span>
                      {r.status === "draft" && !p.template && (
                        <> <button className="btn" onClick={() => act(() => aiApi.publish(p.packId, r.revision), `${p.name} r${r.revision} published.`,
                          (v) => { if (editing?.packId === v.packId && editing.revision === v.revision) setEditing(v); })}>Publish</button></>
                      )}
                    </div>
                  ))}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn" onClick={() => {
                    const rev = p.revisions.find((r) => r.status === "published")?.revision ?? p.revisions[0].revision;
                    const name = window.prompt("Name of the new pack", `${label(p.role)} (${p.template ? "customer" : "copy"})`);
                    if (name !== null) {
                      act(() => aiApi.createPack(p.role, name, p.packId, rev), "Pack created as a draft.", (v) => setEditing(v));
                    }
                  }}>Copy</button>{" "}
                  {!p.template && (
                    <button className="btn" onClick={() => act(() => aiApi.setDisabled(p.packId, !p.disabledAt),
                      p.disabledAt ? "Pack enabled." : "Pack disabled — agents assigned to it are blocked.")}>
                      {p.disabledAt ? "Enable" : "Disable"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && (
        <PackEditor key={`${editing.packId}-${editing.revision}`} rev={editing} docs={docs} onClose={() => setEditing(null)}
          onSaved={(v) => { setEditing(v); load(); }} onError={setError} />
      )}

      <section className="panel">
        <h2>Agent runs</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          What each run actually used. Token counts are reported by the provider through the runtime; cost is an estimate
          at list prices, not an invoice.
        </p>
        {runs.length === 0 ? <p className="hint">No runs yet.</p> : (
          <table className="data">
            <thead><tr><th>Started</th><th>What</th><th>Status</th><th>Model</th><th>Packs</th><th>Documents</th><th>Cost</th></tr></thead>
            <tbody>
              {runs.slice(0, 30).map((r) => (
                <tr key={r.run_id}>
                  <td>{new Date(r.started_at).toLocaleString()}<div className="hint mono">{r.run_id}</div></td>
                  <td>{r.driver}{r.story_id && <div className="hint mono">{r.story_id}</div>}</td>
                  <td>
                    <span className={`badge ${r.status === "completed" ? "ok" : r.status === "running" ? "info" : "stop"}`}>{r.status}</span>
                    {r.error && <div className="hint">{r.error}</div>}
                  </td>
                  <td>
                    {r.configured_model ?? "—"}
                    <div className="hint">reported: {r.reported_model ?? "—"} · key: {r.credential_source ?? "—"}
                      {r.provider === "anthropic-test-provider" && " · TEST PROVIDER"}</div>
                    {r.runtime && <div className="hint">{r.runtime}</div>}
                    {(r.notes ?? []).map((n, i) => <div key={i} className="badge warn" style={{ marginTop: 4 }}>{n}</div>)}
                  </td>
                  <td>
                    {(r.packs ?? []).map((p) => <div key={p.role} className="mono hint">{p.role}: {p.packId} r{p.revision}{p.model ? ` · ${p.model}` : ""}</div>)}
                    {(r.context ?? []).map((c) => <div key={c.package_id} className="mono hint">context v{c.version} #{c.sha256.slice(0, 10)}</div>)}
                  </td>
                  <td>{(r.knowledge ?? []).filter((k) => k.action === "read").map((k, i) => <div key={i} className="hint">{k.filename}: {(k.sections ?? []).length} section(s)</div>)}</td>
                  <td>{r.cost_usd !== null ? `USD ${r.cost_usd.toFixed(4)}` : "—"}<div className="hint">{r.cost_basis}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function AssignmentRow({ role, current, packs, onAssign, onUnassign }: {
  role: RoleInfo; current?: Assignment; packs: PackSummary[];
  onAssign: (packId: string, revision: number) => void; onUnassign: () => void;
}) {
  const options = packs.flatMap((p) => p.revisions.filter((r) => r.status === "published")
    .map((r) => ({ value: `${p.packId}@${r.revision}`, label: `${p.name} r${r.revision}` })));
  const [choice, setChoice] = useState("");
  return (
    <tr data-role={role.role}>
      <td>{role.label}</td>
      <td>
        {current ? <>{current.packName} <span className="mono">r{current.revision}</span>
          <div className="hint">by {current.assignedBy}, {new Date(current.assignedAt).toLocaleString()}</div></>
          : <span className="badge warn">none — this agent cannot run</span>}
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        <select aria-label={`Pack for ${role.label}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Choose a published revision…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>{" "}
        <button className="btn" disabled={!choice} onClick={() => {
          const [packId, rev] = choice.split("@");
          onAssign(packId, Number(rev));
          setChoice("");
        }}>Assign</button>{" "}
        {current && <button className="btn" onClick={onUnassign}>Unassign</button>}
      </td>
    </tr>
  );
}

function PackEditor({ rev, docs, onClose, onSaved, onError }: {
  rev: PackRevision; docs: ArtifactView[]; onClose: () => void; onSaved: (v: PackRevision) => void;
  onError: (m: string) => void;
}) {
  const [c, setC] = useState<PackContent>(rev.content);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const readOnly = rev.template;
  const set = <K extends keyof PackContent>(k: K, v: PackContent[K]) => setC({ ...c, [k]: v });
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const latestDocs = docs.filter((d) => d.latest);

  async function save() {
    setSaving(true);
    try {
      onSaved(await aiApi.saveDraft(rev.packId, c, note));
    } catch (e) {
      onError(saveErrorMessage(e, "The draft could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" data-testid="pack-editor">
      <h2>{rev.name} — revision {rev.revision} <span className={`badge ${rev.status === "published" ? "ok" : "warn"}`}>{rev.status}</span></h2>
      <div className="hint mono" style={{ marginBottom: 10 }}>{rev.packId} · sha256 {rev.sha256.slice(0, 16)}… · {rev.createdBy}</div>
      {readOnly && <div className="callout">Jade standard packs are read-only here. Copy it to make a customer pack.</div>}
      {!readOnly && rev.status === "published" && (
        <div className="callout">Published revisions never change. Saving opens a new draft revision.</div>
      )}
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <div className="field"><label>Description</label>
          <input type="text" value={c.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="field"><label>Instructions</label>
          <textarea rows={10} value={c.instructions} onChange={(e) => set("instructions", e.target.value)} /></div>
        <div className="field">
          <label>Skills (reusable text; never executed)</label>
          {c.skills.map((s, i) => (
            <div key={i} style={{ display: "grid", gap: 4, marginBottom: 8 }}>
              <input type="text" aria-label="Skill name" value={s.name} placeholder="Skill name"
                onChange={(e) => set("skills", c.skills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <textarea rows={3} aria-label="Skill text" value={s.body}
                onChange={(e) => set("skills", c.skills.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
              <button className="btn" onClick={() => set("skills", c.skills.filter((_, j) => j !== i))}>Remove skill</button>
            </div>
          ))}
          <button className="btn" onClick={() => set("skills", [...c.skills, { name: "", body: "" }])}>Add skill</button>
        </div>
        <div className="grid halves">
          <div className="field"><label>Expected inputs</label>
            <textarea rows={3} value={c.inputs} onChange={(e) => set("inputs", e.target.value)} /></div>
          <div className="field"><label>Expected outputs</label>
            <textarea rows={3} value={c.outputs} onChange={(e) => set("outputs", e.target.value)} /></div>
        </div>
        <div className="field">
          <label>Knowledge</label>
          <label style={{ display: "block" }}>
            <input type="checkbox" checked={c.knowledge.includes(REQUEST_DOCUMENTS)}
              onChange={() => set("knowledge", toggle(c.knowledge, REQUEST_DOCUMENTS))} /> Documents attached to the request
          </label>
          {latestDocs.map((d) => {
            const ref = `doc:${d.artifactId}@r${d.revision}`;
            return (
              <label key={ref} style={{ display: "block" }}>
                <input type="checkbox" checked={c.knowledge.includes(ref)} onChange={() => set("knowledge", toggle(c.knowledge, ref))} />{" "}
                {String(d.meta.doc_title || d.meta.object_name)} <span className="mono hint">{d.artifactId} r{d.revision}</span>
                {d.extractionStatus !== "supported" && <span className="badge warn"> not readable</span>}
              </label>
            );
          })}
          {c.knowledge.filter((k) => k.startsWith("doc:") && !latestDocs.some((d) => k === `doc:${d.artifactId}@r${d.revision}`)).map((k) => (
            <label key={k} style={{ display: "block" }}>
              <input type="checkbox" checked onChange={() => set("knowledge", toggle(c.knowledge, k))} /> <span className="mono">{k}</span> <span className="hint">(an earlier revision)</span>
            </label>
          ))}
          <div className="hint">Knowledge Library documents are pinned to the revision chosen here. Whether their text may be read depends on the document policy (Admin › AI Connections).</div>
        </div>
        <div className="field">
          <label>Tools requested (within Jade's reviewed policy for this agent)</label>
          {rev.ceiling.map((t) => (
            <label key={t} style={{ display: "block" }}>
              <input type="checkbox" checked={c.capabilities.includes(t)} onChange={() => set("capabilities", toggle(c.capabilities, t))} />{" "}
              <span className="mono">{shortTool(t)}</span>
            </label>
          ))}
        </div>
        <div className="field"><label>Maximum turns (optional)</label>
          <input type="number" min={1} max={100} value={c.limits.max_turns ?? ""}
            onChange={(e) => set("limits", e.target.value ? { max_turns: Number(e.target.value) } : {})} /></div>
        <div className="field"><label>Change note</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why" /></div>
      </fieldset>
      <div className="btnrow">
        {!readOnly && <button className="btn primary" disabled={saving} onClick={save}>Save draft</button>}
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </section>
  );
}
