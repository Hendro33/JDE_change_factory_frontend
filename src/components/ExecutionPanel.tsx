import { useEffect, useState } from "react";
import { api } from "../services/api";
import { HttpError } from "../services/httpApi";
import { saveErrorMessage } from "../services/saveErrors";
import { useSessionInfo } from "./design";
import { approvedLine, ConfigurationItemsTable, isChangeSet, kindLabel } from "./ConfigurationItems";
import type {
  ConfigurationItem, ExactChange, ExecutionState, PreflightResult, Reconciliation, RecordedApplied, RecordedVerification,
} from "../types/domain";

const STATE_LABEL: Record<ExecutionState, { text: string; tone: string }> = {
  ready: { text: "Not recorded yet", tone: "grey" },
  in_progress: { text: "In progress", tone: "warn" },
  applied: { text: "Applied in DEV (recorded)", tone: "ok" },
  completed: { text: "Test result recorded", tone: "ok" },
  unknown: { text: "Outcome unknown — reconcile", tone: "stop" },
  diverged: { text: "Diverged — cannot continue", tone: "stop" },
};

function StateBadge({ state }: { state: ExecutionState }) {
  const s = STATE_LABEL[state] ?? { text: state, tone: "grey" };
  return <span className={`badge ${s.tone}`}>{s.text}</span>;
}

/** A recorded timestamp (seconds since the epoch, or ISO) in the app's date style. */
export function recordedAt(t?: number | string | null): string {
  if (t === undefined || t === null || t === "") return "";
  const d = typeof t === "number" ? new Date(t * 1000) : new Date(t);
  return isNaN(d.getTime()) ? String(t) : d.toLocaleString("en-GB");
}

function isLive(source?: string): boolean {
  return !!source && source.toLowerCase().startsWith("live");
}

/** What was recorded as applied: the value, who, when, and whether JADE read it live or a person stated it. */
export function AppliedFacts({ applied }: { applied: RecordedApplied }) {
  return (
    <dl className="facts">
      <dt>Value in DEV</dt><dd className="mono">{applied.observed_value ?? "—"}</dd>
      <dt>How it was checked</dt>
      <dd>
        <span className={`badge ${isLive(applied.source) ? "ok" : "warn"}`}>{isLive(applied.source) ? "Read back live by JADE" : "Stated by a person"}</span>
        {applied.source && <div className="hint">{applied.source}</div>}
      </dd>
      <dt>Recorded by</dt><dd>{applied.by ?? "—"}{applied.at ? `, ${recordedAt(applied.at)}` : ""}</dd>
      <dt>Evidence</dt><dd>{applied.evidence_reference || <span className="notstated">none stated</span>}</dd>
      {applied.note && <><dt>Note</dt><dd>{applied.note}</dd></>}
    </dl>
  );
}

/** The recorded test outcome: passed or failed, how (live orchestration or recorded by a person), evidence. */
export function VerificationFacts({ verification }: { verification: RecordedVerification }) {
  const live = verification.source === "live orchestration";
  return (
    <dl className="facts">
      <dt>Result</dt><dd><span className={`badge ${verification.passed ? "ok" : "stop"}`}>{verification.passed ? "Passed" : "Failed"}</span></dd>
      <dt>How</dt>
      <dd>{live ? <>Approved test orchestration <span className="mono">{verification.orchestration}</span> ran live</> : "Tested in DEV and recorded by a person"}</dd>
      <dt>Recorded by</dt><dd>{verification.by ?? "—"}{verification.at ? `, ${recordedAt(verification.at)}` : ""}</dd>
      {!live && <><dt>Evidence</dt><dd>{verification.evidence_reference || <span className="notstated">none stated</span>}</dd></>}
      {verification.note && <><dt>What was tested</dt><dd>{verification.note}</dd></>}
    </dl>
  );
}

function nonEmpty<T extends object>(o?: T | Record<string, never> | null): T | null {
  return o && Object.keys(o).length > 0 ? (o as T) : null;
}

