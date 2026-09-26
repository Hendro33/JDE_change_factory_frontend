import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../services/api";
import { technicalApi } from "../../services/technicalApi";
import type { CompanyRole, NextAction } from "../../types/domain";
import { ConfirmDialog } from "../../components/ui";
import { ErrorState, JadeWorking, useSessionInfo } from "../../components/design";
import { Link, navigate, storyPath } from "../../router";
import type { StoryCtx } from "./storyContext";

type Dialog = { title: string; intro?: ReactNode; next: string; confirm: string; tone: "primary" | "danger"; requireNote: boolean;
  reasonCode?: boolean; run: (note: string, reason?: string) => Promise<unknown> } | null;

/** What each decision means, in plain words, for the card and its dialog. */
const DECISION_COPY: Record<string, { approve: string; ifApproved: string; ifRejected: string; reject?: string }> = {
  review_story: {
    approve: "Approve story", reject: "Reject requirement",
    ifApproved: "The story goes to the Product Owner, who decides whether JADE may start working on it.",
    ifRejected: "The requirement does not go ahead. Use Request changes instead if the story only needs more work.",
  },
  authorise_delivery: {
    approve: "Authorise delivery", reject: "Do not proceed",
    ifApproved: "JADE starts solutioning: it researches the JD Edwards environment and proposes a solution for your review. Nothing is changed in JD Edwards yet.",
    ifRejected: "The story does not go ahead and is not queued for delivery.",
  },
  approve_design: {
    approve: "Approve solution",
    ifApproved: "JADE prepares the exact implementation in DEV. You approve that exact package separately before anything is applied.",
    ifRejected: "",
  },
  approve_exact_change: {
    approve: "Approve solution", reject: "Reject",
    ifApproved: "JADE may apply exactly this change in DEV and run its test. If anything about it differs at execution, it is refused.",
    ifRejected: "This exact change is refused. Nothing is written to JD Edwards; JADE can propose a different solution.",
  },
  approve_package: {
    approve: "Approve implementation", reject: "Reject",
    ifApproved: "JADE may apply and build exactly this package in DEV. A person still activates it; validation follows.",
    ifRejected: "This package revision is refused. JADE can prepare a new revision with your feedback.",
  },
};

