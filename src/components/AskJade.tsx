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
  askedByDefault,
  onAsk,
  renderAmendmentActions,
  renderRecommendReanalysisActions,
}: {
  title: string;
  turns: ConversationTurn[];
  askedByDefault: string;
  onAsk: (question: string, askedBy: string) => Promise<void>;
  renderAmendmentActions?: (turn: ConversationTurn) => ReactNode;
  /** Solution-side only ("Ask Jade about this solution") -- there is no
   * draft to review for a recommend_reanalysis turn, only a pointer
   * back at re-running Architecture Review; the caller supplies that
   * action here, the same way renderAmendmentActions supplies its own
   * governed next step for a proposed_amendment. */
  renderRecommendReanalysisActions?: (turn: ConversationTurn) => ReactNode;
}) {
  const [askedBy, setAskedBy] = useState(askedByDefault);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!question.trim() || !askedBy.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAsk(question.trim(), askedBy.trim());
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
        Ask for an explanation, question something, or add information Jade missed. An explanation never
        changes anything; new information becomes a proposed update for you to review, never applied on its own.
      </div>

      {turns.length > 0 && (
        <div className="stack" style={{ marginBottom: 16 }}>
          {turns.map((t) => (
            <div key={t.turnId} style={{ borderLeft: "3px solid var(--line-strong)", paddingLeft: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t.askedBy} asked</div>
              <div style={{ fontSize: 13.5, marginBottom: 6 }}>{t.question}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ai)" }}>Jade</div>
              <div style={{ fontSize: 13.5 }}>{t.answer}</div>
              {t.kind === "proposed_amendment" && t.proposedUserStory && (
                <div className="callout" style={{ marginTop: 8 }}>
                  <strong>Jade proposes an update to this requirement</strong>
                  <p style={{ margin: "4px 0 8px", fontSize: 13.5, fontWeight: 700 }}>{t.proposedUserStory.statement}</p>
                  {renderAmendmentActions?.(t)}
                </div>
              )}
              {t.kind === "recommend_reanalysis" && (
                <div className="callout" style={{ marginTop: 8 }}>
                  <strong>Jade recommends re-running Architecture Review</strong>
                  {renderRecommendReanalysisActions?.(t)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="field">
        <label htmlFor="askjade-who">Your name</label>
        <input id="askjade-who" type="text" value={askedBy} onChange={(e) => setAskedBy(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="askjade-question">{title}</label>
        <textarea
          id="askjade-question"
          value={question}
          style={{ minHeight: 64 }}
          placeholder="e.g. Why is this the recommended approach? Or: Weekends should also be excluded."
          onChange={(e) => setQuestion(e.target.value)}
        />
      </div>
      {error && <div className="callout" style={{ borderColor: "var(--stop)", marginBottom: 12 }}>{error}</div>}
      <div className="btnrow">
        <button className="btn primary" disabled={busy || !question.trim() || !askedBy.trim()} onClick={submit}>
          {busy ? "Asking Jade…" : "Ask"}
        </button>
      </div>
    </section>
  );
}
