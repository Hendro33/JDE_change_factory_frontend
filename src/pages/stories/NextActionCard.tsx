import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../services/api";
import type { CompanyRole, NextAction } from "../../types/domain";
import { ConfirmDialog } from "../../components/ui";
import { ErrorState, JadeWorking, useSessionInfo } from "../../components/design";
import { Link, storyPath } from "../../router";
import type { StoryCtx } from "./storyContext";

type Dialog = { title: string; intro?: ReactNode; next: string; confirm: string; tone: "primary" | "danger"; requireNote: boolean;
  reasonCode?: boolean; run: (note: string, reason?: string) => Promise<unknown> } | null;

/** What each decision means, in plain words, for the card and its dialog. */
const DECISION_COPY: Record<string, { approve: string; ifApproved: string; ifRejected: string; reject?: string }> = {
  review_story: {
    approve: "Approve story", reject: "Reject requirement",
    ifApproved: "The story goes to the Application Manager, who decides whether JADE may start working on it.",
    ifRejected: "The requirement does not go ahead. Use Request changes instead if the story only needs more work.",
  },
  authorise_delivery: {
    approve: "Authorise delivery", reject: "Do not proceed",
    ifApproved: "JADE starts solutioning: it researches the JD Edwards environment and proposes a solution for your review. Nothing is changed in JD Edwards yet.",
    ifRejected: "The story does not go ahead and is not queued for delivery.",
  },
  approve_design: {
    approve: "Approve solution",
    ifApproved: "JADE prepares the exact implementation package for DEV. You approve that exact package separately before anyone checks it in.",
    ifRejected: "",
  },
  approve_exact_change: {
    approve: "Approve solution", reject: "Reject",
    ifApproved: "Exactly this change may be applied in DEV by a person and recorded; JADE reads it back live and the test follows. Anything different is refused.",
    ifRejected: "This exact change is refused. Nothing changes in JD Edwards; JADE can propose a different solution.",
  },
  approve_package: {
    approve: "Approve implementation", reject: "Reject",
    ifApproved: "Exactly this package may be checked in, built and activated in DEV by people, each step recorded. Validation follows.",
    ifRejected: "This package revision is refused. JADE can prepare a new revision with your feedback.",
  },
};

function canOwn(owner: NextAction["owner"], has: (...r: CompanyRole[]) => boolean): boolean {
  if (owner === "jade" || owner === "none") return false;
  if (owner === "admin") return has("admin");
  // Only a CNC operator can record an activation and only a Domain Owner reviews a story;
  // an administrator may also run the Application Manager's operational steps.
  if (owner === "product_manager") return has("product_manager", "admin");
  return has(owner as CompanyRole);
}

/**
 * The Next Action / Decision card: directly under the story header, so a
 * pending decision is never hidden below a thousand words. It shows what
 * is being decided, why it matters, and what happens either way -- and
 * performs the real, governed action.
 */
