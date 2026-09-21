import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { CapabilityStatus, FeedbackReasonCode, LifecycleState } from "../types/domain";

export const REASON_CODE_LABEL: Record<FeedbackReasonCode, string> = {
  missing_information: "Missing information",
  wrong_business_domain: "Wrong business domain",
  incorrect_analysis_or_route: "Incorrect analysis or route",
  risk_or_compliance_concern: "Risk or compliance concern",
  duplicate_or_superseded: "Duplicate or superseded",
  other: "Other",
};

/* ------------------------------------------------------------------ */
/* Status vocabulary                                                    */
/* ------------------------------------------------------------------ */

const STATE_LABELS: Record<LifecycleState, string> = {
  RECEIVED: "Received",
  REFINING: "Story enhancement",
  BACKLOG_READY: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RESOLVED_WITHOUT_CHANGE: "Resolved, no change",
  ARCHITECTING: "Architecting",
  SPEC_READY: "Specification ready",
  CHANGE_APPROVED: "Change approved",
  EXECUTING: "In build",
  TESTING: "Testing",
  VALIDATED: "Validated",
  CNC_HANDOFF: "With CNC",
  CLOSED: "Closed",
  FAILED: "Failed",
};

const STATE_TONE: Record<LifecycleState, string> = {
  RECEIVED: "grey",
  REFINING: "info",
  BACKLOG_READY: "warn",
  APPROVED: "info",
  REJECTED: "stop",
  RESOLVED_WITHOUT_CHANGE: "ok",
  ARCHITECTING: "info",
  SPEC_READY: "info",
  CHANGE_APPROVED: "warn",
  EXECUTING: "info",
  TESTING: "info",
  VALIDATED: "ok",
  CNC_HANDOFF: "warn",
  CLOSED: "ok",
  FAILED: "stop",
};

export function StateBadge({ state }: { state: LifecycleState }) {
  return <span className={`badge ${STATE_TONE[state]}`}>{STATE_LABELS[state]}</span>;
}

export function stateLabel(state: LifecycleState) {
  return STATE_LABELS[state];
}

/**
 * The post-approval lifecycle in pipeline order — the canonical set the
 * "Where everything sits" view (Pipeline, Delivery Queue) counts across,
 * so both pages show the same nine stages rather than two independently
 * maintained lists.
 */
export const PIPELINE_STATES: LifecycleState[] = [
  "APPROVED", "ARCHITECTING", "SPEC_READY", "CHANGE_APPROVED", "EXECUTING",
  "TESTING", "VALIDATED", "CNC_HANDOFF", "CLOSED",
];

/** Domain Owner / Application Manager governance stages (Section 7). */
export const DOMAIN_STAGE_LABEL: Record<string, string> = {
  ready_for_domain_owner: "User story ready for Domain Owner",
  domain_owner_reviewing: "Domain Owner reviewing",
  domain_owner_requested_revision: "Domain Owner requested revision",
  reviewer_agent_refining: "Reviewer Agent refining",
  domain_owner_approved: "Domain Owner approved",
  domain_owner_rejected: "Domain Owner rejected — will not proceed",
  ready_for_application_manager: "Ready for Application Manager",
  application_manager_approved: "Application Manager approved — queued for delivery",
  application_manager_rejected: "Application Manager rejected — will not proceed",
};

export function PriorityBadge({ priority }: { priority: "High" | "Medium" | "Low" }) {
  const tone = priority === "High" ? "stop" : priority === "Medium" ? "warn" : "ok";
  return <span className={`badge ${tone}`}>{priority}</span>;
}

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
/* KPI                                                                  */
/* ------------------------------------------------------------------ */

