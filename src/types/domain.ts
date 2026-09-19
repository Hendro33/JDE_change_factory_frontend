/**
 * Domain model for the JDE Change Factory.
 *
 * These types mirror the artefacts defined in the ConsultIQ design
 * document (Sections 6.1-6.6). They are the contract between this UI
 * and the Python/FastAPI backend that will eventually serve them.
 *
 * Nothing in here is UI-specific on purpose: when the mock service is
 * swapped for real REST calls, these types should not need to change.
 */

/* ------------------------------------------------------------------ */
/* Tenancy                                                             */
/* ------------------------------------------------------------------ */

/**
 * A customer engagement. Every Change belongs to exactly one.
 *
 * Each customer has its own JDE estate, its own Tools Release, and its
 * own approved scope (design doc Appendix D/E) — which is why scope is
 * a property of the customer, not a global setting.
 */
export interface Customer {
  id: string;
  name: string;
  /** Short form for the header chip. */
  shortName: string;
  toolsRelease: string;
  /** Which JDE environment this engagement's pilot targets. */
  environment: string;
}

export type UserRole =
  | "Application Manager"
  | "Product Owner"
  | "ConsultIQ Consultant"
  | "JDE CNC";

/**
 * The authenticated user and what they can reach.
 *
 * `customers` is the ENTITLEMENT list, resolved server-side from the
 * authenticated identity. The client never assembles this list itself,
 * and the server re-checks every request against it — a customer id
 * sent by the browser is a request, not a permission.
 */
export interface Session {
  userId: string;
  displayName: string;
  role: UserRole;
  customers: Customer[];
  activeCustomerId: string;
}

/** Where the original request came from (design doc Section 3.1). */
export type ChangeSource = "Business" | "Support / Topdesk" | "Optimisation" | "DevOps";

/**
 * The lifecycle states (design doc Section 16.1).
 * A change is always in exactly one of these.
 */
export type LifecycleState =
  | "RECEIVED"
  | "REFINING"
  | "BACKLOG_READY"
  | "APPROVED"
  | "REJECTED"
  | "RESOLVED_WITHOUT_CHANGE"
  | "ARCHITECTING"
  | "SPEC_READY"
  | "CHANGE_APPROVED"
  | "EXECUTING"
  | "TESTING"
  | "VALIDATED"
  | "CNC_HANDOFF"
  | "CLOSED"
  | "FAILED";

export type Priority = "High" | "Medium" | "Low";
export type Complexity = "Low" | "Medium" | "High" | "Unknown";

/** Which route the Architect selected (design doc Section 4.3). */
export type ImplementationRoute =
  | "Functional Agent"
  | "Technical Agent"
  | "Human Implementation"
  | "Resolve without Change";

export type ChangeType =
  | "Configuration"
  | "Functional Change"
  | "Technical Change"
  | "Investigation"
  | "Other";

/**
 * The five business impact criteria (design doc Section 3.6).
 * An empty string means "not stated" — which is a legitimate, honest
 * answer. The UI must render it as such, never as a zero or a guess.
 */
export interface BusinessImpact {
  financialImpact: string;
  operationalReach: string;
  riskCompliance: string;
  strategicAlignment: string;
  urgency: string;
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  /** Which test step verifies this criterion, if any. */
  verifiedBy?: string;
}

export interface TestStep {
  id: string;
  action: string;
  expected: string;
}

/** Design doc Section 6.1. */
export interface UserStory {
  statement: string;
  businessContext: string;
  acceptanceCriteria: AcceptanceCriterion[];
  testScript: TestStep[];
  /** Questions the Improve Agent could not resolve on its own. */
  openQuestions: string[];
  qualityStatus: "draft" | "needs_revision" | "passed" | "needs_human_input";
  revisionCount: number;
}

