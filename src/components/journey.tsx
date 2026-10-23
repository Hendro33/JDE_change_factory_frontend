/**
 * Components of the reference journey (usability redesign, step 2), used by
 * both the business view and the application view of a change:
 *
 *   WorkItemsList    -- who does what in delivery, in order: agents, people,
 *                       named implementers, CNC, the business, the release.
 *   OutcomeCardView  -- what changed, what was verified, what the business
 *                       does now, with the three outcomes kept apart; the
 *                       Domain Owner accepts the outcome here.
 *   ProcessSwimlane  -- the current and proposed process as swimlanes, the
 *                       steps this change touches highlighted, unconfirmed
 *                       steps marked, linked to acceptance criteria.
 *   JadeAtWorkLine   -- what JADE is doing right now.
 *
 * Status is always carried by words and an icon, never by colour alone.
 */
import { useMemo, useState, type ReactNode } from "react";
import { deliveryApi } from "../services/deliveryApi";
import type { StoryProcessView, MapContent, MapStep, MapVersion } from "../services/processApi";
import type { AcceptanceCriterion, Change, Lifecycle, OutcomeCard, WorkItem, WorkOwnerKind, WorkState } from "../types/domain";
import { ErrorState, formatDateTime, useSessionInfo } from "./design";
import { layers } from "./ProcessMapDiagram";
import { Link, storyPath } from "../router";

/* ------------------------------------------------------------------ */
/* Work items                                                           */
/* ------------------------------------------------------------------ */

const STATE_WORD: Record<WorkState, string> = {
  todo: "To do", in_progress: "In progress", done: "Done", failed: "Needs attention", blocked: "Waiting", not_needed: "Not needed",
};
const STATE_ICON: Record<WorkState, string> = { todo: "○", in_progress: "◐", done: "✓", failed: "!", blocked: "■", not_needed: "–" };
const OWNER_WORD: Record<WorkOwnerKind, string> = {
  agent: "JADE agent", person: "Person", implementer: "Named implementer", cnc: "CNC", business: "Business", release: "Release",
  jade: "JADE",
};
const GROUP_WORD: Record<WorkItem["group"], string> = {
  configuration: "Configuration in JD Edwards", development: "Development package", handoff: "Work by a named implementer",
  verification: "Verification in DEV", acceptance: "Business acceptance", release: "Release hand-over",
};
const GROUP_ORDER: WorkItem["group"][] = ["configuration", "development", "handoff", "verification", "acceptance", "release"];

