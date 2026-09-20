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
  kind: "story" | "change" | "domain_owner" | "application_manager";
  status: "pending" | "approved" | "rejected";
  /** Hash of the exact operation approved. Fails closed on mismatch. */
  changeHash?: string;
  approvedBy?: string;
  approvedAt?: string;
  expiresAt?: string;
  note?: string;
  /**
   * The resolved Identity id behind approvedBy, where the endpoint that
   * recorded this had one. Additive attribution, not a replacement for
   * approvedBy — never itself an access-control decision (full RBAC is
   * still a target-architecture NFR). Absent on change_service.py's
   * exact-change ApprovalRecord, which is assembled from mcp_server's
   * own, unmodified approval.py record — that identity attribution
   * lives in DecisionFeedback instead (Admin > Agents' health view).
   */
  identityId?: string;
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

/* ------------------------------------------------------------------ */
/* Business domain ownership and domain-aware governance               */
/* ------------------------------------------------------------------ */

/**
 * The customer's own business taxonomy — distinct from three things it
 * must never be conflated with: the APQC classification itself (apqcCode
 * / level place a domain within APQC, this is not an APQC catalogue
 * entry), customer-specific domain knowledge (that lives on the
 * UserStory, never here), and authorisation (domainOwner is a name for
 * display and record-keeping, like `approvedBy` on an ApprovalRecord —
 * not an access-control list).
 */
export interface BusinessDomain {
  id: string;
  customerId: string;
  apqcCode: string;
  name: string;
  /** APQC Level 2 ("4.4") or Level 3 ("4.4.3") — dotted depth. */
  level: string;
  description: string;
  domainOwner: string;
  status: "active" | "proposed" | "retired";
}

export type DomainReviewStage =
  | "ready_for_domain_owner"
  | "domain_owner_reviewing"
  | "domain_owner_requested_revision"
  | "reviewer_agent_refining"
  | "domain_owner_approved"
  /** Terminal: the Domain Owner decided the requirement itself should not
   *  proceed — distinct from a revision request, which stays in play.
   *  Recorded entirely in this sidecar; never reaches mcp_server. */
  | "domain_owner_rejected"
  | "ready_for_application_manager"
  | "application_manager_approved"
  /** Terminal: Gate 1 rejection — the only rejection stage that also
   *  reaches mcp_server (backlog.reject()), same as approval reaching
   *  backlog.approve(). */
  | "application_manager_rejected";

/** One version in the story's evidence trail — never overwritten. */
export interface StoryVersion {
  label: "ai_generated" | "domain_owner_edit" | "reviewer_agent_revision";
  userStory: UserStory;
  note: string;
  actor: string;
  capturedAt: string;
}

/**
 * The Domain Owner / Application Manager governance record for one
 * Change. Workflow rule this enforces: a Domain Owner edit is never
 * silently the approved story —
 *   Domain Owner edit → Reviewer Agent → revised story → Domain Owner approval
 */
export interface DomainReview {
  changeId: string;
  businessDomainId?: string;
  /** Set when a human genuinely cannot place the request confidently — exposed, not guessed away. */
  domainClassificationUncertain: boolean;
  domainClassificationNote: string;
  stage: DomainReviewStage;
  history: StoryVersion[];
  domainOwnerApproval?: ApprovalRecord;
  applicationManagerApproval?: ApprovalRecord;
  updatedAt: string;
}

/**
 * The Delivery Queue (Increment: Continuous Delivery Flow) — the set
 * of approved changes Jade is authorised to work on. Deliberately NOT
 * a Sprint: no start/end date, no capacity, no planning ceremony. One
 * entry per change, added by exactly one human decision (Application
 * Manager approval).
 */
export interface DeliveryQueueEntry {
  changeId: string;
  customerId: string;
  position: number;
  status: "queued" | "in_progress" | "blocked";
  deliveryType?: string;
  currentOwner?: string;
  blockedReason?: string;
  addedBy: string;
  addedAt: string;
  note: string;
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

  /**
   * Live status of an in-flight Receive -> Improve -> Check run
   * (design doc Section 12.1). Presentational only: undefined once
   * there is no run associated with this change, or once it has
   * finished and been folded into userStory/state below.
   */
  processingStage?: "receiving" | "improving" | "checking" | "done" | "failed";
  processingError?: string;