/**
 * Delivering an approved functional change on the recorded route. JADE never
 * writes to JD Edwards: the Application Manager applies exactly the approved
 * value in DEV, then records it here and JADE reads it back live through the
 * customer's JD Edwards connection. Where it cannot, the person states the
 * value they read in JDE, with evidence. The test is then run live (the
 * approved orchestration) or recorded against the acceptance criteria.
 * Unknown outcomes from earlier records are reconciled here too.
 */
export function ExecutionPanel({
  changeId, exactChange, approvalStatus, onChanged, compact = false, showItems = false,
}: {
  changeId: string;
  compact?: boolean;
  /** Show every item of a configuration change set with its recorded state (where the page does not already). */
  showItems?: boolean;
  exactChange?: ExactChange;
  /** Re-asks the gate when the approval changes, not only the execution state. */
  approvalStatus?: string;
  onChanged: () => void;
}) {
  const info = useSessionInfo();
  const execution = exactChange?.execution;
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Record applied
  const [appliedEvidence, setAppliedEvidence] = useState("");
  const [appliedNote, setAppliedNote] = useState("");
  const [statedValue, setStatedValue] = useState("");
  const [needsStated, setNeedsStated] = useState(false);

  // Record test result
  const [testPassed, setTestPassed] = useState<"" | "passed" | "failed">("");
  const [testNote, setTestNote] = useState("");
  const [testEvidence, setTestEvidence] = useState("");

  // Reconcile (records whose outcome is unknown)
  const [observedValue, setObservedValue] = useState("");
  const [recNote, setRecNote] = useState("");
  const [recEvidence, setRecEvidence] = useState("");

  const loadPreflight = () => {
    api.getExecutionPreflight(changeId)
      .then((p) => { setPreflight(p); setPreflightError(null); })
      .catch((e) => setPreflightError(saveErrorMessage(e, "Could not ask the delivery gate.")));
  };
  useEffect(loadPreflight, [changeId, approvalStatus, execution?.writeState, execution?.testState]);

  const writeState = execution?.writeState ?? "ready";
  const testState = execution?.testState ?? "ready";
  const writeUnknown = writeState === "unknown";
  const testUnknown = testState === "unknown";
  const approved = approvalStatus === "approved";
  const deliverable = exactChange?.capabilityExecutable !== false;
  const canRecord = info.has("product_manager");
  const applied = nonEmpty<RecordedApplied>(execution?.applied);
  const verification = nonEmpty<RecordedVerification>(execution?.verification);
  const orchestration = exactChange?.testOrchestration?.trim();

  async function act(fn: () => Promise<string>, fallback: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      setMessage(await fn());
      onChanged();
    } catch (e) {
      setError(saveErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function recordApplied() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const r = await api.recordApplied(changeId, {
        evidenceReference: appliedEvidence.trim(), note: appliedNote.trim(),
        ...(needsStated ? { statedValue: statedValue.trim() } : {}),
      });
      setMessage(`Recorded as applied in DEV: ${r.observedValue} (${r.source}). Evidence: ${r.evidenceReference}. ` +
        "Added to the story's evidence chain.");
      setAppliedEvidence(""); setAppliedNote(""); setStatedValue(""); setNeedsStated(false);
      onChanged();
    } catch (e) {
      const detail = e instanceof HttpError ? e.detail : "";
      if (/cannot read the value back live/i.test(detail)) setNeedsStated(true);
      setError(saveErrorMessage(e, "Nothing was recorded."));
    } finally {
      setBusy(false);
    }
  }

  const statedMissing = needsStated && (!statedValue.trim() || !appliedEvidence.trim());

  // A configuration change set is recorded item by item.
  const changeSet = isChangeSet(exactChange);
  const items = exactChange?.items ?? [];
  const pending = items.filter((i) => !i.applied);
  const [itemId, setItemId] = useState<string>("");
  const current: ConfigurationItem | undefined = items.find((i) => i.id === itemId && !i.applied) ?? pending[0];
  const [statedValues, setStatedValues] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const versionItem = !!current && current.kind.startsWith("version_data_");
  const rowItem = !!current && (current.kind === "udc_value" || current.kind === "setup_row");
  const itemStatedMissing = !!current && (
    (versionItem && (!confirmed || !appliedEvidence.trim())) ||
    (needsStated && rowItem && (!appliedEvidence.trim() || Object.keys(current.values).some((f) => !(statedValues[f] ?? "").trim()))) ||
    (needsStated && current.kind === "processing_option" && (!statedValue.trim() || !appliedEvidence.trim())));

  async function recordItem() {
    if (!current) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const r = await api.recordApplied(changeId, {
        itemId: current.id, evidenceReference: appliedEvidence.trim(), note: appliedNote.trim(),
        ...(needsStated && rowItem ? { statedValues } : {}),
        ...(needsStated && current.kind === "processing_option" ? { statedValue: statedValue.trim() } : {}),
        ...(versionItem ? { confirmedAsSpecified: confirmed } : {}),
      });
      setMessage(`${r.itemId ?? current.id} recorded as applied in DEV (${r.source}). ` +
        (r.outcome === "applied" ? "Every item is now recorded: the change is applied." : `${r.remaining ?? ""} item(s) remain.`) +
        " Added to the story's evidence chain.");
      setAppliedEvidence(""); setAppliedNote(""); setStatedValue(""); setStatedValues({}); setConfirmed(false);
      setNeedsStated(false); setItemId("");
      onChanged();
    } catch (e) {
      const detail = e instanceof HttpError ? e.detail : "";
      if (/cannot read .* back live/i.test(detail)) setNeedsStated(true);
      setError(saveErrorMessage(e, "Nothing was recorded."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: "0 0 8px" }}>Delivery in DEV</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        JADE never writes to JD Edwards. Apply exactly the approved {changeSet ? "configuration" : "value"} in DEV yourself, then record it here{changeSet ? ", item by item" : ""}: JADE reads
        it back live through the customer's JD Edwards connection and records it only if it is exactly what was approved.
      </p>
      <dl className="facts">
        <dt>Change applied</dt><dd><StateBadge state={writeState} /></dd>
        <dt>Test</dt><dd><StateBadge state={testState} />{verification && <> <span className={`badge ${verification.passed ? "ok" : "stop"}`}>{verification.passed ? "passed" : "failed"}</span></>}</dd>
        {execution?.beforeValue != null && (<><dt>Value before</dt><dd className="mono">{execution.beforeValue}</dd></>)}
        {changeSet && (<><dt>Items recorded</dt><dd>{items.length - pending.length} of {items.length}</dd></>)}
        {exactChange && !changeSet && (<><dt>Approved value</dt><dd className="mono">{exactChange.application} / {exactChange.version} / option {exactChange.option} = <strong>{exactChange.proposedValue}</strong></dd></>)}
      </dl>

      {changeSet && showItems && <ConfigurationItemsTable items={items} />}

      {applied && !changeSet && (
        <div style={{ marginTop: 12 }}>
          <strong>Recorded as applied</strong>
          <AppliedFacts applied={applied} />
        </div>
      )}
      {verification && (
        <div style={{ marginTop: 12 }}>
          <strong>Recorded test</strong>
          <VerificationFacts verification={verification} />
        </div>
      )}

      {approved && !deliverable && (
        <div className="callout" style={{ marginTop: 12, borderColor: "var(--warn)" }}>
          <strong>Not deliverable</strong>
          This kind of change is Restricted or Suspended in the capability catalogue, so it is not delivered.
        </div>
      )}

      {/* ------------ Record applied in DEV ------------ */}
      {approved && deliverable && changeSet && writeState !== "applied" && !writeUnknown && current && (
        canRecord ? (
          <div className="callout" style={{ marginTop: 12 }}>
            <strong>Record the next item as applied in DEV</strong>
            Apply the items in order. After you have applied an item in DEV, record it: JADE re-checks the approval and
            scope and reads it back live where the customer's approved reads allow.
            <div className="stack" style={{ marginTop: 8 }}>
              <div className="field">
                <label htmlFor={`item-${changeId}`}>Item</label>
                <select id={`item-${changeId}`} value={current.id} onChange={(e) => { setItemId(e.target.value); setNeedsStated(false); setStatedValues({}); setConfirmed(false); }}>
                  {pending.map((i) => <option key={i.id} value={i.id}>{i.id} — {i.label}</option>)}
                </select>
                <span className="hint">{kindLabel(current.kind)}: <span className="mono">{approvedLine(current)}</span>{current.purpose ? ` — ${current.purpose}` : ""}</span>
              </div>
              {needsStated && rowItem && Object.keys(current.values).map((f) => (
                <div className="field" key={f}>
                  <label htmlFor={`stated-${changeId}-${f}`}>Value of <span className="mono">{f}</span> you read in JDE</label>
                  <input id={`stated-${changeId}-${f}`} type="text" value={statedValues[f] ?? ""}
                    onChange={(e) => setStatedValues({ ...statedValues, [f]: e.target.value })} />
                </div>
              ))}
              {needsStated && current.kind === "processing_option" && (
                <div className="field">
                  <label htmlFor={`stated-${changeId}`}>Value you read in JDE after applying it</label>
                  <input id={`stated-${changeId}`} type="text" value={statedValue} onChange={(e) => setStatedValue(e.target.value)} />
                </div>
              )}
              {needsStated && <span className="hint">JADE cannot read this item live right now, so it is recorded as stated by you — never as a live read.</span>}
              {versionItem && (
                <label style={{ fontWeight: 400 }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{" "}
                  I entered the {current.kind === "version_data_selection" ? "data selection" : "data sequencing"} of{" "}
                  {current.application} version {current.version} exactly as specified. (JD Edwards does not expose it through AIS, so it is recorded as stated.)
                </label>
              )}
              <div className="field">
                <label htmlFor={`applied-evidence-${changeId}`}>
                  Evidence reference <span className="hint">({needsStated || versionItem ? "required: " : "optional when JADE can read it live: "}screenshot, ticket or export)</span>
                </label>
                <input id={`applied-evidence-${changeId}`} type="text" value={appliedEvidence} onChange={(e) => setAppliedEvidence(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`applied-note-${changeId}`}>Note <span className="hint">(optional)</span></label>
                <textarea id={`applied-note-${changeId}`} value={appliedNote} onChange={(e) => setAppliedNote(e.target.value)} />
              </div>
              <div className="btnrow">
                <button className="btn primary" disabled={busy || itemStatedMissing} onClick={recordItem}>
                  {busy ? "Recording…" : `Record ${current.id} applied in DEV`}
                </button>
              </div>
            </div>
          </div>
        ) : <p className="hint">Waiting for the Application Manager to apply the configuration in DEV and record each item.</p>
      )}

      {approved && deliverable && !changeSet && writeState === "ready" && (
        canRecord ? (
          <div className="callout" style={{ marginTop: 12 }}>
            <strong>Record the change as applied in DEV</strong>
            After you have set {exactChange ? <><span className="mono">{exactChange.option}</span> to <span className="mono">{exactChange.proposedValue}</span> in {exactChange.application} version {exactChange.version}</> : "the approved value"}{" "}
            in DEV, record it. JADE re-checks the approval and scope and reads the value back live.
            <div className="stack" style={{ marginTop: 8 }}>
              {needsStated && (
                <div className="field">
                  <label htmlFor={`stated-${changeId}`}>Value you read in JDE after applying it</label>
                  <input id={`stated-${changeId}`} type="text" value={statedValue} onChange={(e) => setStatedValue(e.target.value)} />
                  <span className="hint">JADE cannot read it live right now, so it is recorded as stated by you — never as a live read.</span>
                </div>
              )}
              <div className="field">
                <label htmlFor={`applied-evidence-${changeId}`}>
                  Evidence reference <span className="hint">({needsStated ? "required: " : "optional when JADE can read it live: "}screenshot, ticket or export)</span>
                </label>
                <input id={`applied-evidence-${changeId}`} type="text" value={appliedEvidence} onChange={(e) => setAppliedEvidence(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`applied-note-${changeId}`}>Note <span className="hint">(optional)</span></label>
                <textarea id={`applied-note-${changeId}`} value={appliedNote} onChange={(e) => setAppliedNote(e.target.value)} />
              </div>
              <div className="btnrow">
                <button className="btn primary" disabled={busy || statedMissing} onClick={recordApplied}>
                  {busy ? "Recording…" : needsStated ? "Record the value I read" : "Record applied in DEV"}
                </button>
              </div>
            </div>
          </div>
        ) : <p className="hint">Waiting for the Application Manager to apply the change in DEV and record it.</p>
      )}

      {/* ------------ Test ------------ */}
      {approved && writeState === "applied" && testState === "ready" && (
        canRecord ? (
          <div className="callout" style={{ marginTop: 12 }}>
            <strong>Test the change in DEV</strong>
            {orchestration
              ? <>Run the approved test orchestration <span className="mono">{orchestration}</span> live, or test it yourself and record the result.</>
              : "No test orchestration is approved for this change: test it in DEV against the acceptance criteria and record the result."}
            {orchestration && (
              <div className="btnrow" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={busy} onClick={() => act(async () => {
                  const r = await api.runDeliveryTest(changeId);
                  return `Test orchestration ${r.orchestration ?? orchestration} ran live and answered; recorded as ${r.passed ? "passed" : "failed"} and added to the evidence chain.`;
                }, "The test could not be run.")}>{busy ? "Running…" : "Run approved test"}</button>
              </div>
            )}
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="field">
                <span style={{ display: "block", fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Result</span>
                <label style={{ display: "inline", fontWeight: 400, marginRight: 16 }}>
                  <input type="radio" name={`test-${changeId}`} checked={testPassed === "passed"} onChange={() => setTestPassed("passed")} /> Passed
                </label>
                <label style={{ display: "inline", fontWeight: 400 }}>
                  <input type="radio" name={`test-${changeId}`} checked={testPassed === "failed"} onChange={() => setTestPassed("failed")} /> Failed
                </label>
              </div>
              <div className="field">
                <label htmlFor={`test-note-${changeId}`}>What was tested, against which acceptance criteria</label>
                <textarea id={`test-note-${changeId}`} value={testNote} onChange={(e) => setTestNote(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`test-evidence-${changeId}`}>Evidence reference <span className="hint">(screenshot, ticket or export)</span></label>
                <input id={`test-evidence-${changeId}`} type="text" value={testEvidence} onChange={(e) => setTestEvidence(e.target.value)} />
              </div>
              <div className="btnrow">
                <button className="btn" disabled={busy || !testPassed || !testNote.trim() || !testEvidence.trim()}
                  onClick={() => act(async () => {
                    const r = await api.recordTestResult(changeId, { passed: testPassed === "passed", note: testNote.trim(), evidenceReference: testEvidence.trim() });
                    setTestPassed(""); setTestNote(""); setTestEvidence("");
                    return `Test result recorded: ${r.passed ? "passed" : "failed"}. Added to the evidence chain.`;
                  }, "The test result was not recorded.")}>Record test result</button>
              </div>
            </div>
          </div>
        ) : <p className="hint">Waiting for the Application Manager to test the change and record the result.</p>
      )}

      {/* ------------ Reconcile an unknown outcome ------------ */}
      {(writeUnknown || testUnknown) && (
        <div className="callout" style={{ borderColor: "var(--stop)", marginTop: 12 }}>
          <strong>{writeUnknown ? "It is not known whether the change is in DEV" : "It is not known whether the test ran"}</strong>
          Nothing more is recorded for this change until someone with approval authority checks the actual state in JDE.
          {writeUnknown && " JADE reads the value live where it can; otherwise enter the value you read in JDE."}
          <div className="stack" style={{ marginTop: 8 }}>
            {writeUnknown && (
              <div className="field">
                <label htmlFor={`observed-${changeId}`}>Value in JDE now <span className="hint">(needed when JADE cannot read it live)</span></label>
                <input id={`observed-${changeId}`} type="text" value={observedValue} onChange={(e) => setObservedValue(e.target.value)} />
              </div>
            )}
            <div className="field">
              <label htmlFor={`recnote-${changeId}`}>What you checked</label>
              <textarea id={`recnote-${changeId}`} value={recNote} onChange={(e) => setRecNote(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`recevidence-${changeId}`}>
                Evidence reference <span className="hint">(where this can be checked: screenshot, ticket or export)</span>
              </label>
              <input id={`recevidence-${changeId}`} type="text" value={recEvidence} onChange={(e) => setRecEvidence(e.target.value)} />
            </div>
            <div className="btnrow">
              {writeUnknown && (
                <button className="btn primary" disabled={busy || !recNote.trim() || !recEvidence.trim()} onClick={() => act(async () => {
                  const r = await api.reconcileExecution(changeId, {
                    ...(observedValue.trim() ? { observedValue: observedValue.trim() } : {}), note: recNote.trim(), evidenceReference: recEvidence.trim(),
                  });
                  return `Reconciled: ${r.outcome.replace("_", " ")} (value ${r.observedValue}, ${r.source}). Recorded with your name and added to the evidence chain.`;
                }, "Could not reconcile.")}>Reconcile</button>
              )}
              {!writeUnknown && testUnknown && (
                <>
                  <button className="btn" disabled={busy || !recNote.trim() || !recEvidence.trim()} onClick={() => act(async () => {
                    const r = await api.reconcileTestRun(changeId, { ran: true, note: recNote.trim(), evidenceReference: recEvidence.trim() });
                    return `Test run reconciled as ${r.outcome.replace("_", " ")}; recorded and added to the evidence chain.`;
                  }, "Could not reconcile the test run.")}>It ran</button>
                  <button className="btn" disabled={busy || !recNote.trim() || !recEvidence.trim()} onClick={() => act(async () => {
                    const r = await api.reconcileTestRun(changeId, { ran: false, note: recNote.trim(), evidenceReference: recEvidence.trim() });
                    return `Test run reconciled as ${r.outcome.replace("_", " ")}; recorded and added to the evidence chain.`;
                  }, "Could not reconcile the test run.")}>It did not run</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {writeState === "diverged" && (
        <div className="callout" style={{ borderColor: "var(--stop)", marginTop: 12 }}>
          <strong>This change cannot continue</strong>
          The value in DEV is neither the value before the change nor the approved value. Investigate in JDE, then propose a new change.
        </div>
      )}
      {message && <div className="callout" role="status" style={{ marginTop: 12 }}><strong>Recorded</strong>{message}</div>}
      {error && (
        <div className="callout" role="alert" style={{ borderColor: "var(--stop)", marginTop: 12 }}>
          <strong>Not recorded</strong>{error}
        </div>
      )}

      <ReconciliationLog title="Reconciliations of the change" rows={execution?.writeReconciliations ?? []} write />
      <ReconciliationLog title="Reconciliations of the test run" rows={execution?.testReconciliations ?? []} write={false} />

      <div style={{ marginTop: 12 }}>
        <strong>Would the delivery gate accept this change being recorded now?</strong>{" "}
        {preflight && (
          <span className={`badge ${preflight.executable ? "ok" : "stop"}`}>
            {preflight.executable ? "Yes" : "No"}
          </span>
        )}
        {preflightError && <div className="notstated">{preflightError}</div>}
        {preflight && (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5 }}>
            {preflight.checks.filter((c) => !compact || !c.ok).map((c) => (
              <li key={c.check}>
                <span style={{ color: c.ok ? "var(--ok)" : "var(--stop)" }}>{c.ok ? "✓" : "✗"}</span> {c.check}
                {!c.ok && c.detail && <div className="hint">{c.detail}</div>}
              </li>
            ))}
          </ul>
        )}
        {compact && preflight && <details className="vr-detail"><summary>{preflight.checks.filter((c) => c.ok).length} checks passed · view details</summary><ul>{preflight.checks.filter((c) => c.ok).map((c) => <li key={c.check}>✓ {c.check}</li>)}</ul></details>}
        <div className="hint" style={{ marginTop: 6 }}>
          The gate re-runs every check above at the moment a step is recorded.
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