/** Design doc Section 6.2. */
export interface ArchitectDecision {
  recommendedRoute: ImplementationRoute;
  /** 0-1. Below threshold the Architect must escalate rather than guess. */
  confidence: number;
  existingFunctionalityFound: string;
  /** The "why not?" sequence — what was ruled out, and why. */
  alternativesConsidered: { approach: string; whyNot: string }[];
  objectsAffected: string[];
  dependenciesAndConflicts: string[];
  rollbackStrategy: string;
  decidedAt: string;
}

/** Design doc Section 6.2 / 7.3.1. */
export interface ImplementationSpecification {
  sequence: string[];
  requiredMcpOperations: string[];
  humanActionsRequired: string[];
  validationApproach: string;
}

/**
 * The exact operation that will execute. Design doc Section 6.5.
 * This is deliberately a discrete object, not a status field: approval
 * is bound to this exact content by hash, and any difference at
 * execution time is refused.
 */
export interface ExactChange {
  tool: string;
  application: string;
  version: string;
  option: string;
  currentValue: string;
  proposedValue: string;
  environment: string;
  testOrchestration: string;
}

/**
 * Design doc Section 6.5. An approval is a record of a person agreeing
 * to one specific operation, not a flag on the change.
 */
export interface ApprovalRecord {
  approvalId: string;
  kind: "story" | "change";
  status: "pending" | "approved" | "rejected";
  /** Hash of the exact operation approved. Fails closed on mismatch. */
  changeHash?: string;
  approvedBy?: string;
  approvedAt?: string;
  expiresAt?: string;
  note?: string;
}

/** Design doc Section 6.6. */
export interface TestSpecification {
  mode:
    | "JDE automated"
    | "Integration automated"
    | "Human executable"
    | "Mixed"
    | "Not automatable";
  orchestrationName?: string;
  steps: TestStep[];
}

export interface TestResult {
  outcome: "pass" | "fail" | "not run";
  ranAt?: string;
  detail?: string;
}

/** Design doc Section 6.4 — append-only and hash-chained. */
export interface EvidenceRecord {
  entryId: string;
  stage: string;
  detail: string;
  actor: string;
  agentVersions?: Record<string, string>;
  capturedAt: string;
  prevHash: string;
  entryHash: string;
}

/** Design doc Section 6.3. */
export interface ClosureRecord {
  whatChanged: string;
  businessFacingResult: string;
  limitations: string;
  sourceUpdateStatus: "written back" | "hand-off produced" | "not applicable";
  requesterConfirmation: "solved" | "not solved" | "awaiting response";
  closedAt?: string;
}

/** The central object of the application. */
export interface Change {
  id: string;
  /** The engagement this change belongs to. Server-enforced, not client-chosen. */
  customerId: string;
  title: string;
  source: ChangeSource;
  sourceReference: string;
  originalRequest: string;
  changeType: ChangeType;
  state: LifecycleState;
  priority: Priority;
  complexitySignal: Complexity;
  businessImpact: BusinessImpact;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;

  userStory?: UserStory;
  storyApproval?: ApprovalRecord;
  architectDecision?: ArchitectDecision;
  implementationSpec?: ImplementationSpecification;
  exactChange?: ExactChange;
  changeApproval?: ApprovalRecord;
  testSpecification?: TestSpecification;
  testResult?: TestResult;
  humanValidation?: { validatedBy: string; validatedAt: string; note: string };
  evidence: EvidenceRecord[];
  closure?: ClosureRecord;
}

/** Dashboard metrics — computed from change records, never hard-coded. */
export interface FactoryMetrics {
  totals: { label: string; value: number; delta: number }[];
  pipeline: { stage: string; count: number }[];
  changeTypes: { type: ChangeType; count: number }[];
  businessImpactBreakdown: { category: string; count: number }[];
  performance: {
    averageCycleTimeDays: number;
    averageCycleTimeDelta: number;
    firstTimeSuccessRate: number;
    firstTimeSuccessDelta: number;
    humanApprovals: number;
    humanRejections: number;
    changeVolume: number;
    changeVolumeDelta: number;
  };
}

export interface ActivityEntry {
  time: string;
  changeId: string;
  description: string;
  state: LifecycleState;
  updatedBy: string;
}