export function NextActionCard({ ctx }: { ctx: StoryCtx }) {
  const { change, reload } = ctx;
  const info = useSessionInfo();
  const lc = change.lifecycle;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [domainId, setDomainId] = useState("");
  useEffect(() => { setError(null); }, [lc?.nextAction.action, lc?.phase]);

  // A Domain Owner opening a story that is ready for review starts the
  // review (bookkeeping only, not a decision), as the old review screen did.
  useEffect(() => {
    if (ctx.domainReview?.stage === "ready_for_domain_owner" && change.businessDomainId && info.has("domain_owner")) {
      api.startDomainOwnerReview(change.id, { note: "" }).then((r) => { ctx.setDomainReview(r); reload(); }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.domainReview?.stage, change.id]);

  if (!lc) return null;
  const na = lc.nextAction;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); reload(); } catch (e) { setError(e); } finally { setBusy(false); }
  }

  const story = (lc?.phase === "story_review" ? ctx.domainReview?.history[ctx.domainReview.history.length - 1]?.userStory : undefined) ?? change.userStory;
  const decisionIntro = (
    <>
      <p style={{ marginTop: 0 }}><strong>{change.title}</strong> <span className="mono muted">{change.id}</span></p>
      {story?.statement && <p className="muted" style={{ fontSize: 14 }}>{story.statement}</p>}
    </>
  );

  /* ---------------- done / closed ---------------- */
  if (lc.phase === "done") {
    const title = lc.outcome === "rejected" ? "Not proceeding" : lc.outcome === "resolved_without_change" ? "Resolved without a change" : "Delivered";
    return (
      <section className={`nextcard done ${lc.outcome ?? ""}`} id="next-action" aria-label="Status">
        <div className="nextcard-kicker">{title}</div>
        <div className="nextcard-summary">{na.summary}</div>
        {lc.openItems.length > 0 && <ul className="nextcard-items">{lc.openItems.map((i) => <li key={i}>{i}</li>)}</ul>}
        {lc.outcome === "delivered" && <Link to={storyPath(change.id, "delivery", "release")}>View the delivery and as-built record</Link>}
      </section>
    );
  }

  /* ---------------- JADE is working ---------------- */
  if (na.owner === "jade") {
    return (
      <section className="nextcard working" id="next-action" aria-label="Next action">
        <JadeWorking>{na.summary}</JadeWorking>
        <div className="nextcard-note">No action is required from you. This page updates by itself.</div>
      </section>
    );
  }

  const mine = canOwn(na.owner, info.has);
  const copy = na.action ? DECISION_COPY[na.action] : undefined;
  const risks = change.architectDecision?.dependenciesAndConflicts ?? [];

  /* ---------------- someone else owns it ---------------- */
  if (!mine) {
    const withAm = !info.appManagement && ["product_manager", "cnc_operator", "admin"].includes(na.owner);
    return (
      <section className="nextcard waiting" id="next-action" aria-label="Next action">
        <div className="nextcard-kicker">Waiting for: {withAm ? "Application Management" : na.ownerLabel || "someone else"}</div>
        <div className="nextcard-summary">{withAm ? `The approved story is with the Application Manager (${lc.phaseLabel}).` : na.summary}</div>
        <div className="nextcard-note">You can follow progress here; nothing is needed from you.</div>
      </section>
    );
  }

  /* ---------------- the controls ---------------- */
  // Gate decisions and delivery steps are taken on their own screens, as in
  // the original process: the Domain Owner's in User Story Review, the
  // Application Manager's in Application Management. The card says what is
  // needed and opens the right screen on this story.
  const gate = na.action ? gateFor(na.action, change.id) : undefined;
  let controls: ReactNode = null;
  if (gate) controls = <Link className="btn primary" to={gate.to}>Open in {gate.screen}</Link>;
  else switch (na.action) {
    case "start_analysis":
      controls = <button className="btn primary" disabled={busy} onClick={() => act(() => api.enhanceStory(change.id))}>{busy ? "Starting…" : "Start analysis"}</button>;
      break;
    case "assign_domain":
      controls = (
        <div className="btnrow">
          <label className="sr-only" htmlFor="assign-domain">Business domain</label>
          <select id="assign-domain" value={domainId} onChange={(e) => setDomainId(e.target.value)}>
            <option value="">Choose a business domain…</option>
            {info.domains.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="btn primary" disabled={busy || !domainId}
                  onClick={() => act(async () => { ctx.setDomainReview(await api.assignBusinessDomain(change.id, { businessDomainId: domainId })); })}>
            Assign domain</button>
        </div>
      );
      break;
    case "rerun_solutioning":
      controls = <button className="btn primary" disabled={busy} onClick={() => act(() => api.retriggerArchitectureReview(change.id))}>Run solutioning</button>;
      break;
    case "clarify":
      controls = <Link className="btn primary" to={storyPath(change.id, "story", "ask")}>Answer JADE's question</Link>;
      break;
    default:
      controls = na.tab !== "overview" ? <Link className="btn" to={storyPath(change.id, na.tab)}>Open</Link> : null;
  }

  const isDecision = na.kind === "decision";
  return (
    <section className={`nextcard ${isDecision ? "decision" : "task"} ${lc.health}`} id="next-action" aria-label={isDecision ? "Decision needed" : "Next action"}>
      <div className="nextcard-kicker">{isDecision ? "Decision needed" : lc.health === "failed" ? "Needs attention" : "Next step"}</div>
      <div className="nextcard-summary">{na.summary}</div>
      {isDecision && (
        <dl className="nextcard-facts">
          <div><dt>Business priority</dt><dd>{change.priority}</dd></div>
          {(na.action === "approve_design" || na.action === "approve_exact_change" || na.action === "approve_package") && (
            <div><dt>Delivery risk</dt><dd>{risks.length ? `Could affect: ${risks.join("; ")}` : "No conflicts identified"}</dd></div>
          )}
          {change.complexitySignal !== "Unknown" && <div><dt>Complexity</dt><dd>{change.complexitySignal} (JADE's estimate)</dd></div>}
        </dl>
      )}
      {na.effect && <p className="nextcard-effect"><strong>{isDecision ? "If approved: " : "What happens: "}</strong>{na.effect}</p>}
      {isDecision && copy?.ifRejected && <p className="nextcard-effect muted"><strong>If not: </strong>{copy.ifRejected}</p>}
      {lc.openItems.length > 0 && lc.health !== "waiting_decision" && (
        <ul className="nextcard-items">{lc.openItems.map((i) => <li key={i}>{i}</li>)}</ul>
      )}
      {controls && <div className="btnrow nextcard-actions">{controls}</div>}
      {isDecision && (
        <Link className="asklink" to={storyPath(change.id, na.tab === "story" ? "story" : "solution", "ask")}>
          Ask JADE about this {na.tab === "story" ? "story" : "solution"}…
        </Link>
      )}
      {error !== null && <ErrorState error={error} title="Not done" />}
      {dialog && (
        <ConfirmDialog
          title={dialog.title} intro={dialog.intro ?? decisionIntro} whatHappensNext={dialog.next} confirmLabel={dialog.confirm}
          tone={dialog.tone} requireNote={dialog.requireNote} showReasonCode={dialog.reasonCode}
          onCancel={() => setDialog(null)}
          onConfirm={async (note, reason) => {
            const d = dialog; setDialog(null);
            await act(() => d.run(note, reason));
          }}
        />
      )}
    </section>
  );
}

/** Where each gate decision or delivery step is taken (the original screens). */
const GATES: Record<string, { screen: string; path: string }> = {
  review_story: { screen: "User Story Review", path: "/stories/review" },
  authorise_delivery: { screen: "Backlog Review", path: "/am/backlog-review" },
  approve_exact_change: { screen: "Architecture Review", path: "/am/architecture-review" },
  approve_design: { screen: "Architecture Review", path: "/am/architecture-review?view=design" },
  approve_package: { screen: "Delivery", path: "/am/technical" },
  start_technical_prepare: { screen: "Delivery", path: "/am/technical" },
  start_technical_repair: { screen: "Delivery", path: "/am/technical" },
  record_technical_apply: { screen: "Delivery", path: "/am/technical" },
  record_technical_build: { screen: "Delivery", path: "/am/technical" },
  record_cnc: { screen: "Delivery", path: "/am/technical" },
  record_technical_verify: { screen: "Delivery", path: "/am/technical" },
  record_applied: { screen: "Delivery", path: "/am/technical" },
  run_or_record_test: { screen: "Delivery", path: "/am/technical" },
  reconcile_technical: { screen: "Delivery", path: "/am/technical" },
  reconcile_functional: { screen: "Architecture Review", path: "/am/architecture-review" },
  finalise_asbuilt: { screen: "As-Built", path: "/am/as-built" },
};

export function gateFor(action: string, storyId: string): { screen: string; to: string } | undefined {
  const g = GATES[action];
  return g && { screen: g.screen, to: `${g.path}${g.path.includes("?") ? "&" : "?"}story=${encodeURIComponent(storyId)}` };
}

/** The exact functional change in one readable line (decision dialogs, Solution tab). */
export function ExactChangeSummary({ ctx }: { ctx: StoryCtx }) {
  const ec = ctx.change.exactChange;
  if (!ec) return null;
  return (
    <div className="exactline">
      In <strong>{ec.application}</strong> version <strong>{ec.version}</strong>, processing option <strong>{ec.option}</strong>{" "}
      changes {ec.currentValue ? <>from <span className="mono">{ec.currentValue}</span> </> : null}to <span className="mono strong">{ec.proposedValue}</span>
      {" "}in {ec.environment}.
    </div>
  );
}