export function Kpi({
  value,
  label,
  delta,
  mark,
  onClick,
  tone,
}: {
  value: number;
  label: string;
  /** Omit when there is no tracked trend to show — a fabricated "0" implies history that doesn't exist. */
  delta?: number;
  mark?: string;
  /** Makes the whole card a button, e.g. navigating to the filtered work queue this count represents. */
  onClick?: () => void;
  /** Attention colour for the number itself, e.g. from the customer's own alert thresholds (Admin > Customer Setup). Omit for the normal ink colour. */
  tone?: "warn" | "stop";
}) {
  const dir = delta === undefined ? undefined : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const arrow = delta === undefined ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`kpi${onClick ? " clickable" : ""}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <div className="top">
        <div className={`value${tone ? ` ${tone}` : ""}`}>{value}</div>
        {mark && <span className="mark" aria-hidden="true">{mark}</span>}
      </div>
      <div className="label">{label}</div>
      {delta !== undefined && (
        <div className="delta">
          <span className={dir}>
            {arrow} {delta === 0 ? "0" : `${delta > 0 ? "+" : ""}${delta}`}
          </span>
          <span className="since">vs previous 30 days</span>
        </div>
      )}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* Charts — hand-drawn SVG, no chart library                            */
/* ------------------------------------------------------------------ */

export function ColumnChart({ data }: { data: { stage: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 460;
  const h = 200;
  const padL = 26;
  const padB = 44;
  const bandW = (w - padL) / data.length;
  const barW = Math.min(46, bandW * 0.55);
  const ticks = [0, Math.ceil(max / 2), max];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Change pipeline by stage">
      {ticks.map((t) => {
        const y = h - padB - (t / max) * (h - padB - 14);
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={w} y2={y} stroke="#eee" />
            <text x={padL - 8} y={y + 4} fontSize="10" fill="#6b6b6b" textAnchor="end">{t}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const bh = (d.count / max) * (h - padB - 14);
        const x = padL + i * bandW + (bandW - barW) / 2;
        const y = h - padB - bh;
        return (
          <g key={d.stage}>
            <rect x={x} y={y} width={barW} height={Math.max(bh, 1)} fill="#FFCC00" />
            <text x={x + barW / 2} y={y - 6} fontSize="11" fontWeight="700" fill="#000" textAnchor="middle">
              {d.count}
            </text>
            {d.stage.split(" ").map((word, wi, arr) => (
              <text
                key={wi}
                x={x + barW / 2}
                y={h - padB + 16 + wi * 11 - (arr.length > 1 ? 4 : 0)}
                fontSize="10"
                fill="#3d3d3d"
                textAnchor="middle"
              >
                {word}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const DONUT_COLOURS = ["#FFCC00", "#000000", "#9e9e9e", "#d4d4d4", "#efefef"];

export function DonutChart({
  data,
  centreLabel,
}: {
  data: { type: string; count: number }[];
  centreLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const r = 62;
  const stroke = 26;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width="164" height="164" viewBox="0 0 164 164" role="img" aria-label="Breakdown by change type">
        <g transform="rotate(-90 82 82)">
          {data.map((d, i) => {
            const frac = d.count / total;
            const dash = frac * c;
            const el = (
              <circle
                key={d.type}
                cx="82" cy="82" r={r}
                fill="none"
                stroke={DONUT_COLOURS[i % DONUT_COLOURS.length]}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
        <text x="82" y="78" fontSize="21" fontWeight="700" textAnchor="middle">{total}</text>
        <text x="82" y="95" fontSize="11" fill="#6b6b6b" textAnchor="middle">{centreLabel}</text>
      </svg>
      <ul className="legend" style={{ flex: 1, minWidth: 180 }}>
        {data.map((d, i) => (
          <li key={d.type}>
            <span className="swatch" style={{ background: DONUT_COLOURS[i % DONUT_COLOURS.length] }} />
            <span className="name">{d.type}</span>
            <span className="num">
              {d.count} ({Math.round((d.count / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({
  data,
  onItemClick,
}: {
  data: { category: string; count: number }[];
  /** Makes each row a button, e.g. navigating to that row's filtered work queue. */
  onItemClick?: (index: number) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      {data.map((d, i) => {
        const Tag = onItemClick ? "button" : "div";
        return (
          <Tag
            className={`hbar${onItemClick ? " clickable" : ""}`}
            key={d.category}
            onClick={onItemClick ? () => onItemClick(i) : undefined}
            type={onItemClick ? "button" : undefined}
          >
            <span>{d.category}</span>
            <span className="track">
              <span className="fill" style={{ width: `${(d.count / max) * 100}%` }} />
            </span>
            <span>{d.count}</span>
          </Tag>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow + timeline                                                  */
/* ------------------------------------------------------------------ */

export function FlowSteps({ steps, currentIndex }: { steps: string[]; currentIndex: number }) {
  return (
    <div className="flowsteps">
      {steps.map((s, i) => (
        <span key={s} style={{ display: "contents" }}>
          <span className={`step ${i < currentIndex ? "done" : i === currentIndex ? "on" : ""}`}>{s}</span>
          {i < steps.length - 1 && <span className="arrow" aria-hidden="true">→</span>}
        </span>
      ))}
    </div>
  );
}

/**
 * The aggregate "where everything sits" view — every stage in `states`
 * with how many changes currently sit in it, and (optionally) which
 * stages the caller's own current selection maps onto, shaded so a
 * dropdown-driven filter is visible on the pipeline itself rather than
 * left for the reader to work out by name alone.
 */
export function PipelineFlow({ states, counts, highlightStates }: {
  states: LifecycleState[];
  counts: Partial<Record<LifecycleState, number>>;
  highlightStates?: LifecycleState[];
}) {
  const highlighted = new Set(highlightStates ?? []);
  return (
    <div className="pipeflow">
      {states.map((s, i) => {
        const n = counts[s] ?? 0;
        return (
          <span key={s} style={{ display: "contents" }}>
            <div className={`pipestep${n > 0 ? " has" : ""}${highlighted.has(s) ? " selected" : ""}`}>
              <div className="count">{n}</div>
              <div className="label">{stateLabel(s)}</div>
            </div>
            {i < states.length - 1 && <span className="pipearrow" aria-hidden="true">→</span>}
          </span>
        );
      })}
    </div>
  );
}

export interface TimelineItem {
  title: string;
  when?: string;
  detail?: string;
  status: "done" | "current" | "pending";
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ul className="timeline">
      {items.map((it, i) => (
        <li key={i} className={it.status}>
          <div className="rail">
            <span className="dot" />
            <span className="line" />
          </div>
          <div className="body">
            <h4>{it.title}</h4>
            {it.when && <div className="when">{it.when}</div>}
            {it.detail && <p>{it.detail}</p>}
          </div>
        </li>
      ))}
    </ul>
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

export function Loading({ what }: { what: string }) {
  return <div className="loading">Loading {what}…</div>;
}

export function ApiNote({ endpoint }: { endpoint: string }) {
  return (
    <div className="apinote">
      Reads from <code>{endpoint}</code> — served by mock data today, by the Jade
      backend once connected.
    </div>
  );
}
