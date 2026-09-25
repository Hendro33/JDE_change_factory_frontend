import { useEffect, useState } from "react";
import { api } from "../services/api";
import { saveErrorMessage } from "../services/saveErrors";
import type { ExecutionState, ExecutionStatus, PreflightResult, Reconciliation } from "../types/domain";

const STATE_LABEL: Record<ExecutionState, { text: string; tone: string }> = {
  ready: { text: "Not executed", tone: "grey" },
  in_progress: { text: "In progress", tone: "warn" },
  applied: { text: "Applied in JDE", tone: "ok" },
  completed: { text: "Test run completed", tone: "ok" },
  unknown: { text: "Outcome unknown — reconcile", tone: "stop" },
  diverged: { text: "Diverged — cannot run", tone: "stop" },
};

function StateBadge({ state }: { state: ExecutionState }) {
  const s = STATE_LABEL[state] ?? { text: state, tone: "grey" };
  return <span className={`badge ${s.tone}`}>{s.text}</span>;
}

/**
 * Whether an approved exact change actually ran, what the execution gate
 * would decide right now (every check, not just the first refusal), and
 * -- when an earlier attempt may or may not have reached JDE -- the
 * reconciliation that must happen before anything runs again.
 */
export function ExecutionPanel({
  changeId, execution, approvalStatus, onChanged,
}: {
  changeId: string;
  execution?: ExecutionStatus;
  /** Re-asks the gate when the approval changes, not only the execution state. */
  approvalStatus?: string;
  onChanged: () => void;
}) {
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [observedValue, setObservedValue] = useState("");
  const [note, setNote] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreflight = () => {
    api.getExecutionPreflight(changeId)
      .then((p) => { setPreflight(p); setPreflightError(null); })
      .catch((e) => setPreflightError(saveErrorMessage(e, "Could not ask the execution gate.")));
  };
  useEffect(loadPreflight, [changeId, approvalStatus, execution?.writeState, execution?.testState]);

  const live = preflight?.mode === "live";
  const writeUnknown = execution?.writeState === "unknown";
  const testUnknown = execution?.testState === "unknown";

  async function reconcileWrite() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const r = await api.reconcileExecution(changeId, live ? { observedValue, note, evidenceReference } : { note });
      setMessage(
        `Write reconciled: ${r.outcome.replace("_", " ")} (target value ${r.observedValue}, ${r.source}). ` +
        "Recorded with the exact target and your name, and added to the evidence chain." +
        (r.outcome === "not_applied" ? " A retry still needs a current, unexpired approval and passes every gate check again." : "")
      );
      onChanged();
    } catch (e) {
      setError(saveErrorMessage(e, "Could not reconcile."));
    } finally {
      setBusy(false);
    }
  }

  async function reconcileTest(ran: boolean) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const r = await api.reconcileTestRun(changeId, { ran, note, evidenceReference });
      setMessage(`Test run reconciled as ${r.outcome.replace("_", " ")}; recorded and added to the evidence chain.`);
      onChanged();
    } catch (e) {
      setError(saveErrorMessage(e, "Could not reconcile the test run."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: "0 0 8px" }}>Execution</h3>
      <dl className="facts">
        <dt>Write</dt><dd><StateBadge state={execution?.writeState ?? "ready"} /></dd>
        <dt>Test run</dt><dd><StateBadge state={execution?.testState ?? "ready"} /></dd>
        {execution && execution.attempts > 0 && (
          <>
            <dt>Attempts</dt>
            <dd>
              {execution.attempts}
              {execution.lastAttemptAt && `, last ${new Date(execution.lastAttemptAt).toLocaleString("en-GB")}`}
              {execution.lastDetail && <div className="hint">{execution.lastDetail}</div>}
            </dd>
          </>
        )}
        {execution?.beforeValue != null && (<><dt>Value before</dt><dd className="mono">{execution.beforeValue}</dd></>)}
      </dl>

      {(writeUnknown || testUnknown) && (
        <div className="callout" style={{ borderColor: "var(--stop)", marginTop: 12 }}>
          <strong>{writeUnknown ? "The write may or may not have reached JDE" : "The test run may or may not have run"}</strong>
          Nothing more runs for this change until someone with approval authority checks the actual state in JDE.
          {writeUnknown && (live
            ? " Read the processing option in JDE and enter the value you see."
            : " Jade reads the value itself (mock JDE).")}
          <div className="stack" style={{ marginTop: 8 }}>
            {writeUnknown && live && (
              <div className="field">
                <label htmlFor={`observed-${changeId}`}>Value in JDE now</label>
                <input id={`observed-${changeId}`} type="text" value={observedValue} onChange={(e) => setObservedValue(e.target.value)} />
              </div>
            )}
            <div className="field">
              <label htmlFor={`recnote-${changeId}`}>What you checked{testUnknown || live ? "" : " (optional)"}</label>
              <textarea id={`recnote-${changeId}`} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {(live || (!writeUnknown && testUnknown)) && (
              <div className="field">
                <label htmlFor={`recevidence-${changeId}`}>
                  Evidence reference <span className="hint">(where this can be checked: screenshot, ticket or export)</span>
                </label>
                <input id={`recevidence-${changeId}`} type="text" value={evidenceReference} onChange={(e) => setEvidenceReference(e.target.value)} />
              </div>
            )}
            <div className="btnrow">
              {writeUnknown && (
                <button className="btn primary" disabled={busy || (live && (!observedValue.trim() || !note.trim() || !evidenceReference.trim()))} onClick={reconcileWrite}>
                  {live ? "Record the value I read" : "Check the target now"}
                </button>
              )}
              {!writeUnknown && testUnknown && (
                <>
                  <button className="btn" disabled={busy || !note.trim() || !evidenceReference.trim()} onClick={() => reconcileTest(true)}>It ran</button>
                  <button className="btn" disabled={busy || !note.trim() || !evidenceReference.trim()} onClick={() => reconcileTest(false)}>It did not run</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {execution?.writeState === "diverged" && (
        <div className="callout" style={{ borderColor: "var(--stop)", marginTop: 12 }}>
          <strong>This change can no longer run</strong>
          The target was in neither the value before the change nor the approved value. Investigate in JDE, then propose a new change.
        </div>
      )}
      {message && <div className="callout" style={{ marginTop: 12 }}>{message}</div>}
      {error && (
        <div className="callout" style={{ borderColor: "var(--stop)", marginTop: 12 }}>
          <strong>Not recorded</strong>{error}
        </div>
      )}

      <ReconciliationLog title="Write reconciliations" rows={execution?.writeReconciliations ?? []} write />
      <ReconciliationLog title="Test-run reconciliations" rows={execution?.testReconciliations ?? []} write={false} />

      <div style={{ marginTop: 12 }}>
        <strong>Would the execution gate allow this write now?</strong>{" "}
        {preflight && (
          <span className={`badge ${preflight.executable ? "ok" : "stop"}`}>
            {preflight.executable ? "Yes" : "No"}
          </span>
        )}
        {preflight?.mode === "mock" && <span className="hint"> — mock JDE: nothing real would be written</span>}
        {preflightError && <div className="notstated">{preflightError}</div>}
        {preflight && (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5 }}>
            {preflight.checks.map((c) => (
              <li key={c.check}>
                <span style={{ color: c.ok ? "var(--ok)" : "var(--stop)" }}>{c.ok ? "✓" : "✗"}</span> {c.check}
                {!c.ok && c.detail && <div className="hint">{c.detail}</div>}
              </li>
            ))}
          </ul>
        )}
        <div className="hint" style={{ marginTop: 6 }}>
          Jade itself never starts the write: an agent or operator does, and the gate re-runs every check above at that moment.
        </div>
      </div>
    </div>
  );
}

function ReconciliationLog({ title, rows, write }: { title: string; rows: Reconciliation[]; write: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <strong>{title}</strong>
      <table className="data">
        <thead>
          <tr><th>When</th><th>By</th><th>Target</th><th>Observed</th><th>Outcome</th><th>Evidence</th><th>Note</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{new Date(r.at).toLocaleString("en-GB")}</td>
              <td>{r.actor?.displayName || r.verifiedBy}</td>
              <td className="mono">
                {write
                  ? `${r.target.application}/${r.target.version}/${r.target.option} → ${r.target.approved_value}`
                  : r.target.orchestration}
                <div className="hint">{r.target.jde_environment ?? "no bound environment"}</div>
              </td>
              <td className="mono">{write ? String(r.observed?.value ?? r.observedValue ?? "—") : r.observed?.ran ? "ran" : "did not run"}</td>
              <td>{r.outcome.replace("_", " ")}</td>
              <td>
                {r.evidenceReference}
                <div className="hint">{r.source}</div>
              </td>
              <td>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