  /**
   * Business domain governance (Section 2/3). A read-only projection
   * of the DomainReview sidecar for list/filter display — the full
   * record (history, notes, approvals) comes from getDomainReview.
   */
  businessDomainId?: string;
  domainReviewStage?: DomainReviewStage;

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

/**
 * One dashboard total. `key` is a stable identifier the UI maps to a
 * work queue + filter (see DASHBOARD_METRIC_ROUTES) — labels can be
 * reworded without breaking that navigation.
 */
export interface Total {
  key: string;
  label: string;
  value: number;
  delta: number;
}

/** Dashboard metrics — computed from change records, never hard-coded. */
export interface FactoryMetrics {
  totals: Total[];
  pipeline: { stage: string; count: number }[];
  changeTypes: { type: ChangeType; count: number }[];
  businessImpactBreakdown: { category: string; count: number }[];
  /** Distribution of current changes by business domain — empty where no domain governance data exists for this customer. */
  businessDomainBreakdown: { domainId: string | null; domainName: string; apqcCode: string; count: number }[];
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

/* ------------------------------------------------------------------ */
/* Administration                                                      */
/* ------------------------------------------------------------------ */

/**
 * A structured reason code, additive alongside the free-text `note`
 * every decision already carries — lets future agent-improvement
 * analysis (design doc Section 14.2) aggregate rejections/send-backs
 * without parsing natural language.
 */
export type FeedbackReasonCode =
  | "missing_information"
  | "wrong_business_domain"
  | "incorrect_analysis_or_route"
  | "risk_or_compliance_concern"
  | "duplicate_or_superseded"
  | "other";

export interface IdentitySummary {
  id: string;
  displayName: string;
  role: UserRole;
}

export interface CustomerProfile {
  customer: Customer;
  identities: IdentitySummary[];
}

/** Status only — NEVER a credential. One AIS connection today, shared by every customer. */
export interface AisConnectionStatus {
  mockMode: boolean;
  baseUrlConfigured: boolean;
  environment?: string;
  role?: string;
}

export interface ErpLandscape {
  customerId: string;
  toolsRelease: string;
  environment: string;
  ais: AisConnectionStatus;
  engagementScopeConfigured: boolean;
  scopeGloballySharedNote: string;
}

/**
 * The per-customer, human-authored configuration answering "what is
 * this engagement actually authorised to touch in JDE" — the intended
 * per-customer source for the single global scope.json design doc
 * Appendix D.2/E.2 describes (mcp_server/jde_mcp_server/scope.py).
 */
export interface ApprovedVersion {
  application: string;
  version: string;
  options: string[];
  allowedValues: string[];
  notes: string;
}

export interface FunctionalAgentScope {
  approvedVersions: ApprovedVersion[];
  neverTouchCategories: string[];
  approvers: string[];
}

export interface TechnicalAgentScope {
  authorizedObjectTypes: string[];
  reservedProductCode: string;
  namingPrefix: string;
  approvers: string[];
}

export interface EngagementScope {
  customerId: string;
  toolsRelease: string;
  functionalAgent: FunctionalAgentScope;
  technicalAgent: TechnicalAgentScope;
  /** Absent means "never configured" — distinct from an explicitly empty, saved scope. */
  updatedAt?: string;
  updatedBy?: string;
}

export interface EngagementScopeUpdateInput {
  toolsRelease: string;
  functionalAgent: FunctionalAgentScope;
  technicalAgent: TechnicalAgentScope;
  updatedBy: string;
}

/** One .claude/agents/*.md subagent's declared definition + the driver that invokes it, if any. */
export interface AgentRuntimeConfig {
  driver: string;
  /** Absent means "not set by the driver — falls through to the Claude Agent SDK's own default." */
  model?: string;
  permissionMode: string;
  maxTurns: number;
  allowedTools: string[];
}

export interface AgentDefinition {
  name: string;
  description: string;
  declaredTools: string[];
  /** Content hash of the .md file, computed at read time. */
  version: string;
  fileUpdatedAt: string;
  /** Absent means no api_service driver currently invokes this agent. */
  runtime?: AgentRuntimeConfig;
}

export interface AgentRunSummary {
  runId: string;
  storyId: string;
  stage: "started" | "done" | "failed";
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export interface FeedbackSummary {
  kind: string;
  count: number;
  reasons: Record<string, number>;
}

export interface AgentHealth {
  agentName: string;
  /** Cross-customer — which agent ran and how often is a fact about the agent, not customer data. */
  recentRuns: AgentRunSummary[];
  runCounts: Record<string, number>;
  /** Customer-scoped (the active customer's own decision feedback only). */
  feedback: FeedbackSummary[];
}

export interface IntegrationStatus {
  name: string;
  connected: boolean;
  detail: string;
}

export interface BusinessDomainCreateInput {
  apqcCode: string;
  name: string;
  level: string;
  description?: string;
  domainOwner?: string;
}
