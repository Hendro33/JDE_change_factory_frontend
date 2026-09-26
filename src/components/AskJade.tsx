import { useState, type ReactNode } from "react";
import type { ConversationTurn } from "../types/domain";

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
}) {
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

  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="sub" style={{ marginBottom: 12 }}>
        Ask why, question something, or add what JADE missed. Answers never change anything by themselves; new
        information comes back as a proposed update for you to review.
      </div>

      {turns.length > 0 && (
        <div className="stack" style={{ marginBottom: 16 }}>
          {turns.map((t) => (
            <div key={t.turnId} style={{ borderLeft: "3px solid var(--line-strong)", paddingLeft: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t.askedBy} asked</div>
              <div style={{ fontSize: 13.5, marginBottom: 6 }}>{t.question}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--jade-dark)" }}>JADE</div>
              <div style={{ fontSize: 13.5 }}>{t.answer}</div>
              {t.kind === "proposed_amendment" && t.proposedUserStory && (
                <div className="callout" style={{ marginTop: 8 }}>
                  <strong>JADE proposes an update to the story</strong>
                  <p style={{ margin: "4px 0 8px", fontSize: 13.5, fontWeight: 700 }}>{t.proposedUserStory.statement}</p>
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

      <div className="field">
        <label htmlFor="askjade-question" className="sr-only">{title}</label>
        <textarea
          id="askjade-question"
          value={question}
          style={{ minHeight: 64 }}
          placeholder="e.g. Why is the risk medium? Explain this without JD Edwards terms. Weekends should also be excluded."
          onChange={(e) => setQuestion(e.target.value)}
        />
      </div>
      {error && <div className="callout" style={{ borderColor: "var(--stop)", marginBottom: 12 }}>{error}</div>}
      <div className="btnrow">
        <button className="btn primary" disabled={busy || !question.trim()} onClick={submit}>
          {busy ? "Asking JADE…" : "Ask JADE"}
        </button>
      </div>
    </section>
  );
}
