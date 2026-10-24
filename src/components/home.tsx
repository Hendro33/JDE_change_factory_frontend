import { useState } from "react";
import { api } from "../services/api";
import type { Change, DomainLine, Figure, QuestionItem, StuckItem } from "../types/domain";
import { Link, storyPath } from "../router";
import { changePath } from "../pages/stories/useStory";
import { waitingLabel } from "../services/metrics";
import { ErrorState, storyTitle, useSessionInfo } from "./design";
import { IconTile } from "./icons";

/**
 * The role homes (register C1, C3, K7, K15) and the one figure strip
 * (decision X1). Every number and every row comes from GET /work, computed
 * once on the server, so My Work, the Application Manager home and Insights
 * never disagree.
 */

/** One slim figure strip, the same component on every page. */
/**
 * One short line for a list row: the first sentence, without bracketed asides,
 * at most `max` characters. The full text stays on the change itself and in the
 * row's tooltip -- lists never carry an agent's paragraph.
 */
export function oneLine(text: string | null | undefined, max = 90): string {
  let t = (text ?? "").replace(/\s+/g, " ");
  for (let i = 0; i < 5 && /\([^()]*\)/.test(t); i++) t = t.replace(/\s*\([^()]*\)/g, "");
  t = t.replace(/[()]/g, "").trim();
  const end = t.search(/[.;](\s|$)/);
  if (end > 0) t = t.slice(0, end);
  const colon = t.lastIndexOf(": ", max);
  if (t.length > max && colon > 20) t = t.slice(0, colon);
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : t;
}

export function FigureStrip({ figures, label = "Figures", only, tones = {} }: {
  figures: Figure[]; label?: string; only?: string[];
  /** A figure above the customer's saved alert levels (Administration › Organisation). */
  tones?: Record<string, "warn" | "stop" | undefined>;
}) {
  const shown = only ? only.map((k) => figures.find((f) => f.key === k)).filter((f): f is Figure => !!f) : figures;
  return (
    <dl className="figstrip" aria-label={label}>
      {shown.map((f) => (
        <div key={f.key} className={`fig${tones[f.key] ? ` ${tones[f.key]}` : ""}`} title={f.definition}>
          <dd className="fig-value">{f.display}</dd>
          {tones[f.key] && <dd className="sr-only">{tones[f.key] === "stop" ? "above the alert level" : "above the warning level"}</dd>}
          <dt className="fig-label">{f.link ? <Link to={f.link}>{f.label}</Link> : f.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** A question answered where it is shown: the proposed answer one click away. */
export function QuestionRow({ q, onAnswered }: { q: QuestionItem; onAnswered: () => void }) {
  const info = useSessionInfo();
  const [answer, setAnswer] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const i = q.issue;
  const decision = i.kind === "decision";
  const send = async (text: string) => {
    setBusy(true); setError(null);
    try {
      await api.resolveIssue(q.changeId, i.id, { status: "answered", answer: text });
      onAnswered();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const storyLink = info.appManagement && i.tab !== "story" ? changePath(q.changeId, "solution", "open-points")
    : storyPath(q.changeId, "changes", "open-points");
  return (
    <li className="qrow k-question">
      <IconTile name={decision ? "decision" : "question"} />
      <span className="qrow-main">
        <span className="qrow-q">{i.title}</span>
        <span className="qrow-sub"><Link to={storyLink}>{q.title}</Link></span>
        {i.proposedAnswer && <span className="qrow-proposal" title={i.proposedAnswer}><strong>JADE proposes:</strong> {oneLine(i.proposedAnswer, 110)}</span>}
        {(i.options?.length ?? 0) > 1 && !open && (
          <span className="qrow-options">{i.options!.map((o) => (
            <button key={o} className="btn small outline" disabled={busy} onClick={() => send(o)}>{o}</button>
          ))}</span>
        )}
        {open && (
          <span className="qrow-answer">
            <label className="sr-only" htmlFor={`ans-${i.id}`}>Your answer</label>
            <textarea id={`ans-${i.id}`} rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)}
              placeholder={decision ? "Your decision, in a sentence" : "Your answer, in a sentence"} />
            <span className="btnrow">
              <button className="btn primary small" disabled={busy || answer.trim().length < 2} onClick={() => send(answer.trim())}>
                {busy ? "Sending…" : "Send answer"}</button>
              <button className="btn small" onClick={() => setOpen(false)}>Cancel</button>
            </span>
          </span>
        )}
        {error !== null && <ErrorState error={error} title="Not recorded" />}
      </span>
      <span className="qrow-meta"><span className="qrow-phase">{q.phaseLabel}</span></span>
      {!open && (
        <span className="qrow-actions">
          {i.proposedAnswer && <button className="btn small outline" disabled={busy} onClick={() => send(i.proposedAnswer)}>Accept proposal</button>}
          <button className="btn small" onClick={() => setOpen(true)}>{decision ? "Decide" : "Answer"}</button>
        </span>
      )}
    </li>
  );
}

/** "Your requests": one line each -- phase, next step, waiting on whom (register C1, C12). */
export function RequestLine({ c }: { c: Change }) {
  const lc = c.lifecycle!;
  const na = lc.nextAction;
  const stuck = lc.health === "blocked" || lc.health === "failed";
  const who = na.owner === "jade" ? "JADE is working on it" : na.owner === "none" ? "" :
    ["product_manager", "cnc_operator", "admin"].includes(na.owner) ? "With Application Management" : `Waiting for ${na.ownerLabel || "someone"}`;
  return (
    <li className="reqline">
      <Link className="reqline-title" to={storyPath(c.id)}>{storyTitle(c)}</Link>
      <span className="reqline-phase">{lc.phaseLabel}</span>
      <span className="reqline-next">{who}{waitingLabel(c) ? ` · ${waitingLabel(c)}` : ""}</span>
      {stuck && <span className="status-word stop">Stuck</span>}
    </li>
  );
}

export function StuckList({ items, shown = 5 }: { items: StuckItem[]; shown?: number }) {
  if (!items.length) return <p className="muted">Nothing is stuck.</p>;
  const line = (s: StuckItem) => (
    <li key={s.change.id}>
      <Link to={changePath(s.change.id)}>{storyTitle(s.change)}</Link>
      <span className="muted" title={s.reason}>{oneLine(s.reason, 70)}</span>
    </li>
  );
  return (
    <>
      <ul className="stucklist card">{items.slice(0, shown).map(line)}</ul>
      {items.length > shown && (
        <details className="qmore"><summary>{items.length - shown} more</summary>
          <ul className="stucklist">{items.slice(shown).map(line)}</ul></details>
      )}
    </>
  );
}

export function DomainLines({ lines }: { lines: DomainLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="domaincards" aria-label="Work in flight per business domain">{lines.map((d) => {
      const waiting = Object.entries(d.waitingOn).sort((a, b) => b[1] - a[1])[0];
      return (
        <li key={d.domainId ?? "none"} className="card">
          <IconTile name="domain" size="sm" />
          <span className="dc-name">{d.domainId ? <Link to={`/am/changes?domain=${encodeURIComponent(d.domainId)}`}>{d.name}</Link> : d.name}</span>
          <span className="dc-figs"><b>{d.inFlight}</b> in flight{d.oldestWaitingDays != null && <> · oldest <b>{d.oldestWaitingDays} d</b></>}</span>
          {waiting && <span className="dc-wait">Mostly waiting on {waiting[0]}</span>}
        </li>
      );
    })}</ul>
  );
}
