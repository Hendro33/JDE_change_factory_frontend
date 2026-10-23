import { AcceptanceList } from "../../components/work";
import { useEffect, useState } from "react";
import { deliveryApi } from "../../services/deliveryApi";
import { saveErrorMessage } from "../../services/saveErrors";
import type { Change, HandoffItem, HandoffView } from "../../types/domain";
import { formatDateTime, useSessionInfo } from "../../components/design";

/**
 * Work done by a named implementer outside JADE (review, change 4): the
 * specification to download, a named implementer per item, and each item
 * recorded as completed with an evidence reference. For an implementation by
 * a person, the result is then verified against the acceptance criteria.
 */
export function HandoffPanel({ change, onChanged }: { change: Change; onChanged: () => void }) {
  const info = useSessionInfo();
  const [view, setView] = useState<HandoffView | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    deliveryApi.handoff(change.id).then(setView).catch((e) => setError(saveErrorMessage(e, "The hand-off could not be loaded.")));
  }, [change.id, tick, change.updatedAt, change.lifecycle?.nextAction.action]);

  if (!view || (view.items.length === 0 && view.route !== "Human Implementation")) return error ? <p className="muted">{error}</p> : null;
  const recorder = info.has("product_manager", "admin", "cnc_operator");
  const done = view.items.filter((i) => i.completion).length;
  const changed = () => { setTick((t) => t + 1); onChanged(); };
  const human = view.route === "Human Implementation";

  return (
    <section className="panel handoff" id="handoff" aria-label="Work by a named implementer">
      <div className="handoff-head">
        <div>
          <h2 className="titlebar">Work by a named implementer</h2>
          <p className="muted">{view.authorisation
            ? `Authorised by ${view.authorisation.by}${view.authorisation.at ? ` on ${formatDateTime(String(view.authorisation.at))}` : ""}. ${done} of ${view.items.length} recorded.`
            : "Not authorised yet: nothing is implemented until the design (or its exact change) is approved."}</p>
        </div>
        <button className="btn" onClick={() => deliveryApi.downloadSpecification(change.id).catch((e) => setError(saveErrorMessage(e, "The specification could not be downloaded.")))}>
          Download the specification (PDF)</button>
      </div>
      <ol className="handoff-items">
        {view.items.map((it) => <HandoffRow key={it.id} change={change} item={it} canRecord={recorder && !!view.authorisation} onChanged={changed} />)}
      </ol>
      {human && view.items.length > 0 && done === view.items.length && (
        <Verification change={change} view={view} canRecord={recorder} onChanged={changed} />
      )}
      {error && <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{error}</div>}
    </section>
  );
}

function HandoffRow({ change, item, canRecord, onChanged }: { change: Change; item: HandoffItem; canRecord: boolean; onChanged: () => void }) {
  const [name, setName] = useState(item.implementer);
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const c = item.completion;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); setOpen(false); onChanged(); } catch (e) { setError(saveErrorMessage(e, "Not recorded.")); } finally { setBusy(false); }
  }

  return (
    <li className={`handoff-item${c ? " done" : ""}`}>
      <div className="handoff-line">
        <span className="wi-state"><span aria-hidden="true">{c ? "✓" : "○"}</span> {c ? "Done" : "To do"}</span>
        <span className="handoff-text">{item.text}</span>
      </div>
      {c ? (
        <p className="hint">Completed by {c.implementer} · evidence: {c.evidence_reference}{c.note ? ` · ${c.note}` : ""} · recorded by {c.by}, {formatDateTime(c.at)}</p>
      ) : (
        <div className="handoff-controls">
          <label className="sr-only" htmlFor={`impl-${item.id}`}>Implementer</label>
          <input id={`impl-${item.id}`} value={name} placeholder="Implementer (person or team)" onChange={(e) => setName(e.target.value)} disabled={!canRecord && !!item.implementer} />
          {canRecord && name.trim() && name.trim() !== item.implementer && (
            <button className="btn small" disabled={busy} onClick={() => run(() => deliveryApi.nameImplementer(change.id, item.id, name))}>Save name</button>
          )}
          {canRecord && !open && <button className="btn small primary" onClick={() => setOpen(true)}>Record as done</button>}
        </div>
      )}
      {open && !c && (
        <div className="handoff-form">
          <div className="field"><label htmlFor={`ev-${item.id}`}>Evidence reference</label>
            <input id={`ev-${item.id}`} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="OMW project, screenshot, document or ticket" /></div>
          <div className="field"><label htmlFor={`note-${item.id}`}>Note (optional)</label>
            <input id={`note-${item.id}`} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="btnrow">
            <button className="btn primary small" disabled={busy || evidence.trim().length < 3}
                    onClick={() => run(() => deliveryApi.completeHandoffItem(change.id, item.id, { implementer: name, evidenceReference: evidence, note }))}>
              {busy ? "Recording…" : "Record as done"}</button>
            <button className="btn quiet small" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{error}</p>}
    </li>
  );
}

function Verification({ change, view, canRecord, onChanged }: { change: Change; view: HandoffView; canRecord: boolean; onChanged: () => void }) {
  const [passed, setPassed] = useState<boolean | null>(null);
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const v = view.verification;
  if (v && v.passed) return <p className="handoff-verified">✓ Verified against the acceptance criteria by {v.by}, {formatDateTime(v.at)}: {v.note} (evidence: {v.evidence_reference})</p>;
  if (!canRecord) return <p className="muted">{v ? `Not verified: ${v.note}` : "Waiting for the verification against the acceptance criteria."}</p>;
  return (
    <fieldset className="handoff-verify">
      <legend>Verify the result against the acceptance criteria</legend>
      {v && <p className="callout" style={{ borderColor: "var(--stop)" }}><strong>Previous verification did not pass</strong>{v.note}</p>}
      <AcceptanceList change={change} />
      <div className="btnrow" role="radiogroup" aria-label="Result">
        <label><input type="radio" name="hv" checked={passed === true} onChange={() => setPassed(true)} /> Meets the criteria</label>
        <label><input type="radio" name="hv" checked={passed === false} onChange={() => setPassed(false)} /> Does not meet them</label>
      </div>
      <div className="field"><label htmlFor="hv-note">What was checked</label><textarea id="hv-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="field"><label htmlFor="hv-ev">Evidence reference</label><input id="hv-ev" value={evidence} onChange={(e) => setEvidence(e.target.value)} /></div>
      <button className="btn primary" disabled={busy || passed === null || !note.trim() || evidence.trim().length < 3} onClick={async () => {
        setBusy(true); setError("");
        try { await deliveryApi.verifyHandoff(change.id, { passed: !!passed, evidenceReference: evidence, note }); onChanged(); }
        catch (e) { setError(saveErrorMessage(e, "Not recorded.")); } finally { setBusy(false); }
      }}>{busy ? "Recording…" : "Record the verification"}</button>
      {error && <p className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{error}</p>}
    </fieldset>
  );
}
