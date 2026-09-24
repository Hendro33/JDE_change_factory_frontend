import { useEffect, useMemo, useState } from "react";
import { api, IS_MOCK_MODE } from "../../services/api";
import { saveErrorMessage } from "../../services/saveErrors";
import {
  fileToBase64, processApi, type Framework, type FrameworkList, type FrameworkNode, type Inspection, type SourceKind,
  type VersionPreview,
} from "../../services/processApi";
import type { Navigate, NavTarget } from "../../types/nav";
import { Loading } from "../../components/ui";

const statusTone: Record<string, string> = { active: "ok", draft: "warn", superseded: "grey" };

function kindBadge(kind: SourceKind) {
  return kind === "synthetic_fixture" ? <span className="badge warn">SYNTHETIC fixture -- not APQC content</span>
    : kind === "apqc_authorised" ? <span className="badge ok">APQC (customer-authorised)</span>
    : <span className="badge grey">Customer-defined</span>;
}

/** Indented hierarchy with a filter; a click selects a node. */
function Hierarchy({ nodes, selected, onSelect }: { nodes: FrameworkNode[]; selected: string | null; onSelect: (k: string) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    if (!q.trim()) return nodes;
    const hit = new Set<string>();
    const byKey = new Map(nodes.map((n) => [n.node_key, n]));
    nodes.filter((n) => `${n.node_key} ${n.name} ${n.description}`.toLowerCase().includes(q.toLowerCase())).forEach((n) => {
      let cur: FrameworkNode | undefined = n;
      while (cur) { hit.add(cur.node_key); cur = cur.parent_key ? byKey.get(cur.parent_key) : undefined; }
    });
    return nodes.filter((n) => hit.has(n.node_key));
  }, [nodes, q]);
  return (
    <div>
      <input aria-label="Filter the hierarchy" placeholder="Filter by id, name or description" value={q}
             onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 6, padding: 6 }}>
        {shown.map((n) => (
          <div key={n.node_key} style={{ paddingLeft: (n.level - 1) * 18 }}>
            <button className={`linkish${selected === n.node_key ? " on" : ""}`} onClick={() => onSelect(n.node_key)}
                    style={{ fontWeight: selected === n.node_key ? 700 : n.level === 1 ? 600 : 400, textAlign: "left" }}>
              <span className="mono">{n.node_key}</span> {n.name}
            </button>
            {n.node_type && <span className="hint"> · {n.node_type}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeDetail({ fw, preview, nodeKey, onNavigate }: { fw: Framework; preview: VersionPreview; nodeKey: string; onNavigate?: Navigate }) {
  const node = preview.nodes.find((n) => n.node_key === nodeKey);
  const [stories, setStories] = useState<{ story_id: string; revision: number; versions: number[] }[] | null>(null);
  useEffect(() => { setStories(null); processApi.nodeStories(fw.framework_id, nodeKey).then(setStories).catch(() => setStories([])); }, [fw.framework_id, nodeKey]);
  if (!node) return <p className="notstated">Node {nodeKey} is not in version {preview.version.version}.</p>;
  return (
    <div className="callout">
      <h3 style={{ marginTop: 0 }}><span className="mono">{node.node_key}</span> {node.name}</h3>
      <dl className="facts">
        <dt>Version</dt><dd>{fw.name} v{preview.version.version} ({preview.version.status})</dd>
        <dt>Type</dt><dd>{node.node_type || "--"}</dd>
        <dt>Description</dt><dd>{node.description || <span className="notstated">none</span>}</dd>
        <dt>External reference</dt><dd>{node.external_ref || <span className="notstated">none supplied</span>}</dd>
        <dt>Node checksum</dt><dd className="mono">{node.node_sha256.slice(0, 16)}…</dd>
      </dl>
      <h4>Stories mapped to this process</h4>
      {stories === null ? <Loading what="stories" /> : stories.length === 0 ? <p className="notstated">None.</p> : (
        <ul>{stories.map((s) => (
          <li key={s.story_id}>
            <button className="linkish" onClick={() => onNavigate?.("process", { story: s.story_id })}>{s.story_id}</button>
            {" "}(mapping revision {s.revision}, references version {s.versions.join(", ")})
          </li>
        ))}</ul>
      )}
    </div>
  );
}

function ImportPanel({ list, onDone }: { list: FrameworkList; onDone: (p: VersionPreview) => void }) {
  const [file, setFile] = useState<{ name: string; b64: string } | null>(null);
  const [insp, setInsp] = useState<Inspection | null>(null);
  const [sheet, setSheet] = useState("");
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [derive, setDerive] = useState(false);
  const [target, setTarget] = useState<string>("new");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SourceKind>("customer_defined");
  const [statement, setStatement] = useState("");
  const [preview, setPreview] = useState<VersionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = list.frameworks.find((f) => f.framework_id === target);

  async function pick(f: File | undefined) {
    setError(null); setPreview(null); setInsp(null);
    if (!f) return;
    const b64 = await fileToBase64(f);
    setFile({ name: f.name, b64 });
    try {
      const i = await processApi.inspect(f.name, b64);
      setInsp(i);
      const s = i.default_sheet ?? i.sheets[0]?.sheet ?? "";
      setSheet(s);
      setMapping(i.sheets.find((x) => x.sheet === s)?.proposed_mapping ?? {});
    } catch (e) { setError(saveErrorMessage(e, "Could not read the workbook.")); }
  }

  async function validate() {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      setPreview(await processApi.createDraft({
        name: existing ? existing.name : name, sourceKind: existing ? existing.source_kind : kind, sourceStatement: statement,
        fileName: file.name, contentBase64: file.b64, sheet, mapping, deriveParent: derive,
        frameworkId: existing ? existing.framework_id : null,
      }));
    } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  async function activate() {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const p = await processApi.activate(preview.framework.framework_id, preview.version.version);
      setPreview(null); setFile(null); setInsp(null);
      onDone(p);
    } catch (e) { setError(saveErrorMessage(e, "Refused.")); } finally { setBusy(false); }
  }

  const headers = insp?.sheets.find((s) => s.sheet === sheet)?.headers ?? [];
  const v = preview?.version;
  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>Import a framework (.xlsx)</h2>
      <p className="hint">Use authorised APQC content or your own hierarchy. Jade stores the original file with its checksum,
        validates it, shows a preview, and only an activated version can be referenced. Earlier versions stay resolvable.</p>
      <div className="btnrow">
        <button className="btn small" onClick={() => processApi.template().catch((e) => setError(String(e)))}>Download template</button>
        <label className="btn small">Choose workbook…
          <input type="file" accept=".xlsx" aria-label="Framework workbook" style={{ display: "none" }}
                 onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {file && <span className="mono">{file.name}</span>}
      </div>
      {insp && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="formgrid" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8, alignItems: "center" }}>
            <label htmlFor="pf-target">Import as</label>
            <select id="pf-target" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">A new framework</option>
              {list.frameworks.map((f) => <option key={f.framework_id} value={f.framework_id}>New version of {f.name}</option>)}
            </select>
            {!existing && (<>
              <label htmlFor="pf-name">Framework name</label>
              <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} />
              <label htmlFor="pf-kind">Content</label>
              <select id="pf-kind" value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>
                {Object.entries(list.source_kinds).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </>)}
            <label htmlFor="pf-statement">{(existing?.source_kind ?? kind) === "apqc_authorised" ? "Authority to use APQC content (required)" : "Source statement"}</label>
            <input id="pf-statement" value={statement} onChange={(e) => setStatement(e.target.value)}
                   placeholder="e.g. licence reference, or who owns this hierarchy" />
            <label htmlFor="pf-sheet">Sheet</label>
            <select id="pf-sheet" value={sheet} onChange={(e) => { setSheet(e.target.value); setMapping(insp.sheets.find((s) => s.sheet === e.target.value)?.proposed_mapping ?? {}); }}>
              {insp.sheets.map((s) => <option key={s.sheet} value={s.sheet}>{s.sheet} ({s.rows} rows)</option>)}
            </select>
          </div>
          <h3>Column mapping</h3>
          <table className="grid"><tbody>
            {insp.fields.map((f) => (
              <tr key={f}>
                <td>{insp.field_labels[f]}{insp.required_fields.includes(f) ? " *" : ""}</td>
                <td>
                  <select aria-label={`Column for ${insp.field_labels[f]}`} value={mapping[f] ?? ""}
                          onChange={(e) => setMapping({ ...mapping, [f]: e.target.value || null })}>
                    <option value="">(not mapped)</option>
                    {headers.filter(Boolean).map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody></table>
          <label><input type="checkbox" checked={derive} onChange={(e) => setDerive(e.target.checked)} /> Derive the parent from a dotted Node ID when Parent ID is empty (1.2.3 → 1.2)</label>
          <div className="btnrow"><button className="btn primary" disabled={busy} onClick={validate}>Validate and preview</button></div>
        </div>
      )}
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {preview && v && (
        <div className="stack" style={{ marginTop: 12 }}>
          <h3>Preview: {preview.framework.name} version {v.version} <span className={`badge ${statusTone[v.status]}`}>{v.status}</span></h3>
          <p>{v.node_count} nodes · file sha256 <span className="mono">{v.file_sha256.slice(0, 16)}…</span>
            {v.changes.compared_with_version && <> · compared with active v{v.changes.compared_with_version}: {v.changes.added?.length} added, {v.changes.changed?.length} changed ({v.changes.changed?.join(", ") || "none"}), {v.changes.removed?.length} removed</>}</p>
          {v.validation.errors.length > 0 && (
            <div className="callout" style={{ borderColor: "var(--stop)" }}><strong>{v.validation.errors.length} error(s) -- cannot activate</strong>
              <ul>{v.validation.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul></div>)}
          {v.validation.warnings.length > 0 && (
            <div className="callout" style={{ borderColor: "var(--warn)" }}><ul>{v.validation.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>)}
          <Hierarchy nodes={preview.nodes} selected={null} onSelect={() => undefined} />
          <div className="btnrow">
            <button className="btn primary" disabled={busy || v.validation.errors.length > 0} onClick={activate}>Activate version {v.version}</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProcessFramework({ navFilter, navToken, onNavigate }: Partial<NavTarget> & { onNavigate?: Navigate }) {
  const [list, setList] = useState<FrameworkList | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState<{ fid: string; version: number } | null>(null);
  const [preview, setPreview] = useState<VersionPreview | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => processApi.frameworks().then((l) => {
    setList(l);
    setOpen((cur) => {
      if (navFilter?.framework) return { fid: navFilter.framework, version: Number(navFilter.version) || l.frameworks.find((f) => f.framework_id === navFilter.framework)?.active_version || 1 };
      if (cur) return cur;
      const f = l.frameworks.find((x) => x.framework_id === l.settings.selected_framework_id) ?? l.frameworks[0];
      return f && (f.active_version ?? f.versions[0]?.version) ? { fid: f.framework_id, version: (f.active_version ?? f.versions[0].version) } : null;
    });
  }).catch((e) => setError(saveErrorMessage(e, "Could not load frameworks.")));
  useEffect(() => {
    if (IS_MOCK_MODE) return;
    load();
    api.getSession().then((s) => setIsAdmin((s.customers.find((c) => c.id === s.activeCustomerId)?.roles ?? []).includes("admin")));
    if (navFilter?.node) setNode(navFilter.node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navToken]);
  useEffect(() => { if (open) processApi.version(open.fid, open.version).then(setPreview).catch((e) => setError(saveErrorMessage(e, "Could not load the version."))); }, [open?.fid, open?.version]);

  if (IS_MOCK_MODE) return <section className="panel"><h1>Process Framework</h1><p className="notstated">Needs the real backend.</p></section>;
  if (!list) return <Loading what="process frameworks" />;
  const fw = list.frameworks.find((f) => f.framework_id === open?.fid);

  return (
    <div className="stack">
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Process Framework</h1>
        <p className="hint">The company's business-process hierarchy that stories, process maps and designs refer to. Jade does
          not supply APQC content and never invents official identifiers: import content you are authorised to use, or your own hierarchy.</p>
        {notice && <div className="callout" style={{ borderColor: "var(--ok)" }}>{notice}</div>}
        {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
        {list.frameworks.length === 0 ? <p className="notstated">No framework imported yet.</p> : list.frameworks.map((f) => (
          <div key={f.framework_id} className="callout" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <strong>{f.name}</strong> {kindBadge(f.source_kind)}
              {list.settings.selected_framework_id === f.framework_id
                ? <span className="badge ok">Selected for this company</span>
                : isAdmin && f.active_version && <button className="btn small" onClick={() => processApi.select(f.framework_id, list.settings.revision).then(load).catch((e) => setError(saveErrorMessage(e, "Refused.")))}>Select for this company</button>}
              <span className="hint mono">{f.framework_id}</span>
            </div>
            <table className="grid" style={{ marginTop: 8 }}>
              <thead><tr><th>Version</th><th>Status</th><th>Original file</th><th>Nodes</th><th>Imported</th><th>Activated</th><th>Changes</th><th></th></tr></thead>
              <tbody>{f.versions.map((v) => (
                <tr key={v.version}>
                  <td>v{v.version}</td>
                  <td><span className={`badge ${statusTone[v.status] ?? "grey"}`}>{v.status}</span></td>
                  <td><span className="mono">{v.file_name}</span><br /><span className="hint mono">sha256 {v.file_sha256.slice(0, 12)}…</span></td>
                  <td>{v.node_count}</td>
                  <td>{v.uploaded_by}<br /><span className="hint">{v.uploaded_at.slice(0, 16).replace("T", " ")}</span></td>
                  <td>{v.activated_by ?? "--"}</td>
                  <td className="hint">{v.changes.compared_with_version ? `vs v${v.changes.compared_with_version}: +${v.changes.added?.length} ~${v.changes.changed?.length} -${v.changes.removed?.length}` : "--"}</td>
                  <td className="btnrow">
                    <button className="btn small" onClick={() => { setOpen({ fid: f.framework_id, version: v.version }); setNode(null); }}>View</button>
                    <button className="btn small" onClick={() => processApi.originalFile(f.framework_id, v.version).catch((e) => setError(String(e)))}>Original file</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </section>

      {fw && preview && (
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>{fw.name} -- version {preview.version.version} <span className={`badge ${statusTone[preview.version.status]}`}>{preview.version.status}</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)", gap: 16 }}>
            <Hierarchy nodes={preview.nodes} selected={node} onSelect={setNode} />
            {node ? <NodeDetail fw={fw} preview={preview} nodeKey={node} onNavigate={onNavigate} /> : <p className="hint">Select a process to see its details and the stories mapped to it.</p>}
          </div>
        </section>
      )}

      {isAdmin ? <ImportPanel list={list} onDone={(p) => {
        setNotice(`Activated ${p.framework.name} version ${p.version.version}.` + (p.affected_stories?.length
          ? ` Stories whose mapped processes changed (their references stay on the old version; designs flagged for reassessment): ${p.affected_stories.map((s) => `${s.story_id} (${s.nodes.join(", ")})`).join("; ")}.` : ""));
        load(); setOpen({ fid: p.framework.framework_id, version: p.version.version });
      }} /> : <p className="hint">Only an Admin can import or activate a framework.</p>}
    </div>
  );
}
