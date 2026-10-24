/**
 * Shared components of the usability redesign (step 1): the same pieces on
 * every screen that shows a story's work.
 *
 *   WhatNeedsToHappen  -- at most five lines: who does what, with the control
 *                         where it can be done right there.
 *   IssueList          -- every open point with its owner, what it affects,
 *                         and how it is resolved (answer / decide / set up).
 *   ResultSummary      -- what JADE concluded: one-sentence conclusion, the
 *                         changes as before -> after with each value marked
 *                         verified, not yet verified or proposed, and the
 *                         uncertainty that could change the decision.
 *
 * Everything here reads the canonical lifecycle (services/lifecycle.py on the
 * backend). Recording an answer never changes the story or the design by
 * itself: the next Architect run uses it.
 */
import { useState, type ReactNode } from "react";
import { api } from "../services/api";
import type { Change, CompanyRole, Issue, Lifecycle, ValueStatus, WorkLine } from "../types/domain";
import { Link, storyPath } from "../router";
import { ErrorState, Tag, useSessionInfo } from "./design";

const KIND_LABEL: Record<Issue["kind"], string> = {
  business: "Question", decision: "Decision", setup: "Setup", delivery: "Delivery", jade: "JADE",
};
const KIND_TONE: Record<Issue["kind"], "brand" | "info" | "warn" | "stop" | "neutral" | "ai"> = {
  business: "brand", decision: "info", setup: "warn", delivery: "stop", jade: "ai",
};

/** Who may record an answer or resolution (the backend checks it again). */
export function canResolve(issue: Issue, has: (...r: CompanyRole[]) => boolean): boolean {
  if (issue.kind === "jade" || issue.source === "delivery_gate") return false;
  if (has("product_manager", "admin")) return true;
  return issue.owner !== "jade" && issue.owner !== "none" && has(issue.owner as CompanyRole);
}

/* ------------------------------------------------------------------ */
/* What needs to happen                                                 */
/* ------------------------------------------------------------------ */

export function WhatNeedsToHappen({ lifecycle, changeId, controls, title = "What needs to happen", skipPrimary, limit, listedKinds }: {
  lifecycle?: Lifecycle | null;
  changeId: string;
  /** The control for the primary line (the next action's own button), if the caller has one. */
  controls?: ReactNode;
  title?: string;
  /** When the caller already shows the next action itself (the decision card). */
  skipPrimary?: boolean;
  /** Show at most this many lines; the rest open on request (blocking lines first). */
  limit?: number;
  /** Open points of these kinds are listed on the same screen ("all": every kind): not repeated here. */
  listedKinds?: string[] | "all";
}) {
  const [all, setAll] = useState(false);
  const listed = (l: WorkLine) => !!l.issueId && (listedKinds === "all" || (!!listedKinds && listedKinds.includes(l.issueKind ?? "")));
  const lines = (lifecycle?.whatNext ?? []).filter((l) => !(skipPrimary && l.primary) && !listed(l));
  if (lines.length === 0) return null;
  const ordered = limit ? [...lines].sort((a, b) => Number(!!b.primary) - Number(!!a.primary) || Number(!!b.blocking) - Number(!!a.blocking)) : lines;
  const shown = limit && !all ? ordered.slice(0, limit) : ordered;
  const hidden = ordered.length - shown.length;
  return (
    <section className="wnh" aria-label={title}>
      <h3 className="wnh-title">{title}</h3>
      <ol className="wnh-list">
        {shown.map((l, i) => <WorkLineRow key={i} line={l} changeId={changeId} controls={l.primary ? controls : undefined} />)}
      </ol>
      {hidden > 0 && <button className="linkbtn" onClick={() => setAll(true)}>{hidden} more…</button>}
    </section>
  );
}