export function WorkItemsList({ items, business, renderAction, title = "Who does what" }: {
  items: WorkItem[];
  /** The business view: one line per kind of work, without technical detail. */
  business?: boolean;
  renderAction?: (item: WorkItem) => ReactNode;
  title?: string;
}) {
  if (items.length === 0) return null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const groups = GROUP_ORDER.map((g) => ({ g, rows: items.filter((i) => i.group === g) })).filter((x) => x.rows.length);
  return (
    <section className="workitems" aria-label={title}>
      <h3 className="section-kicker">{title}</h3>
      {business ? (
        <ol className="workgroups">
          {groups.map(({ g, rows }) => {
            const done = rows.filter((r) => r.state === "done").length;
            const failed = rows.some((r) => r.state === "failed");
            const state: WorkState = done === rows.length ? "done" : failed ? "failed" : done > 0 || rows.some((r) => r.state === "in_progress") ? "in_progress" : "todo";
            const who = [...new Set(rows.map((r) => r.who))].join(", ");
            return (
              <li key={g} className={`workgroup s-${state}`}>
                <span className="wi-state"><span aria-hidden="true">{STATE_ICON[state]}</span> {STATE_WORD[state]}</span>
                <span className="wi-title">{GROUP_WORD[g]}{rows.length > 1 ? ` (${done} of ${rows.length})` : ""}</span>
                <span className="wi-who">{who}</span>
              </li>
            );
          })}
        </ol>
      ) : groups.map(({ g, rows }) => (
        <div key={g} className="workgroup-block">
          <div className="workgroup-label">{GROUP_WORD[g]}</div>
          <ol className="wi-list">
            {rows.map((w) => (
              <li key={w.id} className={`wi-row s-${w.state}`}>
                <span className="wi-state"><span aria-hidden="true">{STATE_ICON[w.state]}</span> {STATE_WORD[w.state]}</span>
                <span className="wi-main">
                  <span className="wi-title">{w.title}</span>
                  {(w.detail || w.evidenceReference) && (
                    <span className="wi-detail">{w.detail}{w.evidenceReference ? `${w.detail ? " · " : ""}evidence: ${w.evidenceReference}` : ""}</span>
                  )}
                  {w.dependsOn.length > 0 && w.state !== "done" && (
                    <span className="wi-after">After: {w.dependsOn.map((d) => byId.get(d)?.title ?? d).slice(0, 2).join("; ")}{w.dependsOn.length > 2 ? "…" : ""}</span>
                  )}
                </span>
                <span className="wi-who"><span className="wi-kind">{OWNER_WORD[w.ownerKind]}</span>{w.who}</span>
                <span className="wi-act">{renderAction?.(w)}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Outcome                                                              */
/* ------------------------------------------------------------------ */

function OutcomeStepView({ label, done, failed, by, at, waiting }: { label: string; done: boolean; failed?: boolean; by?: string; at?: string; waiting: string }) {
  return (
    <li className={`ostep${done ? " done" : failed ? " failed" : ""}`}>
      <span className="ostep-icon" aria-hidden="true">{done ? "✓" : failed ? "!" : "○"}</span>
      <span className="ostep-label">{label}</span>
      <span className="ostep-detail">{done ? `${by ? `${by}, ` : ""}${at ? formatDateTime(at) : ""}` : failed ? "Not accepted" : waiting}</span>
    </li>
  );
}

function summaryText(change: Change, card: OutcomeCard): string {
  const lines = [`${change.title} (${change.id})`, "", card.headline, ""];
  if (card.whatChanged.length) lines.push("What changed:", ...card.whatChanged.map((w) => `- ${w}`), "");
  if (card.verified.length) lines.push("What was verified:", ...card.verified.map((w) => `- ${w}`), "");
  lines.push(`Verified in DEV: ${card.devVerified.done ? "yes" : "not yet"}`,
    `Accepted by the business: ${card.businessAccepted.done ? `yes (${card.businessAccepted.by})` : "not yet"}`,
    `Handed over for release: ${card.released.done ? "yes" : "not yet"}`, "", card.whatToDoNow);
  if (card.jiraUrl) lines.push("", card.jiraUrl);
  return lines.join("\n");
}

const TECHNICAL_WORDS = /\b([PRFBN]\d{4,6}|[PRFBN]5[5-9]\w+|UDC|processing option|version [A-Z0-9]{4,}|AAI|UBE|business function|OMW|AIS|po:|data item)\b/i;

/** The outcome's "what changed" lines a business reader needs; technical lines stay in the application view. */
export function changedForBusiness(lines: string[]): string[] {
  return lines.filter((l) => !TECHNICAL_WORDS.test(l));
}

export function OutcomeCardView({ change, lifecycle, onChanged }: { change: Change; lifecycle: Lifecycle; onChanged: (c: Change) => void }) {
  const info = useSessionInfo();
  const card = lifecycle.outcomeCard;
  const [mode, setMode] = useState<"none" | "accept" | "reject">("none");
  const [note, setNote] = useState("");
  const [onBehalfOf, setOnBehalfOf] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  if (!card) return null;
  const owner = info.has("domain_owner");
  const recorder = info.has("product_manager", "admin");
  // A finished story never asks for an action that cannot be taken (audit F07).
  const finished = lifecycle.phase === "done";
  const askable = !finished && card.devVerified.done && !card.businessAccepted.done && !card.released.done
    && lifecycle.nextAction.action !== "record_handoff" && (owner || recorder);
  const needsName = !owner;

  async function record(decision: "accepted" | "not_accepted") {
    setBusy(true); setError(null);
    try {
      const updated = await deliveryApi.recordAcceptance(change.id, { decision, note, onBehalfOf: needsName ? onBehalfOf : "" });
      setMode("none"); setNote(""); onChanged(updated);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <section className={`outcome${card.released.done ? " complete" : ""}`} aria-label="Outcome" id="outcome">
      <div className="outcome-kicker">Outcome</div>
      <p className="outcome-headline">{card.headline}</p>
      <ol className="osteps" aria-label="Three outcomes">
        <OutcomeStepView label="Verified in DEV" done={card.devVerified.done} by={card.devVerified.by} at={card.devVerified.at} waiting={finished ? "Not recorded" : "Being verified"} />
        <OutcomeStepView label="Accepted by the business" done={card.businessAccepted.done} failed={!!card.notAccepted && !card.businessAccepted.done}
                         by={card.businessAccepted.by} at={card.businessAccepted.at} waiting={finished ? "Not recorded" : card.devVerified.done ? "Waiting for the business" : "After verification"} />
        <OutcomeStepView label="Handed over for release" done={card.released.done} by={card.released.by} at={card.released.at} waiting={finished ? "Not recorded" : "After acceptance"} />
      </ol>
      <div className="outcome-grid">
        {/* Business words only (register M3): technical lines stay in the application view. */}
        {changedForBusiness(card.whatChanged).length > 0 && <div><h4>What changed</h4><ul>{changedForBusiness(card.whatChanged).map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
        {card.verified.length > 0 && <div><h4>What was verified</h4><ul>{card.verified.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
        {(card.criteria?.length ?? 0) > 0 && <div><h4>Does it do what was asked?</h4><ul className="criteria-check">{card.criteria!.map((c, i) => (
          <li key={i}><span className={`status-word ${c.verified ? "ok" : ""}`}>{c.verified ? "✓" : "○"}</span> {c.text} <span className="muted">— {c.state}</span></li>))}</ul></div>}
      </div>
      {card.notAccepted && !card.businessAccepted.done && (
        <p className="outcome-refused"><strong>Not accepted</strong> by {card.notAccepted.by}: {card.notAccepted.detail}</p>
      )}
      <p className="outcome-now"><strong>What to do now: </strong>{card.whatToDoNow}</p>
      {card.released.done && card.released.detail && <p className="hint">{card.released.detail}.</p>}

      {askable && mode === "none" && (
        <div className="btnrow">
          <button className="btn primary" onClick={() => setMode("accept")}>Accept the outcome</button>
          <button className="btn" onClick={() => setMode("reject")}>It does not work for us</button>
        </div>
      )}
      {askable && mode !== "none" && (
        <div className="outcome-form">
          {needsName && (
            <div className="field">
              <label htmlFor="acc-who">On behalf of (the business person who {mode === "accept" ? "accepted" : "did not accept"} it)</label>
              <input id="acc-who" value={onBehalfOf} onChange={(e) => setOnBehalfOf(e.target.value)} placeholder="e.g. Ellen Vos, Order desk lead" />
            </div>
          )}
          <div className="field">
            <label htmlFor="acc-note">{mode === "accept" ? "Note (optional)" : "What does not work for the business?"}</label>
            <textarea id="acc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="btnrow">
            <button className={`btn ${mode === "accept" ? "primary" : "strong"}`} disabled={busy || (needsName && onBehalfOf.trim().length < 2) || (mode === "reject" && note.trim().length < 5)}
                    onClick={() => record(mode === "accept" ? "accepted" : "not_accepted")}>
              {busy ? "Recording…" : mode === "accept" ? "Accept the outcome" : "Record: not accepted"}</button>
            <button className="btn quiet" disabled={busy} onClick={() => setMode("none")}>Cancel</button>
          </div>
          <p className="hint">{mode === "accept"
            ? "Accepting confirms the delivered change works for the business. The Application Manager then hands it over for release."
            : "The Application Manager is told what is wrong and corrects it; you are asked again when the new result is verified."}</p>
        </div>
      )}
      {error !== null && <ErrorState error={error} title="Not recorded" />}
      <RequesterConfirmation change={change} card={card} onChanged={onChanged} />
      {(card.linkedRequests?.length ?? 0) > 0 && (
        <ul className="quietlist">{card.linkedRequests!.map((l) => (
          <li key={l.request_id}>{l.kind === "not_solved" ? "Not solved — new request" : "Follow-up"} <Link to={storyPath(l.request_id)}>{l.request_id}</Link>
            <span className="muted"> · {l.by}, {formatDateTime(l.at)}</span></li>))}</ul>
      )}

      <div className="outcome-foot">
        {(card.jiraPosted ?? 0) > 0 && <span className="hint">{card.jiraPosted} note{card.jiraPosted === 1 ? "" : "s"} written to the Jira ticket</span>}
        {(card.jiraFailed?.length ?? 0) > 0 && <span className="hint" role="status">Jira write-back failed, retried automatically: {card.jiraFailed!.join("; ")}</span>}
        {card.jiraUrl && <a href={card.jiraUrl} target="_blank" rel="noreferrer">Jira {card.jiraKey}</a>}
        <button className="linkbtn" onClick={async () => {
          try { await navigator.clipboard.writeText(summaryText(change, card)); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard unavailable */ }
        }}>{copied ? "Copied" : "Copy this summary"}</button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Process swimlane                                                     */
/* ------------------------------------------------------------------ */

const AC_RE = /\bAC\d+\b/g;

function latest(versions: MapVersion[]): MapVersion | undefined {
  return [...versions].sort((a, b) => b.version - a.version)[0];
}

function acsOf(s: MapStep): string[] {
  return [...new Set([s.label, s.notes, ...s.controls].join(" ").match(AC_RE) ?? [])];
}

type StepMark = "new" | "changed" | "same";

function marks(toBe: MapContent, asIs: MapContent | undefined, storyId: string): Map<string, StepMark> {
  const out = new Map<string, StepMark>();
  const before = new Map((asIs?.steps ?? []).map((s) => [s.id, s]));
  for (const s of toBe.steps) {
    const b = before.get(s.id);
    if (!asIs) out.set(s.id, s.story_ids.includes(storyId) ? "changed" : "same");
    else if (!b) out.set(s.id, "new");
    else if (b.label !== s.label || b.actor !== s.actor || b.system !== s.system || b.type !== s.type
      || b.controls.join("|") !== s.controls.join("|") || s.story_ids.includes(storyId) && !b.story_ids.includes(storyId)) out.set(s.id, "changed");
    else out.set(s.id, "same");
  }
  return out;
}

export function ProcessSwimlane({ process, storyId, criteria = [], business, empty }: {
  process: StoryProcessView | null;
  storyId: string;
  criteria?: AcceptanceCriterion[];
  /** The business view: no step or framework ids. */
  business?: boolean;
  empty?: ReactNode;
}) {
  const toBe = process ? latest(process.maps.to_be.versions) : undefined;
  const asIs = process ? latest(process.maps.as_is.versions) : undefined;
  // Until someone chooses, the proposed process (it may load after the first render).
  const [chosen, setView] = useState<"to_be" | "as_is" | null>(null);
  const view = chosen ?? (toBe ? "to_be" : "as_is");
  const shown = view === "to_be" ? toBe : asIs;
  const markMap = useMemo(() => (toBe ? marks(toBe.content, asIs?.content, storyId) : new Map<string, StepMark>()), [toBe, asIs, storyId]);

  if (!toBe && !asIs) {
    return (
      <section className="swim" aria-label="Business process">
        <h3 className="section-kicker">The process</h3>
        <p className="muted">{empty ?? "No process map has been recorded for this change yet."}</p>
      </section>
    );
  }
  const content = shown!.content;
  const layer = layers(content);
  const cols = Math.max(0, ...layer.values()) + 1;
  const lanes: string[] = [];
  content.steps.forEach((s) => { const l = s.actor || "Not assigned"; if (!lanes.includes(l)) lanes.push(l); });
  const changedCount = view === "to_be" ? [...markMap.values()].filter((m) => m !== "same").length : 0;
  const assumed = content.steps.filter((s) => s.basis === "assumption").length;
  const acSteps = new Map<string, MapStep[]>();
  content.steps.forEach((s) => acsOf(s).forEach((a) => acSteps.set(a, [...(acSteps.get(a) ?? []), s])));

  return (
    <section className="swim" aria-label="Business process" id="process">
      <div className="swim-head">
        <h3 className="section-kicker">The process</h3>
        <div className="segmented" role="group" aria-label="Which process">
          <button className={view === "to_be" ? "on" : ""} aria-pressed={view === "to_be"} disabled={!toBe} onClick={() => setView("to_be")}>Proposed</button>
          <button className={view === "as_is" ? "on" : ""} aria-pressed={view === "as_is"} disabled={!asIs} onClick={() => setView("as_is")}>Current</button>
        </div>
      </div>
      <p className="swim-summary">
        {content.title}{view === "to_be" && changedCount > 0 ? ` — ${changedCount} step${changedCount > 1 ? "s" : ""} change` : ""}
        {assumed > 0 ? ` · ${assumed} not yet confirmed by the business` : " · all steps confirmed"}
      </p>
      <div className="swim-scroll">
        <table className="swimlane">
          <caption className="sr-only">{view === "to_be" ? "Proposed" : "Current"} process by who does each step, left to right in order</caption>
          <tbody>
            {lanes.map((lane) => (
              <tr key={lane}>
                <th scope="row" className="swim-lane">{lane}</th>
                {Array.from({ length: cols }, (_, c) => {
                  const here = content.steps.filter((s) => (s.actor || "Not assigned") === lane && layer.get(s.id) === c);
                  return (
                    <td key={c} className="swim-cell">
                      {here.map((s) => {
                        const m = view === "to_be" ? markMap.get(s.id) ?? "same" : "same";
                        const acs = acsOf(s);
                        return (
                          <div key={s.id} className={`swim-step t-${s.type} m-${m}${s.basis === "assumption" ? " assumed" : ""}`}
                               title={s.notes || undefined}>
                            <span className="swim-label">{s.label}</span>
                            {s.system && <span className="swim-system">{s.system}</span>}
                            <span className="swim-tags">
                              {m !== "same" && <span className="swim-tag changed">{m === "new" ? "New" : "Changes"}</span>}
                              {s.type === "decision" && <span className="swim-tag">Decision</span>}
                              {s.basis === "assumption" && <span className="swim-tag assumed">Not confirmed</span>}
                              {acs.map((a) => <span key={a} className="swim-tag ac">{a}</span>)}
                              {!business && s.controls.length > 0 && <span className="swim-tag">{s.controls.length} control{s.controls.length > 1 ? "s" : ""}</span>}
                            </span>
                            {!business && <span className="sr-only">Step {s.id}</span>}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {criteria.length > 0 && (
        <ul className="swim-acs" aria-label="Acceptance criteria and the steps that meet them">
          {criteria.map((a) => {
            const st = acSteps.get(a.id) ?? [];
            return <li key={a.id}><span className="swim-tag ac">{a.id}</span> {a.text}
              {st.length > 0 ? <span className="muted"> — {st.map((s) => s.label).join("; ")}</span> : null}</li>;
          })}
        </ul>
      )}
      <p className="hint swim-legend">Steps marked “Changes” or “New” are what this change alters. “Not confirmed” means JADE or a reviewer
        assumed the step; the business has not confirmed it yet.{criteria.length > 0 ? " A step is linked to an acceptance criterion by naming it (for example AC1) in the step." : ""}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* JADE at work                                                         */
/* ------------------------------------------------------------------ */

export function JadeAtWorkLine({ lifecycle }: { lifecycle?: Lifecycle | null }) {
  if (!lifecycle || lifecycle.nextAction.owner !== "jade") return null;
  // One short line (review 23 Oct): what JADE is doing, in two or three words.
  // Routine work about to start by itself (step 4) says so, not "at work".
  const auto = lifecycle.automation?.state === "scheduled" ? lifecycle.automation : null;
  const short = auto ? (auto.kind === "intake" ? "JADE starts the user story shortly…" : "JADE reassesses shortly…")
    : lifecycle.phase === "solutioning" || lifecycle.phase === "solution_review" ? "JADE is architecting…"
    : lifecycle.phase === "understand" ? "JADE is writing the user story…" : lifecycle.nextAction.summary;
  return (
    <div className="jadeatwork" aria-live="polite" title={lifecycle.nextAction.summary}>
      <span className="facet" aria-hidden="true"><i /><i /><i /></span>
      <span className="jadeatwork-text">{short}</span>
      {lifecycle.activity && <span className="jadeatwork-now">{lifecycle.activity}</span>}
    </div>
  );
}


/** The requester confirms "solved" or "not solved" (register H4); "not solved" opens a linked request. */
function RequesterConfirmation({ change, card, onChanged }: { change: Change; card: OutcomeCard; onChanged: (c: Change) => void }) {
  const info = useSessionInfo();
  const [mode, setMode] = useState<"none" | "solved" | "not">("none");
  const [note, setNote] = useState("");
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const done = card.requesterConfirmation;
  if (done) {
    return <p className="outcome-now"><strong>Requester: </strong>{done.solved ? "solved" : `not solved — ${done.note}`}
      <span className="muted"> ({done.on_behalf_of || done.by}, {formatDateTime(done.at)})</span></p>;
  }
  if (!card.businessAccepted.done || !(info.has("domain_owner") || info.has("product_manager", "admin"))) return null;
  const needsName = !info.has("domain_owner");
  async function send() {
    setBusy(true); setError(null);
    try {
      onChanged(await deliveryApi.requesterConfirmation(change.id, { solved: mode === "solved", note, onBehalfOf: needsName ? who : "" }));
      setMode("none");
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <div className="outcome-confirm">
      {mode === "none" ? (
        <div className="btnrow"><span className="muted">Did this solve the request?</span>
          <button className="btn small" onClick={() => setMode("solved")}>Solved</button>
          <button className="btn small" onClick={() => setMode("not")}>Not solved</button></div>
      ) : (
        <div className="outcome-form">
          {needsName && <div className="field"><label htmlFor="rq-who">For the requester</label>
            <input id="rq-who" value={who} onChange={(e) => setWho(e.target.value)} placeholder="e.g. Ellen Vos" /></div>}
          <div className="field"><label htmlFor="rq-note">{mode === "not" ? "What is still not solved? (it becomes a new request)" : "Note (optional)"}</label>
            <textarea id="rq-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="btnrow">
            <button className="btn strong" disabled={busy || (needsName && who.trim().length < 2) || (mode === "not" && note.trim().length < 5)} onClick={send}>
              {busy ? "Recording…" : "Record"}</button>
            <button className="btn quiet" onClick={() => setMode("none")}>Cancel</button>
          </div>
        </div>
      )}
      {error !== null && <ErrorState error={error} title="Not recorded" />}
    </div>
  );
}
