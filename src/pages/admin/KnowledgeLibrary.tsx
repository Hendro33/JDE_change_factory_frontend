import { useEffect, useState } from "react";
import { discoveryApi, type ArtifactView, type ExportFormat } from "../../services/discoveryApi";
import { fileToBase64, formatBytes } from "../../services/aiApi";
import { saveErrorMessage } from "../../services/saveErrors";
import { Loading } from "../../components/ui";

const FORMAT_BY_EXT: Record<string, ExportFormat> = { pdf: "pdf", docx: "docx", txt: "text", md: "markdown" };

/**
 * Admin > Knowledge Library: the customer's reference documents
 * (manuals, standards, specifications) that agents may use when a
 * Start-up Pack references them. Every upload is an immutable revision
 * with its checksum; nothing is overwritten.
 */
export function KnowledgeLibrary() {
  const [docs, setDocs] = useState<ArtifactView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [docRevision, setDocRevision] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => discoveryApi.listArtifacts()
    .then((a) => setDocs(a.filter((x) => x.kind === "reference_document")))
    .catch((e) => setError(saveErrorMessage(e, "Could not load the library.")));
  useEffect(() => { load(); }, []);

  async function upload() {
    if (!file || !title.trim()) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const exportFormat = FORMAT_BY_EXT[ext];
    if (!exportFormat) { setError("Only PDF, DOCX, TXT and Markdown files."); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const created = await discoveryApi.uploadArtifact({
        kind: "reference_document", domainId: null, objectName: title.trim(), objectType: "DOC", exportFormat,
        customerEnvironment: "", pathCode: "", release: "", sourceLocation: "", repository: "", commitRef: "",
        exportedAt: new Date().toISOString(), runtimeCorrespondence: "unknown", runtimeStatement: "", runtimeStatedBy: "",
        docTitle: title.trim(), docRevision: docRevision.trim(), appliesToReleases: [], fileName: file.name,
        contentBase64: await fileToBase64(file),
      });
      setNotice(created.extractionStatus === "supported"
        ? `${title} stored as revision ${created.revision} and readable by agents that are given it.`
        : `${title} stored as revision ${created.revision}, but it cannot be read: ${created.extractionNote}`);
      setTitle(""); setDocRevision(""); setFile(null);
      await load();
    } catch (e) {
      setError(saveErrorMessage(e, "The document could not be stored."));
    } finally {
      setBusy(false);
    }
  }

  if (!docs) return error ? <div className="badge stop">{error}</div> : <Loading what="knowledge library" />;
  return (
    <div className="stack" data-testid="knowledge-library">
      <section className="panel">
        <h2>Knowledge Library</h2>
        <p style={{ marginTop: 0 }}>
          Reference documents agents can use when their Start-up Pack names them (Admin › Agent Configuration). An agent
          only sees the documents its pack references, only for this customer, and reads their text only if the
          document policy permits it (Admin › AI Connections). Document text is treated as evidence, never as
          instructions, and is cited with page or section.
        </p>
        <table className="data">
          <thead><tr><th>Document</th><th>Revision</th><th>Readable by agents</th><th>Added</th></tr></thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={4} className="hint">No documents yet.</td></tr>}
            {docs.map((d) => (
              <tr key={`${d.artifactId}-${d.revision}`}>
                <td>
                  {String(d.meta.doc_title || d.meta.object_name)}{!d.latest && <span className="hint"> (superseded)</span>}
                  <div className="hint mono">{d.artifactId} · {String(d.meta.file_name ?? "")} · {formatBytes(d.sizeBytes)} · sha256 {d.sha256.slice(0, 12)}…</div>
                </td>
                <td className="mono">r{d.revision}{d.meta.doc_revision ? ` (${String(d.meta.doc_revision)})` : ""}</td>
                <td>
                  <span className={`badge ${d.extractionStatus === "supported" ? "ok" : "warn"}`}>
                    {d.extractionStatus === "supported" ? "Yes" : "No"}
                  </span>
                  {d.extractionNote && <div className="hint">{d.extractionNote}</div>}
                </td>
                <td>{d.uploadedBy}<div className="hint">{new Date(d.uploadedAt).toLocaleString()}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Add a document</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          PDF, DOCX, TXT or Markdown. The same title again adds a new revision. Password-protected and scanned PDFs are
          stored but cannot be read (no OCR).
        </p>
        <div className="grid halves">
          <div className="field"><label htmlFor="kl-title">Title</label>
            <input id="kl-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sales order handling standard" /></div>
          <div className="field"><label htmlFor="kl-rev">Document version <span className="hint">(optional)</span></label>
            <input id="kl-rev" type="text" value={docRevision} onChange={(e) => setDocRevision(e.target.value)} placeholder="e.g. v3" /></div>
        </div>
        <div className="field">
          <input type="file" aria-label="Document file" accept=".pdf,.docx,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="btnrow">
          <button className="btn primary" disabled={busy || !file || !title.trim()} onClick={upload}>{busy ? "Storing…" : "Add to library"}</button>
        </div>
        {notice && <div className="badge ok" role="status">{notice}</div>}
        {error && <div className="badge stop" role="alert">{error}</div>}
      </section>
    </div>
  );
}