function canOwn(owner: NextAction["owner"], has: (...r: CompanyRole[]) => boolean): boolean {
  if (owner === "jade" || owner === "none") return false;
  if (owner === "admin") return has("admin");
  return has(owner as CompanyRole) || has("admin");
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
  const [cncName, setCncName] = useState("");
  const [cncRef, setCncRef] = useState("");
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

  const currentPackage = ctx.tech?.packages.find((p) => !p.superseded_by);
  const designRevision = ctx.tech?.assignment?.design_revision;
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
    return (
      <section className="nextcard waiting" id="next-action" aria-label="Next action">
        <div className="nextcard-kicker">Waiting for: {na.ownerLabel || "someone else"}</div>
        <div className="nextcard-summary">{na.summary}</div>
        <div className="nextcard-note">You can follow progress here; nothing is needed from you.</div>
      </section>
    );
  }

  /* ---------------- the controls ---------------- */
  let controls: ReactNode = null;
  switch (na.action) {
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
    case "review_story":
      controls = (
        <>
          <button className="btn primary" disabled={busy || ctx.domainReview?.stage !== "domain_owner_reviewing"} onClick={() => setDialog({
            title: "Approve this story?", intro: decisionIntro, next: copy!.ifApproved, confirm: "Approve story", tone: "primary", requireNote: false,
            run: async (note) => ctx.setDomainReview(await api.approveDomainOwnerStory(change.id, { note })),
          })}>Approve story</button>
          <button className="btn" onClick={() => navigate(storyPath(change.id, "story", "revise"))}>Request changes</button>
          <button className="btn quiet danger" disabled={busy || ctx.domainReview?.stage !== "domain_owner_reviewing"} onClick={() => setDialog({
            title: "Reject this requirement?", intro: decisionIntro, next: copy!.ifRejected, confirm: "Reject requirement", tone: "danger",
            requireNote: true, reasonCode: true,
            run: async (note, reason) => ctx.setDomainReview(await api.rejectDomainOwnerStory(change.id, { note, rejectionReason: reason as never })),
          })}>Reject</button>
        </>
      );
      break;
    case "authorise_delivery":
      controls = (
        <>
          <button className="btn primary" disabled={busy} onClick={() => setDialog({
            title: "Authorise JADE to work on this story?", intro: decisionIntro, next: copy!.ifApproved, confirm: "Authorise delivery",
            tone: "primary", requireNote: false, run: (note) => api.approveForDelivery(change.id, { note }),
          })}>Authorise delivery</button>
          <button className="btn quiet danger" disabled={busy} onClick={() => setDialog({
            title: "Stop this story?", intro: decisionIntro, next: copy!.ifRejected, confirm: "Do not proceed", tone: "danger",
            requireNote: true, reasonCode: true, run: (note, reason) => api.rejectForDelivery(change.id, { note, rejectionReason: reason as never }),
          })}>Do not proceed</button>
        </>
      );
      break;
    case "approve_design":
      controls = (
        <>
          <button className="btn primary" disabled={busy || designRevision === undefined} onClick={() => setDialog({
            title: "Approve JADE's proposed solution?", intro: decisionIntro, next: copy!.ifApproved, confirm: "Approve solution",
            tone: "primary", requireNote: false, run: (note) => technicalApi.approveDesign(change.id, designRevision!, note || "approved in the Story Workspace"),
          })}>Approve solution</button>
          <Link className="btn" to={storyPath(change.id, "solution", "ask")}>Request changes</Link>
        </>
      );
      break;
    case "approve_exact_change":
      controls = (
        <>
          <button className="btn primary" disabled={busy} onClick={() => setDialog({
            title: "Approve this solution and its exact change?", intro: <>{decisionIntro}<ExactChangeSummary ctx={ctx} /></>,
            next: copy!.ifApproved, confirm: "Approve solution", tone: "primary", requireNote: false,
            run: (note) => api.approveExactChange(change.id, { note }),
          })}>Approve solution</button>
          <Link className="btn" to={storyPath(change.id, "solution", "ask")}>Request changes</Link>
          <button className="btn quiet danger" disabled={busy} onClick={() => setDialog({
            title: "Reject this exact change?", intro: <>{decisionIntro}<ExactChangeSummary ctx={ctx} /></>, next: copy!.ifRejected,
            confirm: "Reject", tone: "danger", requireNote: true, reasonCode: true,
            run: (note, reason) => api.rejectExactChange(change.id, { note, rejectionReason: reason as never }),
          })}>Reject</button>
        </>
      );
      break;
    case "approve_package":
      controls = (
        <>
          <button className="btn primary" disabled={busy || !currentPackage} onClick={() => setDialog({
            title: `Approve implementation (package revision ${currentPackage?.revision})?`, intro: decisionIntro,
            next: copy!.ifApproved, confirm: "Approve implementation", tone: "primary", requireNote: false,
            run: (note) => technicalApi.approvePackage(change.id, currentPackage!.revision, note),
          })}>Approve implementation</button>
          <Link className="btn" to={storyPath(change.id, "delivery", "implementation")}>Review the implementation</Link>
          <button className="btn quiet danger" disabled={busy || !currentPackage} onClick={() => setDialog({
            title: "Reject this package revision?", intro: decisionIntro, next: copy!.ifRejected, confirm: "Reject", tone: "danger",
            requireNote: true, run: (note) => technicalApi.rejectPackage(change.id, currentPackage!.revision, note),
          })}>Reject</button>
        </>
      );
      break;
    case "start_technical_prepare":
    case "start_technical_execute":
    case "start_technical_verify": {
      const purpose = na.action.replace("start_technical_", "") as "prepare" | "execute" | "verify";
      const label = { prepare: "Prepare the implementation", execute: "Apply and build in DEV", verify: "Run validation" }[purpose];
      controls = <button className="btn primary" disabled={busy} onClick={() => act(() => technicalApi.startRun(change.id, purpose))}>{label}</button>;
      break;
    }
    case "record_cnc":
      controls = (
        <div className="inlineform">
          <input aria-label="Package name" placeholder="Package name" value={cncName} onChange={(e) => setCncName(e.target.value)} />
          <input aria-label="Evidence reference" placeholder="Evidence (ticket or log reference)" value={cncRef} onChange={(e) => setCncRef(e.target.value)} />
          <button className="btn primary" disabled={busy || !cncName.trim() || !cncRef.trim() || !currentPackage}
                  onClick={() => act(() => technicalApi.recordCnc(change.id, currentPackage!.revision, cncName.trim(), cncRef.trim(), "recorded in the Story Workspace"))}>
            Record activation</button>
        </div>
      );
      break;
    case "finalise_asbuilt":
      controls = <Link className="btn primary" to={storyPath(change.id, "delivery", "release")}>Review and finalise</Link>;
      break;
    case "rerun_solutioning":
      controls = <button className="btn primary" disabled={busy} onClick={() => act(() => api.retriggerArchitectureReview(change.id))}>Run solutioning</button>;
      break;
    case "reconcile_technical":
    case "reconcile_functional":
      controls = <Link className="btn primary" to={storyPath(change.id, "technical")}>Open the technical view to reconcile</Link>;
      break;
    case "clarify":
      controls = <Link className="btn primary" to={storyPath(change.id, "solution", "ask")}>Answer JADE's question</Link>;
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

