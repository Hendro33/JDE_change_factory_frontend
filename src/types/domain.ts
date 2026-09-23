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
  /**
   * This user's roles on THIS company specifically — a user can hold
   * different roles on different companies. See CompanyRole's own
   * comment for what each role means. Only meaningful in real
   * (non-mock) mode; the mock service leaves this empty since its own
   * persona picker already governs what it shows.
   */
  roles: CompanyRole[];
}

/**
 * Four roles, each mapping onto an existing responsibility rather than
 * a new concept. Values are snake_case exactly as the backend sends
 * them — pydantic's camelCase alias generator (models/base.py) only
 * renames FIELD names, never string VALUES inside a field, so these
 * are NOT camelCased on the wire.
 *   - domain_owner: existing Domain Owner intervention/approval
 *     workflow, scoped to the business domains this membership is
 *     assigned to.
 *   - product_manager: existing Application Manager sprint/build
 *     decision.
 *   - admin: company user management, invitations, access
 *     assignments, settings and integrations (Jira). Does NOT confer
 *     business approval or agent-execution authority on its own.
 *   - dashboard_viewer: read-only.
 * A user can hold more than one role on the same company.
 */
export type CompanyRole = "domain_owner" | "product_manager" | "admin" | "dashboard_viewer";

export type UserRole = string;

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
  email: string;
  /** Display-only, deprecated: the active company's roles, joined.
   * Real permission checks use Customer.roles for a specific company. */
  role: UserRole;
  customers: Customer[];
  activeCustomerId: string;
}

/** Where the original request came from (design doc Section 3.1). */
export type ChangeSource = "Business" | "Support / Topdesk" | "Optimisation" | "DevOps" | "Jira";

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
  /** Explicit constraints/rules the source actually stated — empty means none were stated, never a guess. */
  businessRules: string[];
  /** Things Jade is treating as true because the source implies them, flagged for the Domain Owner to confirm — distinct from openQuestions. */
  assumptions: string[];
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

/** One completed Architecture Review run's reasoning — append-only, same evidence convention as StoryVersion. */
export interface ArchitectAnalysisVersion {
  architectDecision: ArchitectDecision;
  implementationSpec: ImplementationSpecification;
  note: string;
  capturedAt: string;
}

/**
 * The full Architecture Review run for one story — history (every
 * completed analysis, never overwritten) and conversation ("Ask Jade
 * about this solution" turns). architectDecision/implementationSpec at
 * the top level always mirror history's newest entry, kept for
 * whatever already reads them off Change directly.
 */
export interface ArchitectureReviewRun {
  storyId: string;
  stage: "analyzing" | "done" | "failed";
  startedAt: string;
  updatedAt: string;
  architectDecision?: ArchitectDecision;
  implementationSpec?: ImplementationSpecification;
  error?: string;
  history: ArchitectAnalysisVersion[];
  conversation: ConversationTurn[];
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
  /**
   * Functional Agent design update -- what capability this operation
   * executes under, and whether it is currently ALLOWED to execute at
   * all, independent of whether a human has approved this specific
   * operation. Undefined means this change predates the capability
   * catalogue.
   */
  capabilityId?: string;
  capabilityStatus?: CapabilityStatus;
  capabilityExecutable?: boolean;
}

export type CapabilityStatus = "validated" | "needs_spike" | "restricted" | "human_implementation" | "suspended";

/**
 * One entry in the Functional Agent Capability Catalogue -- a bounded,
 * repeatable operation the agent may (once Validated) be authorised to
 * execute, distinct from its broader functional remit. Read-only: the
 * agent cannot promote its own capabilities, and neither can this UI.
 */
export interface CapabilityValidation {
  status: CapabilityStatus;
  technicalValidation: string;
  policyRestriction: string;
  evidenceReferences: string[];
  validationDate?: string | null;
  approver?: string | null;
  revalidationTriggers: string[];
}

export interface Capability {
  capabilityId: string;
  revision: string;
  priority: number;
  family?: string | null;
  identity: Record<string, unknown>;
  target: Record<string, unknown>;
  compatibility: Record<string, unknown>;
  execution: Record<string, unknown>;
  scope: Record<string, unknown>;
  risk: Record<string, unknown>;
  preconditions: Record<string, unknown>;
  verification: Record<string, unknown>;
  recovery: Record<string, unknown>;
  delivery: Record<string, unknown>;
  validation: CapabilityValidation;
}

