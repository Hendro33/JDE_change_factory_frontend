import { useState } from "react";
import { DemandNav } from "../demand/DemandNav";
import { api } from "../../services/api";
import type { Attachment } from "../../services/aiApi";
import type { ChangeSource } from "../../types/domain";
import { DraftDocuments } from "../../components/RequestDocuments";
import { ErrorState, PageHeader, Section } from "../../components/design";
import { Link, navigate, storyPath } from "../../router";

const SOURCES: ChangeSource[] = ["Business", "Support / Topdesk", "Optimisation", "DevOps"];

/** Capture a request exactly as it was raised; JADE does the rest. */
export function NewRequestPage() {
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<ChangeSource>("Business");
  const [ref, setRef] = useState("");
  const [request, setRequest] = useState("");
  const [docs, setDocs] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [analyse, setAnalyse] = useState(true);

  async function create() {
    setBusy(true); setError(null);
    try {
      const created = await api.createChange({ title: title.trim(), source, sourceReference: ref.trim(),
        originalRequest: request.trim(), attachmentIds: docs.map((d) => d.id) });
      if (analyse) {
        try { await api.enhanceStory(created.id); } catch { /* shown as the next step on the story */ }
      }
      navigate(storyPath(created.id));
    } catch (e) {
      // Nothing is lost: the form and its uploaded documents stay as they are.
      setError(e);
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <DemandNav />
      <PageHeader title="New request" subtitle="Record the need as it was raised. JADE turns it into a user story, maps it to the business and proposes a solution." />
      <Section>
        <div className="field">
          <label htmlFor="nr-title">Short title</label>
          <input id="nr-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Returns must carry an authorisation number" />
        </div>
        <div className="fieldrow">
          <div className="field">
            <label htmlFor="nr-source">Where did it come from?</label>
            <select id="nr-source" value={source} onChange={(e) => setSource(e.target.value as ChangeSource)}>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nr-ref">Reference <span className="hint">(ticket, email, meeting)</span></label>
            <input id="nr-ref" type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. Topdesk #4521" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="nr-req">The request, in the requester's own words</label>
          <textarea id="nr-req" value={request} onChange={(e) => setRequest(e.target.value)}
            placeholder="Paste the ticket text or note exactly as written. Don't tidy it up — JADE works better with the original wording." />
        </div>
        <DraftDocuments value={docs} onChange={setDocs} />
        <label className="checkline"><input type="checkbox" checked={analyse} onChange={(e) => setAnalyse(e.target.checked)} /> Start JADE's analysis straight away</label>
        {error !== null && <ErrorState error={error} title="The request was not created" />}
        <div className="btnrow" style={{ marginTop: 16 }}>
          <button className="btn primary" disabled={busy || !title.trim() || !request.trim()} onClick={create}>{busy ? "Creating…" : "Create request"}</button>
          <Link className="btn" to="/stories">Cancel</Link>
        </div>
      </Section>
    </div>
  );
}
