import type { Change } from "../../types/domain";

export const AM_STAGES = [
  { key: "backlog", label: "Awaiting Backlog Review", to: "/am/backlog-review" },
  { key: "architecture", label: "Awaiting Architecture Review", to: "/am/architecture-review" },
  { key: "approved", label: "Approved for Delivery", to: "/am/delivery?queue=approved" },
  { key: "delivery", label: "In Delivery", to: "/am/delivery?queue=delivery" },
  { key: "validation", label: "Awaiting Validation", to: "/am/changes?stage=validation" },
  { key: "asbuilt", label: "Awaiting As-Built", to: "/am/as-built?queue=asbuilt" },
  { key: "release", label: "Ready for Release / CNC", to: "/am/changes?stage=release" },
  { key: "completed", label: "Completed", to: "/am/changes?stage=completed" },
] as const;
export type AmStage = typeof AM_STAGES[number]["key"];

/** Presentation only. The canonical phase, health and next action remain authoritative.
 * Ready for release is a readiness view of delivered stories, not proof of production promotion.
 * It intentionally overlaps Completed: JADE does not track external production deployment.
 */
export function inAmStage(c: Change, stage: AmStage): boolean {
  const lc = c.lifecycle;
  if (!lc) return false;
  const approved = lc.phase === "delivery" && (lc.nextAction.action === "start_technical_prepare" ||
    (c.changeApproval?.status === "approved" && (!c.exactChange?.execution || c.exactChange.execution.writeState === "ready")));
  switch (stage) {
    case "backlog": return lc.nextAction.action === "authorise_delivery";
    case "architecture": return lc.phase === "solutioning" || lc.phase === "solution_review";
    case "approved": return approved;
    case "delivery": return lc.phase === "delivery" && !approved;
    case "validation": return lc.phase === "validation";
    case "asbuilt": return lc.nextAction.action === "finalise_asbuilt";
    case "release": return lc.outcome === "delivered";
    case "completed": return lc.phase === "done" && lc.outcome !== "rejected";
  }
}
