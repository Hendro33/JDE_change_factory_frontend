import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "../router";
import type { ConversationTurn, UserStory } from "../types/domain";

/** What a proposed update would change, compared with the story as it is. */
function AmendmentPreview({ current, proposed }: { current?: UserStory; proposed: UserStory }) {
  if (!current) return null;
  const before = new Map(current.acceptanceCriteria.map((a) => [a.text.trim(), a]));
  const after = new Set(proposed.acceptanceCriteria.map((a) => a.text.trim()));
  const added = proposed.acceptanceCriteria.filter((a) => !before.has(a.text.trim()));
  const removed = current.acceptanceCriteria.filter((a) => !after.has(a.text.trim()));
  const statement = current.statement.trim() !== proposed.statement.trim();
  const rules = proposed.businessRules.filter((r) => !current.businessRules.includes(r));
  const parts = [statement && "the story statement", added.length && `${added.length} acceptance criteri${added.length > 1 ? "a" : "on"} added`,
    removed.length && `${removed.length} removed`, rules.length && `${rules.length} business rule${rules.length > 1 ? "s" : ""} added`].filter(Boolean);
  if (parts.length === 0) return <p className="hint">No difference with the current story.</p>;
  return (
    <div className="amend-preview">
      <p className="hint" style={{ margin: "4px 0" }}>JADE proposes changing {parts.join(", ")}. Nothing changes until it is reviewed and applied as a recorded revision.</p>
      <ul className="amend-diff">
        {added.map((a, i) => <li key={`a${i}`} className="add"><span className="sr-only">Added: </span>+ {a.text}</li>)}
        {removed.map((a, i) => <li key={`r${i}`} className="del"><span className="sr-only">Removed: </span>− {a.text}</li>)}
        {rules.map((r, i) => <li key={`b${i}`} className="add"><span className="sr-only">Added rule: </span>+ {r}</li>)}
      </ul>
    </div>
  );
}

/**
 * "Ask Jade about this requirement" / "Ask Jade about this solution" --
 * requirement/solution collaboration scoped to one artefact, never a
 * generic chat surface (no "Chat"/"Chatbot" wording anywhere here).
 *
 * Explanation turns are shown as plain Q&A. A proposed_amendment turn
 * is shown as a distinct, clearly-labelled card — this component never
 * applies one itself; renderAmendmentActions supplies whatever the
 * caller's own governed flow requires (review-as-edit on User Story
 * Review, flag-for-reconsideration on Architecture Review).
 */
export function AskJadePanel({
  title,
  turns,
  onAsk,
  renderAmendmentActions,
  renderRecommendReanalysisActions,
  currentStory,
}: {
  title: string;
  turns: ConversationTurn[];
  // No askedByDefault -- who is asking is derived automatically from
  // the signed-in user server-side, never re-entered here.
  onAsk: (question: string) => Promise<void>;
  renderAmendmentActions?: (turn: ConversationTurn) => ReactNode;
  /** Solution-side only ("Ask Jade about this solution") -- there is no
   * draft to review for a recommend_reanalysis turn, only a pointer
   * back at re-running Architecture Review; the caller supplies that
   * action here, the same way renderAmendmentActions supplies its own
   * governed next step for a proposed_amendment. */
  renderRecommendReanalysisActions?: (turn: ConversationTurn) => ReactNode;
  /** The story as it is, so a proposed update shows what it would change. */
  currentStory?: UserStory;
}) {
  const { hash } = useLocation();
  // A link to #ask puts the cursor in the bar.
  useEffect(() => { if (hash === "ask") document.getElementById("askjade-question")?.focus(); }, [hash]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAsk(question.trim());
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Jade could not answer that just now.");
    } finally {
      setBusy(false);
    }
  }

  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? turns : turns.slice(-1);
  // Ask JADE sits at the top, next to the next step (design: "stays on every story
  // and every solution, and becomes more prominent"): one bar to type into; the
  // latest exchange below it, earlier ones on request.
  return (
    <section className="askjade" id="ask" aria-label={title}>
      <form className="askjade-bar" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <span className="facet" aria-hidden="true"><i /><i /><i /></span>
        <label htmlFor="askjade-question" className="sr-only">{title}</label>
        <input id="askjade-question" type="text" value={question} autoComplete="off"
          placeholder={`${title}: why this, what if, or what JADE missed…`}
          onChange={(e) => setQuestion(e.target.value)} />
        <button className="btn primary small" type="submit" disabled={busy || !question.trim()}>{busy ? "Asking…" : "Ask"}</button>
      </form>
      <div className="muted explain askjade-intro">Answers never change anything by themselves; new information comes back as a proposed update for you to review.</div>
      {error && <div className="callout" style={{ borderColor: "var(--stop)", margin: "8px 0" }}>{error}</div>}
      {turns.length > 0 && (
        <div className="askjade-turns">
          {turns.length > 1 && <button className="linkbtn" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show only the latest" : `${turns.length - 1} earlier question${turns.length === 2 ? "" : "s"}`}</button>}
          {shown.map((t) => (
            <div key={t.turnId} className="askjade-turn">
              <div className="askjade-q"><strong>{t.askedBy}:</strong> {t.question}</div>
              <div className="askjade-a"><strong>JADE:</strong> {t.answer}</div>
              {t.kind === "proposed_amendment" && t.proposedUserStory && (
                <div className="callout" style={{ marginTop: 8 }}>
                  <strong>JADE proposes an update to the story</strong>
                  <p style={{ margin: "4px 0 8px", fontSize: 13.5, fontWeight: 700 }}>{t.proposedUserStory.statement}</p>
                  <AmendmentPreview current={currentStory} proposed={t.proposedUserStory} />
                  {renderAmendmentActions?.(t)}
                </div>
              )}
              {t.kind === "recommend_reanalysis" && (
                <div className="callout" style={{ marginTop: 8 }}>
                  <strong>JADE recommends running solutioning again</strong>
                  {renderRecommendReanalysisActions?.(t)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
