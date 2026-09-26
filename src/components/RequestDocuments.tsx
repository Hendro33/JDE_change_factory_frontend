import { useCallback, useEffect, useRef, useState } from "react";
import {
  aiApi,
  EXTRACTION_LABEL,
  EXTRACTION_TONE,
  formatBytes,
  type Attachment,
  type AttachmentLimits,
} from "../services/aiApi";
import { saveErrorMessage } from "../services/saveErrors";
import type { DocumentCitation } from "../types/domain";

const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

const LIMITATIONS =
  "PDF, DOCX and TXT only. Password-protected PDFs and scanned PDFs without a text layer cannot be read (Jade has no " +
  "OCR); DOCX files with macros are refused. A document that cannot be read is still kept with the request, and " +
  "Jade never claims to have analysed it. Uploading does not send anything to AI: whether agents may read the text " +
  "is decided by this customer's document policy (Admin > AI Connections).";

function StatusBadge({ a }: { a: Attachment }) {
  return <span className={`badge ${EXTRACTION_TONE[a.extractionStatus]}`}>{EXTRACTION_LABEL[a.extractionStatus]}</span>;
}

function busy(a: Attachment) {
  return a.extractionStatus === "pending" || a.extractionStatus === "extracting";
}

/** Poll attachments that are still being read. */
function usePolling(items: Attachment[], refresh: () => void) {
  const any = items.some(busy);
  useEffect(() => {
    if (!any) return;
    const t = setInterval(refresh, 1200);
    return () => clearInterval(t);
  }, [any, refresh]);
}

/**
 * Documents added while writing a new request. They are uploaded at once
 * (as pending uploads owned by this user) and become part of the request
 * only when it is submitted; removing one here deletes it.
 */
export function DraftDocuments({ value, onChange }: { value: Attachment[]; onChange: (v: Attachment[]) => void }) {
  const [limits, setLimits] = useState<AttachmentLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => { aiApi.attachmentLimits().then(setLimits).catch(() => setLimits(null)); }, []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const refresh = useCallback(async () => {
    const next = await Promise.all(latest.current.map((a) => (busy(a) ? aiApi.pending(a.id).catch(() => a) : a)));
    onChangeRef.current(next);
  }, []);
  usePolling(value, refresh);

  async function add(files: FileList | null) {
    if (!files) return;
    setError(null);
    const list = Array.from(files);
    if (limits && value.length + list.length > limits.maxFiles) {
      setError(`At most ${limits.maxFiles} documents per request.`);
      return;
    }
    let acc = [...value];
    for (const f of list) {
      if (limits && f.size > limits.maxFileBytes) {
        setError(`${f.name} is larger than ${formatBytes(limits.maxFileBytes)}.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const a = await aiApi.upload(f);
        acc = [...acc, a];
        onChange(acc);
      } catch (e) {
        setError(saveErrorMessage(e, `${f.name} could not be uploaded.`));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
  }

  async function remove(a: Attachment) {
    try {
      await aiApi.removePending(a.id);
    } catch {
      /* already gone: nothing to keep */
    }
    onChange(latest.current.filter((x) => x.id !== a.id));
  }

  const total = value.reduce((n, a) => n + a.sizeBytes, 0);
  return (
    <div className="field" data-testid="draft-documents">
      <label>Documents <span className="hint">(optional)</span></label>
      <div className="hint" style={{ marginBottom: 8 }}>
        {limits
          ? `Up to ${limits.maxFiles} files, ${formatBytes(limits.maxFileBytes)} each, ${formatBytes(limits.maxTotalBytes)} together. `
          : ""}
        {LIMITATIONS}
      </div>
      {value.length > 0 && (
        <table className="data" style={{ marginBottom: 8 }}>
          <tbody>
            {value.map((a) => (
              <tr key={a.id}>
                <td>{a.filename}</td>
                <td className="mono">{formatBytes(a.sizeBytes)}</td>
                <td><StatusBadge a={a} />{a.extractionStatus === "failed" && <div className="hint">{a.extractionDetail}</div>}</td>
                <td><button className="btn" onClick={() => remove(a)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <input ref={input} type="file" multiple accept={ACCEPT} aria-label="Add documents"
        onChange={(e) => add(e.target.files)} disabled={uploading > 0} />
      {uploading > 0 && <div className="hint">Uploading…</div>}
      {limits && total > limits.maxTotalBytes && (
        <div className="badge stop">Together these are larger than {formatBytes(limits.maxTotalBytes)}; remove one.</div>
      )}
      {error && <div className="badge stop" role="alert" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}

/** The documents of an existing request: status, download, retry, remove. */
export function RequestDocuments({ requestId, canEdit = true }: { requestId: string; canEdit?: boolean }) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await aiApi.attachments(requestId)).attachments);
    } catch (e) {
      setError(saveErrorMessage(e, "Documents could not be loaded."));
    }
  }, [requestId]);
  useEffect(() => { load(); }, [load]);
  usePolling(items ?? [], load);

  async function act(fn: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(saveErrorMessage(e, fallback));
    }
  }

  if (items === null) return error ? <div className="badge stop">{error}</div> : null;
  if (items.length === 0) return null;
  return (
    <section className="panel" data-testid="request-documents">
      <h2>Documents</h2>
      <table className="data">
        <thead><tr><th>File</th><th>Added</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>
                {a.filename}
                <div className="hint mono">{a.fileType.toUpperCase()} · {formatBytes(a.sizeBytes)} · r{a.revision} · sha256 {a.sha256.slice(0, 12)}…</div>
              </td>
              <td>{a.uploadedBy}<div className="hint">{new Date(a.uploadedAt).toLocaleString()}</div></td>
              <td>
                <StatusBadge a={a} />
                <div className="hint">
                  {a.deletedAt ? `Removed by ${a.deletedBy} on ${new Date(a.deletedAt).toLocaleString()}` : a.extractionDetail}
                </div>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {!a.deletedAt && (
                  <>
                    <button className="btn" onClick={() => act(() => aiApi.download(requestId, a), "Download failed.")}>Download</button>{" "}
                    {canEdit && a.extractionStatus === "failed" && (
                      <button className="btn" onClick={() => act(() => aiApi.retry(requestId, a.id), "Retry failed.")}>Retry</button>
                    )}{" "}
                    {canEdit && (
                      <button className="btn" onClick={() => {
                        if (window.confirm(`Remove ${a.filename}? The file is deleted; the record of it stays.`)) {
                          act(() => aiApi.removeAttachment(requestId, a.id), "Could not remove the document.");
                        }
                      }}>Remove</button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="apinote">{LIMITATIONS}</div>
      {error && <div className="badge stop" role="alert">{error}</div>}
    </section>
  );
}

/** Statements in the story that rest on a document, with whether Jade could verify the citation. */
export function DocumentCitations({ citations }: { citations?: DocumentCitation[] }) {
  if (!citations || citations.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }} data-testid="document-citations">
      <h3 style={{ fontSize: 13.5, margin: "0 0 6px" }}>Based on documents</h3>
      <table className="data">
        <tbody>
          {citations.map((c, i) => (
            <tr key={i}>
              <td>{c.claim}</td>
              <td className="mono">{c.source}</td>
              <td>
                {c.verified
                  ? <span className="badge ok" title="The cited section was returned to the agent in this run">Verified source</span>
                  : <span className="badge warn" title="The agent cited a section Jade did not give it in this run">Not verified — check it</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