export interface CapabilityCatalog {
  catalogRevision: string;
  capabilities: Capability[];
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
  /** Sent back as expectedRevision on a status change -- see services/saveErrors.ts. */
  revision: number;
  updatedAt?: string;
  updatedBy?: string;
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
 * One turn of "Ask Jade about this requirement" or "Ask Jade about
 * this solution" — collaboration scoped to one artefact, never a
 * general chatbot. "explanation" never changes anything.
 * "proposed_amendment" (requirement side only) is a full draft for a
 * human to review — never applied automatically, only ever through the
 * existing governed edit flow (StoryVersion/history above), after
 * explicit human action. "recommend_reanalysis" (solution side only)
 * has no draft payload at all — the Architect can't produce an inline
 * one the way Improve does, so it only ever points back at re-running
 * Architecture Review.
 */
export interface ConversationTurn {
  turnId: string;
  askedBy: string;
  question: string;
  answer: string;
  kind: "explanation" | "proposed_amendment" | "recommend_reanalysis";
  proposedUserStory?: UserStory;
  askedAt: string;
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
  /** "Ask Jade about this requirement" — append-only, same evidence convention as history. */
  conversation: ConversationTurn[];
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
   * Free-form context carried verbatim from the source connector (e.g.
   * Jira's Work Type / Priority / Request Type) — imported for display
   * only. Never used by this UI or the backend to decide routing.
   * Absent/empty for anything not sourced through a connector that
   * populates it.
   */
  sourceMetadata?: Record<string, string>;

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

/* ------------------------------------------------------------------ */
/* Auth: login, company membership, invitations                      */
/* ------------------------------------------------------------------ */

export interface MeOut {
  userId: string;
  email: string;
  displayName: string;
}

export interface ForgotPasswordResult {
  ok: boolean;
  /** Only ever populated in dev-preview mode (no real email provider
   * configured yet) and only when the account exists. Never populated
   * once real email delivery is wired up. */
  previewUrl?: string | null;
}

export type MembershipStatus = "active" | "inactive";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface MembershipOut {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  status: MembershipStatus;
  roles: CompanyRole[];
  domainIds: string[];
}

export interface InvitationOut {
  id: string;
  email: string;
  roles: CompanyRole[];
  domainIds: string[];
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  invitedByDisplayName: string;
  /** Only present immediately after creation/resend, and only in
   * dev-preview mode — see ForgotPasswordResult's own comment. */
  previewUrl?: string | null;
}

export interface CompanyUsersOut {
  members: MembershipOut[];
  invitations: InvitationOut[];
}

export interface InviteInput {
  email: string;
  roles: CompanyRole[];
  domainIds: string[];
}

export interface UpdateMembershipInput {
  roles: CompanyRole[];
  domainIds: string[];
}

export interface AcceptInvitationInput {
  token: string;
  /** Required only for a brand-new account (no existing user with
   * this email) -- see InvitationPreview.requiresPassword. */
  password?: string;
  displayName?: string;
}

export interface InvitationPreview {
  email: string;
  companyName: string;
  roles: CompanyRole[];
  requiresPassword: boolean;
  valid: boolean;
  reason?: string | null;
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
  /** Catalogue capability this approval is bound to; empty on older records. */
  capabilityId?: string;
  application: string;
  version: string;
  options: string[];
  allowedValues: string[];
  notes: string;
}

/**
 * A dated, explicitly approved experiment allowing a capability that
 * is not yet customer-DEV validated to run once in DEV. Enforced by the
 * execution gate: an expired or undated experiment allows nothing.
 * approvedBy/approvedAt are stamped by the server, never typed.
 */
export interface SpikeExperiment {
  capabilityId: string;
  capabilityRevision: string;
  application: string;
  version: string;
  option: string;
  environment: string;
  /** ISO-8601 with timezone. */
  expiresAt: string;
  note: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface FunctionalAgentScope {
  approvedVersions: ApprovedVersion[];
  spikeExperiments?: SpikeExperiment[];
  /** Reference only -- not read by the execution gate. */
  neverTouchCategories: string[];
  /** Reference only -- approval authority comes from roles and the approval policy. */
  approvers: string[];
}

/** Which JDE DEV environment this company's writes are bound to. */
export interface EnvironmentBinding {
  devEnvironmentId: string;
  devPathCode: string;
  aisDataSourceName: string;
  isolationConfirmed: boolean;
  isolationEvidence: string;
  isolationConfirmedBy?: string;
  isolationConfirmedAt?: string;
}

export interface TechnicalAgentScope {
  authorizedObjectTypes: string[];
  reservedProductCode: string;
  namingPrefix: string;
  approvers: string[];
}

export type ApproverRole = "admin" | "product_manager" | "domain_owner";

/**
 * Who may approve an exact change for this company, and for how long
 * the approval stays valid. Enforced at approval and again immediately
 * before execution; absent means nobody can approve and nothing runs.
 */
export interface ApprovalPolicy {
  policyVersion: 1;
  exactChangeApproverRoles: ApproverRole[];
  /** 1-168. */
  approvalValidHours: number;
}

export interface EngagementScope {
  customerId: string;
  toolsRelease: string;
  environment?: EnvironmentBinding;
  functionalAgent: FunctionalAgentScope;
  technicalAgent: TechnicalAgentScope;
  approvalPolicy?: ApprovalPolicy | null;
  /** 0 means never saved. */
  revision: number;
  /** Absent means "never configured" — distinct from an explicitly empty, saved scope. */
  updatedAt?: string;
  /** The signed-in user who saved it -- set by the server. */
  updatedBy?: string;
}

export interface EngagementScopeUpdateInput {
  toolsRelease: string;
  environment?: EnvironmentBinding;
  functionalAgent: FunctionalAgentScope;
  technicalAgent: TechnicalAgentScope;
  approvalPolicy?: ApprovalPolicy | null;
  /** The revision this edit was based on (0 when creating). */
  expectedRevision: number;
}

/**
 * Dashboard KPI alert colours, shared by every user of the company and
 * saved on the server (Admin only). configured=false means the defaults
 * are in use and nothing has been saved yet.
 */
export interface DashboardThresholds {
  /** A KPI count strictly above this turns orange. */
  warnAt: number;
  /** A KPI count strictly above this turns red (takes precedence over warnAt). */
  criticalAt: number;
  configured: boolean;
  revision: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface DashboardThresholdsUpdateInput {
  warnAt: number;
  criticalAt: number;
  expectedRevision: number;
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

/* ------------------------------------------------------------------ */
/* Jira Service Management hand-off                                    */
/* ------------------------------------------------------------------ */

/**
 * Per-customer, human-authored connector configuration — mirrors
 * EngagementScope's own customer-scoping. The credential (email + API
 * token) is NEVER part of this shape; see JiraCredentialsUpdateInput
 * for how it's entered, and JiraConnectionStatus for its presence
 * only, never its value.
 */
export interface JiraIntegrationConfig {
  customerId: string;
  baseUrl: string;
  projectKey: string;
  /** The Jira workflow status a human moves a ticket to once ITSM has decided it's genuine change demand for Jade, e.g. "Ready for Jade". */
  pickupStatus: string;
  /** The status Jade transitions the ticket to once intake has durably succeeded, e.g. "Jade - In Progress". */
  postPickupStatus: string;
  /** The Jira custom field id Jade writes its own Change Request id into. */
  jadeIdField: string;
  /** Optional Jira custom field id for JSM's own Request Type, imported into sourceMetadata for display only. */
  requestTypeField: string;
  /** 0 means never saved. */
  revision: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface JiraIntegrationConfigUpdateInput {
  baseUrl: string;
  projectKey: string;
  pickupStatus: string;
  postPickupStatus: string;
  jadeIdField: string;
  requestTypeField: string;
  expectedRevision: number;
}

/**
 * Entering/replacing this customer's Jira email + API token — Admin >
 * Integrations > Jira. PILOT-SCOPED, deliberately simple: persisted
 * server-side as plain configuration (not a secrets manager), never
 * returned by any endpoint. See JiraConnectionStatus for the only
 * thing any GET ever reports back about it.
 */
export interface JiraCredentialsUpdateInput {
  email: string;
  apiToken: string;
}

/**
 * Deliberately stateless: checks whatever is currently typed in the
 * form (site URL, project key, email, API token), whether or not it
 * has been saved yet, and never persists it.
 */
export interface JiraTestConnectionInput {
  baseUrl: string;
  projectKey?: string;
  email: string;
  apiToken: string;
}

/** Always safe to render as-is — the backend never includes the token in this message. */
export interface JiraTestConnectionResult {
  ok: boolean;
  message: string;
}

/** Status only — NEVER a credential. credentialsConfigured reflects THIS customer's own saved Jira credential, never its value. */
export interface JiraConnectionStatus {
  mockMode: boolean;
  credentialsConfigured: boolean;
  configConfigured: boolean;
}

export interface JiraSyncError {
  issueKey: string;
  message: string;
}

export interface JiraSyncResult {
  considered: number;
  imported: string[];
  updatedInJira: string[];
  errors: JiraSyncError[];
}
