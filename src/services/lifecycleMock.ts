/**
 * Demo mode only (VITE_USE_MOCK_API=true): a small, in-browser stand-in for
 * the backend's canonical lifecycle (services/lifecycle.py) so the sample
 * data shows phase, health and next action the same way the real
 * application does. The real application never uses this file.
 */
import type { Change, Lifecycle, NextAction, Phase, Health, MyWork, CompanyRole } from "../types/domain";
import { PHASES } from "../types/domain";

const HEALTH_LABEL: Record<Health, string> = {
  in_progress: "In progress", waiting_decision: "Waiting for decision", waiting: "Waiting", blocked: "Blocked",
  failed: "Needs attention", done: "Delivered", closed: "Closed",
};
const OWNER_LABEL: Record<string, string> = {
  jade: "JADE", domain_owner: "Domain Owner", product_manager: "Product Owner", cnc_operator: "CNC", admin: "Administrator", none: "",
};

function mk(phase: Phase, health: Health, next: Omit<NextAction, "ownerLabel" | "effect"> & { effect?: string }, extra: Partial<Lifecycle> = {}): Lifecycle {
  return {
    phase, phaseLabel: PHASES.find((p) => p.key === phase)!.label, phaseIndex: PHASES.findIndex((p) => p.key === phase),
    health, healthLabel: HEALTH_LABEL[health],
    nextAction: { effect: "", ...next, ownerLabel: OWNER_LABEL[next.owner] ?? "" },
    deliverySteps: [], openItems: [], simulated: true, ...extra,
  };
}

export function deriveMockLifecycle(c: Change): Lifecycle {
  const jade = (summary: string, tab: NextAction["tab"] = "overview") => ({ kind: "none" as const, summary, owner: "jade" as const, tab });
  switch (c.state) {
    case "RECEIVED":
    case "REFINING":
      if (["receiving", "improving", "checking"].includes(c.processingStage ?? ""))
        return mk("understand", "in_progress", jade("JADE is analysing the request and writing the user story."));
      return mk("understand", "waiting", { kind: "task", summary: "Start JADE's analysis to turn this request into a user story.",
        owner: "product_manager", action: "start_analysis", tab: "overview" });
    case "BACKLOG_READY":
      if (c.domainReviewStage === "ready_for_application_manager" || c.domainReviewStage === "domain_owner_approved")
        return mk("story_review", "waiting_decision", { kind: "decision", summary: "Authorise JADE to work on this approved story.",
          owner: "product_manager", action: "authorise_delivery", tab: "story" });
      return mk("story_review", "waiting_decision", { kind: "decision", summary: "Review the user story and approve it, or ask for changes.",
        owner: "domain_owner", action: "review_story", tab: "story" });
    case "REJECTED":
      return mk("done", "closed", { kind: "none", summary: "Not authorised for delivery.", owner: "none", tab: "overview" }, { outcome: "rejected" });
    case "RESOLVED_WITHOUT_CHANGE":
    case "CLOSED":
    case "VALIDATED":
    case "CNC_HANDOFF":
      return mk("done", "done", { kind: "none", summary: "Delivered and recorded.", owner: "none", tab: "overview" }, { outcome: "delivered" });
    default:
      if (!c.architectDecision) return mk("solutioning", "in_progress", jade("JADE is preparing a solution.", "solution"));
      if (c.exactChange && !c.changeApproval)
        return mk("solution_review", "waiting_decision", { kind: "decision", summary: "Review JADE's proposed solution and its exact change, then approve it.",
          owner: "product_manager", action: "approve_exact_change", tab: "solution" }, { route: c.architectDecision.recommendedRoute });
      return mk("delivery", "in_progress", jade("JADE is applying the approved change in DEV.", "delivery"), { route: c.architectDecision.recommendedRoute });
  }
}

export function withMockLifecycle(c: Change): Change {
  return { ...c, lifecycle: deriveMockLifecycle(c) };
}

export function mockMyWork(all: Change[], roles: CompanyRole[]): MyWork {
  const withLc = all.map(withMockLifecycle);
  const open = withLc.filter((c) => c.lifecycle!.phase !== "done");
  const mine = open.filter((c) => c.lifecycle!.nextAction.kind !== "none" && roles.includes(c.lifecycle!.nextAction.owner as CompanyRole));
  return {
    needsYou: mine,
    waitingOnOthers: open.filter((c) => !mine.includes(c) && !["jade", "none"].includes(c.lifecycle!.nextAction.owner)),
    jadeWorking: open.filter((c) => c.lifecycle!.nextAction.owner === "jade"),
    inProgressCount: open.length,
    completedThisMonth: withLc.filter((c) => c.lifecycle!.phase === "done" && c.lifecycle!.outcome !== "rejected"),
    roles,
  };
}
