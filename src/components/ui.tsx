import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { CapabilityStatus, FeedbackReasonCode } from "../types/domain";

export const REASON_CODE_LABEL: Record<FeedbackReasonCode, string> = {
  missing_information: "Missing information",
  wrong_business_domain: "Wrong business domain",
  incorrect_analysis_or_route: "Incorrect analysis or route",
  risk_or_compliance_concern: "Risk or compliance concern",
  duplicate_or_superseded: "Duplicate or superseded",
  other: "Other",
};

/**
 * Functional Agent design update — a capability's status (whether it
 * is allowed to execute, distinct from whether a human has approved
 * any particular operation). Shared between Admin > Agents' catalogue
 * view and ChangeDetail's exact-change panel so both read the same
 * labels/tones.
 */
export const CAPABILITY_STATUS_LABEL: Record<CapabilityStatus, string> = {
  validated: "Validated",
  needs_spike: "Needs spike",
  restricted: "Restricted",
  human_implementation: "Human Implementation",
  suspended: "Suspended",
};

const CAPABILITY_STATUS_TONE: Record<CapabilityStatus, string> = {
  validated: "ok",
  needs_spike: "warn",
  restricted: "stop",
  human_implementation: "grey",
  suspended: "stop",
};

export function CapabilityStatusBadge({ status }: { status: CapabilityStatus }) {
  return <span className={`badge ${CAPABILITY_STATUS_TONE[status]}`}>{CAPABILITY_STATUS_LABEL[status]}</span>;
}

/* ------------------------------------------------------------------ */
/* Provenance — who produced this content                              */
/* ------------------------------------------------------------------ */

type Provenance = "ai" | "human" | "proposed" | "executed" | "plain";

const PROV_LABEL: Record<Provenance, string> = {
  ai: "AI recommendation — not yet approved or applied",
  human: "Human decision",
  proposed: "Proposed change — not yet applied to JD Edwards",
  executed: "Applied to JD Edwards",
  plain: "As submitted",
};

/**
 * Wraps content with an unmistakable marker of where it came from.
 * This is the rule that stops a reader mistaking an AI suggestion for
 * something that actually happened in JDE.
 */
export function Provenance({
  kind,
  label,
  children,
}: {
  kind: Provenance;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className={`prov ${kind}`}>
      <div className="who">{label ?? PROV_LABEL[kind]}</div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmation modal — approvals are never one careless click          */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  title,
  intro,
  whatHappensNext,
  confirmLabel,
  tone = "primary",
  requireNote,
  showReasonCode,
  onConfirm,
  onCancel,
}: {
  title: string;
  intro: ReactNode;
  whatHappensNext: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  requireNote: boolean;
  /** Adds a structured reason-code picker alongside the free-text note — only meaningful on a rejection/send-back. */
  showReasonCode?: boolean;
  // No decidedBy parameter -- who is deciding is derived automatically
  // from the signed-in user (shown in the masthead), never re-entered
  // here. See api.ts's DecisionInput for the same change on the wire.
  onConfirm: (note: string, reasonCode?: FeedbackReasonCode) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [reasonCode, setReasonCode] = useState<FeedbackReasonCode | "">("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const ready = !requireNote || note.trim().length > 0;

  return (
    <div className="modalwrap" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header><h3>{title}</h3></header>
        <div className="body">
          {intro}
          <div className="callout" style={{ margin: "16px 0" }}>
            <strong>What happens next</strong>
            {whatHappensNext}
          </div>
          {showReasonCode && (
            <div className="field">
              <label htmlFor="reasoncode">Reason code</label>
              <select id="reasoncode" value={reasonCode} onChange={(e) => setReasonCode(e.target.value as FeedbackReasonCode | "")}>
                <option value="">— not categorised —</option>
                {(Object.entries(REASON_CODE_LABEL) as [FeedbackReasonCode, string][]).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="note">
              Reason {requireNote ? "" : <span className="hint">(optional)</span>}
            </label>
            <textarea
              id="note"
              value={note}
              style={{ minHeight: 80 }}
              placeholder={requireNote ? "Required — this is what tells the team what to fix" : "Anything worth recording alongside the decision"}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <footer>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button
            className={`btn ${tone}`}
            disabled={!ready}
            onClick={() => onConfirm(note.trim(), reasonCode || undefined)}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                 */
/* ------------------------------------------------------------------ */

export function NotStated() {
  return <span className="notstated">not stated</span>;
}

export { Loading } from "./design";

// Governance widgets used by the Application Management and User Story Review screens.
export {
  StateBadge, stateLabel, PIPELINE_STATES, DOMAIN_STAGE_LABEL, PriorityBadge, PRIORITY_RANK, Kpi, ColumnChart, DonutChart,
  BarList, FlowSteps, PipelineFlow, Timeline, type TimelineItem,
} from "./governance";
