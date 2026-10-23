import { useState } from "react";
import { api } from "../services/api";
import type { Change, DomainLine, Figure, QuestionItem, StuckItem } from "../types/domain";
import { Link, storyPath } from "../router";
import { changePath } from "../pages/stories/useStory";
import { waitingLabel } from "../services/metrics";
import { ErrorState, storyTitle, useSessionInfo } from "./design";

/**
 * The role homes (register C1, C3, K7, K15) and the one figure strip
 * (decision X1). Every number and every row comes from GET /work, computed
 * once on the server, so My Work, the Application Manager home and Insights
 * never disagree.
 */

/** One slim figure strip, the same component on every page. */
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
    <li className="qrow question">
      <span className="kindtile" data-kind={decision ? "decision" : "question"} aria-hidden="true">{decision ? "◆" : "?"}</span>
      <span className="qrow-main">
        <span className="qrow-q">{i.title}</span>
        <span className="qrow-sub"><Link to={storyLink}>{q.title}</Link> <span className="mono muted">{q.changeId}</span>
          {i.consequence ? <> · {i.consequence}</> : null}</span>
        {i.proposedAnswer && <span className="qrow-proposal"><strong>JADE proposes:</strong> {i.proposedAnswer}</span>}
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
      <span className="qrow-meta"><span>{q.phaseLabel}</span><span className="muted">{i.ownerLabel}</span></span>
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

export function StuckList({ items }: { items: StuckItem[] }) {
  if (!items.length) return <p className="muted">Nothing is stuck.</p>;
  return (
    <ul className="stucklist">{items.map((s) => (
      <li key={s.change.id}>
        <Link to={changePath(s.change.id)}>{storyTitle(s.change)}</Link>
        <span className="muted">{s.reason}</span>
      </li>
    ))}</ul>
  );
}

export function DomainLines({ lines }: { lines: DomainLine[] }) {
  if (!lines.length) return null;
  return (
    <table className="data domainlines">
      <caption className="sr-only">Work in flight per business domain</caption>
      <thead><tr><th scope="col">Business domain</th><th scope="col">In flight</th><th scope="col">Oldest waiting</th><th scope="col">Waiting on</th></tr></thead>
      <tbody>{lines.map((d) => (
        <tr key={d.domainId ?? "none"}>
          <td>{d.domainId ? <Link to={`/am/changes?domain=${encodeURIComponent(d.domainId)}`}>{d.name}</Link> : d.name}</td>
          <td>{d.inFlight}</td>
          <td>{d.oldestWaitingDays == null ? "—" : `${d.oldestWaitingDays} d`}</td>
          <td className="muted">{Object.entries(d.waitingOn).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