function WorkLineRow({ line, changeId, controls }: { line: WorkLine; changeId: string; controls?: ReactNode }) {
  const jade = line.owner === "jade";
  return (
    <li className={`wnh-line${line.primary ? " primary" : ""}${line.blocking ? " blocking" : ""}${jade ? " jade" : ""}`}>
      <span className="wnh-who">{line.who || "—"}</span>
      <span className="wnh-text">
        {line.blocking && <span className="sr-only">Blocking: </span>}
        {line.text}
      </span>
      <span className="wnh-act">
        {controls ?? (!line.primary && line.action && ["answer_issue", "decide_issue"].includes(line.action) && (
          <Link to={storyPath(changeId, line.tab, "open-points")} className="btn small">Open</Link>
        ))}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Issues                                                               */
/* ------------------------------------------------------------------ */

/** Repair brief P2: one labelled count of open points, the same wherever it is shown -- what needs people
 * and what JADE investigates itself are counted apart, never mixed into one unexplained number. */
export function openLabel(open: Issue[]): string {
  const jade = open.filter((i) => i.kind === "jade").length;
  const people = open.length - jade;
  return [people ? `${people} for people` : "", jade ? `${jade} for JADE to investigate` : ""].filter(Boolean).join(" · ") || "none open";
}

export function IssueList({ change, onChange, kinds, title = "Open points", empty, id = "open-points", skipNextAction }: {
  change: Change;
  onChange: (c: Change) => void;
  /** Only these kinds (e.g. the business questions on the business view). */
  kinds?: Issue["kind"][];
  title?: string;
  empty?: ReactNode;
  id?: string;
  /** The next-step card above already states the open point that is the next action: not repeated here. */
  skipNextAction?: boolean;
}) {
  const na = change.lifecycle?.nextAction;
  const isNextAction = (i: Issue) => !!skipNextAction && !!na && na.summary.includes(i.title.replace(/[ .]+$/, ""));
  // An expired or invalidated authorisation is shown as the decision itself, not again as an open point.
  const shownAsDecision = (i: Issue) => !!change.lifecycle?.authorisation?.renewable && i.source === "delivery_gate" && i.actionId === "approve_exact_change";
  const all = (change.lifecycle?.issues ?? []).filter((i) => (!kinds || kinds.includes(i.kind)) && !shownAsDecision(i));
  const open = all.filter((i) => !i.resolution);
  const resolved = all.filter((i) => i.resolution);
  const sorted = [...open].sort((a, b) => Number(b.blocks) - Number(a.blocks) || Number(a.kind === "jade") - Number(b.kind === "jade"));
  if (all.length === 0) return empty ? <section className="issues" id={id}><h3 className="issues-title">{title}</h3><p className="muted">{empty}</p></section> : null;
  return (
    <section className="issues" id={id} aria-label={title}>
      <h3 className="issues-title">{title}{open.length > 0 && <span className="issues-count">{openLabel(open)}</span>}</h3>
      {sorted.length === 0 && <p className="muted">Every open point is answered or resolved.</p>}
      <ul className="issue-list">
        {sorted.map((i) => <IssueRow key={i.id} issue={i} change={change} onChange={onChange} statedAbove={isNextAction(i)} />)}
      </ul>
      {resolved.length > 0 && (
        <details className="issues-resolved" open={resolved.some((i) => Date.now() - Date.parse(i.resolution!.at) < 15 * 60 * 1000)}>
          <summary>{resolved.length} answered or resolved</summary>
          <ul className="issue-list">
            {resolved.map((i) => <IssueRow key={i.id} issue={i} change={change} onChange={onChange} />)}
          </ul>
        </details>
      )}
      {all.some((i) => i.source === "design_evidence") && (
        <p className="hint issues-note">Some points come from an earlier design and were sorted by owner by JADE.
          Running the Architect again gives them in its own words.</p>
      )}
    </section>
  );
}

export function IssueRow({ issue, change, onChange, statedAbove, startOpen = false, hideTitle = false }: { issue: Issue; change: Change; onChange: (c: Change) => void; statedAbove?: boolean;
  /** Repair brief P3: opened from the decision card, the answer form is shown at once. */
  startOpen?: boolean;
  /** On the decision card the question is the card's own heading: not repeated. */
  hideTitle?: boolean }) {
  const info = useSessionInfo();
  const [answer, setAnswer] = useState("");
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState("");
  const resolvable = canResolve(issue, info.has);

  async function record(status: "answered" | "resolved" | "reopened") {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const updated = await api.resolveIssue(change.id, issue.id, { status, answer: status === "answered" ? answer : "" });
      setDone(status === "reopened" ? "Reopened." : status === "answered"
        ? "Answer recorded. JADE uses it when the Architect runs again." : "Marked as resolved.");
      setOpen(false); setAnswer("");
      onChange(updated);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  const r = issue.resolution;
  const fieldId = `ans-${issue.id}`;
  return (
    <li className={`issue k-${issue.kind}${issue.blocks && !r ? " blocks" : ""}${r ? " resolved" : ""}`}>
      <div className="issue-head">
        <Tag tone={KIND_TONE[issue.kind]}>{KIND_LABEL[issue.kind]}</Tag>
        <span className="issue-owner">{issue.ownerLabel}</span>
        {issue.blocks && !r && <Tag tone="stop">Blocks progress</Tag>}
      </div>
      {/* Already the next step at the top of the page: its actions stay here, its text is not repeated. */}
      {!hideTitle && <div className="issue-title">{statedAbove && !r ? <span className="muted">The next step above</span> : issue.title}</div>}
      {issue.consequence && !statedAbove && <div className="issue-consequence">{issue.consequence}</div>}
      {(issue.options?.length ?? 0) > 1 && !r && !statedAbove && (
        <div className="issue-options"><strong>Options</strong>
          <ul>{issue.options!.map((o) => <li key={o}>{o}{resolvable && <> <button className="linkbtn" disabled={busy}
            onClick={() => { setAnswer(o); setOpen(true); }}>Choose</button></>}</li>)}</ul>
        </div>
      )}
      {issue.proposedAnswer && !r && <div className="issue-proposal"><strong>JADE recommends: </strong>{issue.proposedAnswer}</div>}
      {issue.kind === "jade" && <div className="issue-note">{issue.returned ? `JADE investigates this in DEV when the Architect runs again; nobody is asked.${issue.blocks ? " Until then it blocks authorisation." : ""}` : "JADE handles this itself; nobody needs to act."}</div>}
      {issue.source === "delivery_gate" && !statedAbove && <div className="issue-note">{issue.action} This clears by itself once the cause is fixed.</div>}
      {r && (
        <div className="issue-answer">
          <strong>{r.status === "answered" ? "Answer" : "Resolved"}</strong>
          {r.answer && <>: {r.answer}</>} <span className="muted">— {r.by}, {new Date(r.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
          {r.status === "answered" && <div className="hint">JADE uses this answer when the Architect runs again; it does not change the design by itself.</div>}
          {resolvable && <button className="linkbtn" disabled={busy} onClick={() => record("reopened")}>Reopen</button>}
        </div>
      )}
      {!r && resolvable && (issue.kind === "business" || issue.kind === "decision") && (
        open ? (
          <div className="issue-form">
            <label htmlFor={fieldId} className="sr-only">Your answer</label>
            <textarea id={fieldId} rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)}
                      placeholder={issue.kind === "decision" ? "Your decision, in a sentence" : "Your answer, in a sentence"} />
            <div className="btnrow">
              <button className="btn primary small" disabled={busy || !answer.trim()} onClick={() => record("answered")}>
                {busy ? "Recording…" : "Record answer"}</button>
              {issue.proposedAnswer && <button className="btn small" disabled={busy} onClick={() => setAnswer(issue.proposedAnswer)}>Use JADE's recommendation</button>}
              <button className="btn small quiet" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="btnrow issue-actions">
            <button className="btn small" onClick={() => setOpen(true)}>{issue.kind === "decision" ? "Decide" : "Answer"}</button>
          </div>
        )
      )}
      {!r && resolvable && issue.kind === "setup" && issue.source !== "delivery_gate" && (
        <div className="btnrow issue-actions">
          {info.has("admin") && <Link className="btn small" to="/admin/setup-list">Open the setup list</Link>}
          <button className="btn small" disabled={busy} onClick={() => record("resolved")}>{busy ? "Recording…" : "Mark as fixed"}</button>
        </div>
      )}
      {done && <div className="issue-done" role="status">{done}</div>}
      {error !== null && <ErrorState error={error} title="Not recorded" />}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* What JADE concluded                                                  */
/* ------------------------------------------------------------------ */

const VALUE_LABEL: Record<ValueStatus, string> = { verified: "Verified in DEV", not_yet_verified: "Not yet verified", proposed: "Proposed" };
const VALUE_TONE: Record<ValueStatus, "ok" | "warn" | "neutral"> = { verified: "ok", not_yet_verified: "warn", proposed: "neutral" };

export function ValueStatusTag({ status }: { status: ValueStatus }) {
  return <Tag tone={VALUE_TONE[status]}>{VALUE_LABEL[status]}</Tag>;
}

export function ResultSummary({ change, title = "JADE's conclusion", hideConclusion = false }: {
  change: Change; title?: string;
  /** When the decision card above already states the conclusion. */
  hideConclusion?: boolean;
}) {
  const r = change.architectDecision?.result;
  if (!r && !change.architectDecision) return null;
  const conclusion = hideConclusion ? "" : r?.conclusion || change.architectDecision?.existingFunctionalityFound || "";
  const changes = r?.changes ?? [];
  return (
    <section className="result" aria-label={title}>
      <h3 className="result-title">{hideConclusion ? "The change in detail" : title}</h3>
      {conclusion && <p className="result-conclusion">{conclusion}</p>}
      {changes.length > 0 && (
        <table className="beforeafter">
          <caption className="sr-only">Changes, before and after</caption>
          <thead><tr><th scope="col">What changes</th><th scope="col">Now</th><th scope="col" aria-label="becomes"></th><th scope="col">After</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {changes.map((c, i) => (
              <tr key={i}>
                <td>{c.what}</td>
                <td className="mono">{c.current || <span className="notstated">{c.status === "verified" ? "empty" : "not read"}</span>}</td>
                <td aria-hidden="true" className="ba-arrow">→</td>
                <td className="mono strong">{c.targetKnown === false ? <span className="notstated">not known yet</span> : c.proposed || <span className="notstated">to be defined</span>}</td>
                <td>{c.status === "verified"
                  ? <><Tag tone="ok">Now: verified in DEV</Tag>{c.targetKnown === false && <> <Tag tone="warn">Target unknown</Tag></>}</>
                  : <ValueStatusTag status={c.status} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r && r.uncertainty.length > 0 && (
        <div className="result-uncertainty">
          <strong>What JADE could not verify</strong>
          <ul>{r.uncertainty.map((u, i) => <li key={i}>{u}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Acceptance criteria: a requirement, not a result                     */
/* ------------------------------------------------------------------ */

/**
 * The acceptance criteria with what is actually known about them: proposed by
 * JADE, confirmed by a person (the Domain Owner's story approval), and whether a
 * test result has been recorded. A criterion is never marked as passed unless a
 * passing test is recorded; the recorded test covers the change as a whole.
 */
export function AcceptanceList({ change }: { change: Change }) {
  const acs = change.userStory?.acceptanceCriteria ?? [];
  if (acs.length === 0) return null;
  const ap = change.storyApproval;
  const confirmed = ap?.status === "approved";
  const v = change.lifecycle?.deliverySteps.find((s) => s.id === "validation");
  const test = v?.state === "done" ? "passed" : v?.state === "failed" ? "failed" : change.testResult && change.testResult.outcome !== "not run"
    ? (change.testResult.outcome === "pass" ? "passed" : "failed") : null;
  return (
    <>
      <p className="acstatus">
        <span className={`tag ${confirmed ? "info" : ""}`}>{confirmed ? `Approved with the story by ${ap!.approvedBy}` : "Proposed by JADE; approved with the story"}</span>{" "}
        <span className={`tag ${test === "passed" ? "ok" : test === "failed" ? "stop" : ""}`}>
          {test === "passed" ? "Test recorded: passed" : test === "failed" ? "Test recorded: did not pass" : "Not tested yet"}</span>
        <span className="muted explain"> Acceptance criteria are requirements. A test result is shown only once a test is recorded, and it covers the change as a whole.</span>
      </p>
      {/* No internal ids on business screens (register M3). */}
      <ol className="aclist">{acs.map((a) => <li key={a.id}>{a.text}</li>)}</ol>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Role-home measures                                                   */
/* ------------------------------------------------------------------ */

export interface Metric { value: string | number; label: string; to?: string; definition: string }

/** A small row of measures, each with its definition (shown with "?"). Never an oversized card stack. */
export function MetricStrip({ items, label }: { items: Metric[]; label: string }) {
  return (
    <dl className="metricstrip" aria-label={label}>
      {items.map((m) => (
        <div key={m.label} className="metric" title={m.definition}>
          <dt>{m.to ? <Link to={m.to}>{m.label}</Link> : m.label}</dt>
          <dd>{m.value}</dd>
          <dd className="metric-def explain">{m.definition}</dd>
        </div>
      ))}
    </dl>
  );
}
