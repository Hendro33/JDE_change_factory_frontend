/**
 * The seam between this UI and the backend.
 *
 * Every component talks to `api` (exported at the bottom of this file)
 * and never to mock data directly. To connect the real ConsultIQ
 * Change Factory engine later, implement ChangeFactoryApi against
 * FastAPI and swap the one line at the bottom — no component should
 * need to change.
 */

import type {
  ActivityEntry,
  AgentDefinition,
  AgentHealth,
  BusinessDomain,
  BusinessDomainCreateInput,
  CapabilityCatalog,
  Change,
  ArchitectureReviewRun,
  ChangeSource,
  CompanyUsersOut,
  CustomerProfile,
  DeliveryQueueEntry,
  DomainReview,
  DashboardThresholds,
  DashboardThresholdsUpdateInput,
  EngagementScope,
  EngagementScopeUpdateInput,
  PasswordResetLinkOut,
  PreflightResult,
  ReconcileResult,
  ErpLandscape,
  FactoryMetrics,
  FeedbackReasonCode,
  IntegrationStatus,
  InvitationOut,
  InviteInput,
  JiraConnectionStatus,
  JiraCredentialsUpdateInput,
  JiraIntegrationConfig,
  JiraIntegrationConfigUpdateInput,
  JiraSyncResult,
  JiraTestConnectionInput,
  JiraTestConnectionResult,
  MembershipOut,
  Session,
  UpdateMembershipInput,
  UserStory, CustomerInput, Customer } from "../types/domain";

/**
 * The REST endpoints the FastAPI backend is expected to expose.
 * Kept here so the contract is visible in one place while the
 * backend is still being built.
 */
export const API_ENDPOINTS = {
  /**
   * Returns the signed-in user and the customers they may reach.
   * The entitlement list is resolved server-side from the auth token —
   * never supplied or extended by the client.
   */
  getSession: "GET /session",

  listChanges: "GET /changes",
  createChange: "POST /changes",
  getChange: "GET /changes/{id}",

  enhanceStory: "POST /changes/{id}/enhance",
  approveStory: "POST /changes/{id}/approve-story",
  sendStoryBack: "POST /changes/{id}/send-back",

  getBacklog: "GET /backlog",
  approveForBacklog: "POST /changes/{id}/approve",
  rejectChange: "POST /changes/{id}/reject",

  getArchitecture: "GET /changes/{id}/architecture",
  getImplementation: "GET /changes/{id}/implementation",
  getArchitectureReview: "GET /changes/{id}/architecture-review",
  askAboutSolution: "POST /changes/{id}/architecture-review/ask",
  retriggerArchitectureReview: "POST /changes/{id}/architecture-review",

  approveExactChange: "POST /changes/{id}/approve-change",
  rejectExactChange: "POST /changes/{id}/reject-change",
  executeChange: "POST /changes/{id}/execute",
  runTest: "POST /changes/{id}/test",
  validate: "POST /changes/{id}/validate",

  getEvidence: "GET /changes/{id}/evidence",

  getMetrics: "GET /metrics",
  getActivity: "GET /activity",

  listBusinessDomains: "GET /business-domains",
  getDomainReview: "GET /changes/{id}/domain-review",
  assignBusinessDomain: "POST /changes/{id}/domain-review/assign-domain",
  startDomainOwnerReview: "POST /changes/{id}/domain-review/start",
  submitDomainOwnerEdit: "POST /changes/{id}/domain-review/edit",
  approveDomainOwnerStory: "POST /changes/{id}/domain-review/approve",
  rejectDomainOwnerStory: "POST /changes/{id}/domain-review/reject",
  approveForDelivery: "POST /changes/{id}/domain-review/application-manager-approve",
  rejectForDelivery: "POST /changes/{id}/domain-review/application-manager-reject",
  askAboutRequirement: "POST /changes/{id}/domain-review/ask",
  requestRequirementReconsideration: "POST /changes/{id}/domain-review/request-reconsideration",

  listDeliveryQueue: "GET /delivery-queue",

  getCustomerProfile: "GET /admin/customer-profile",
  getErpLandscape: "GET /admin/erp-landscape",
  getDashboardThresholds: "GET /admin/dashboard-thresholds",
  updateDashboardThresholds: "PUT /admin/dashboard-thresholds",
  getExecutionPreflight: "GET /changes/{id}/execution/preflight",
  reconcileExecution: "POST /changes/{id}/execution/reconcile",
  reconcileTestRun: "POST /changes/{id}/execution/reconcile-test",
  getEngagementScope: "GET /admin/engagement-scope",
  updateEngagementScope: "PUT /admin/engagement-scope",
  listAgents: "GET /admin/agents",
  getAgent: "GET /admin/agents/{name}",
  getAgentHealth: "GET /admin/agents/{name}/health",
  listCapabilities: "GET /admin/capabilities",
  createBusinessDomain: "POST /admin/business-domains",
  updateBusinessDomainStatus: "PUT /admin/business-domains/{id}/status",
  listIntegrations: "GET /admin/integrations",
  getJiraIntegration: "GET /admin/jira-integration",
  updateJiraIntegration: "PUT /admin/jira-integration",
  getJiraIntegrationStatus: "GET /admin/jira-integration/status",
  updateJiraCredentials: "PUT /admin/jira-credentials",
  disconnectJiraCredentials: "DELETE /admin/jira-credentials",
  testJiraConnection: "POST /admin/jira-integration/test-connection",
  syncJiraIntegration: "POST /admin/jira-integration/sync",

  listCompanyUsers: "GET /admin/users",
  inviteUser: "POST /admin/users/invite",
  resendInvitation: "POST /admin/users/invitations/{id}/resend",
  revokeInvitation: "POST /admin/users/invitations/{id}/revoke",
  updateMembershipRoles: "PUT /admin/users/{membershipId}/roles",
  issuePasswordResetLink: "POST /admin/users/{membershipId}/password-reset-link",
  deactivateMembership: "POST /admin/users/{membershipId}/deactivate",
  reactivateMembership: "POST /admin/users/{membershipId}/reactivate",
} as const;

/**
 * Every request below is customer-scoped.
 *
 * The active customer travels as an `X-Customer-Id` header, set once by
 * the service layer rather than threaded through every component.
 *
 * SECURITY: the backend must treat that header as an assertion to be
 * checked, not obeyed. On every request it re-resolves the caller's
 * entitlements from the auth token and rejects the call if the header
 * names a customer outside them. A header alone must never widen
 * access — otherwise switching customer becomes a client-side edit.
 */
export const CUSTOMER_SCOPE_HEADER = "X-Customer-Id";

export interface CreateChangeInput {
  title: string;
  source: ChangeSource;
  sourceReference: string;
  originalRequest: string;
  /** Pending uploads (DraftDocuments) to attach; real backend only. */
  attachmentIds?: string[];
}

export interface DecisionInput {
  // No decidedBy: who decided is derived server-side from the
  // authenticated session (never trusted from the client) -- see
  // dependencies.py's own docstring on identity. The mock service
  // derives it from the active persona (session.ts) the same way.
  note: string;
  /** Only meaningful on a rejection — ignored on an approval. */
  rejectionReason?: FeedbackReasonCode;
}

/**
 * The full surface this UI needs. A FastAPI-backed implementation
 * must satisfy exactly this.
 */
export interface ChangeFactoryApi {
  /** Who is signed in, and which customers they may reach. */
  getSession(): Promise<Session>;

  /**
   * Switches the active customer for subsequent calls.
   * Rejects if the customer is not in the caller's entitlements.
   */
  setActiveCustomer(customerId: string): Promise<Session>;

  /** All methods below return data for the ACTIVE customer only. */
  listChanges(): Promise<Change[]>;
  getChange(id: string): Promise<Change | undefined>;
  createChange(input: CreateChangeInput): Promise<Change>;

  /** Runs Receive -> Improve -> Check. Returns the enriched story. */
  enhanceStory(id: string): Promise<Change>;
  sendStoryBack(id: string, input: DecisionInput): Promise<Change>;
  approveStoryForBacklog(id: string, input: DecisionInput): Promise<Change>;

  getBacklog(): Promise<Change[]>;
  approveChange(id: string, input: DecisionInput): Promise<Change>;
  rejectChange(id: string, input: DecisionInput): Promise<Change>;

  /**
   * Approves one exact operation (design doc Section 6.5).
   * Deliberately separate from approveChange: approving a story is not
   * the same decision as approving the specific write it becomes.
   */
  approveExactChange(id: string, input: DecisionInput): Promise<Change>;
  /** Rejects that same exact operation instead — the other half of Section 6.5's Gate 2 decision, already real on the backend (mcp_server's reject_change). */
  rejectExactChange(id: string, input: DecisionInput): Promise<Change>;

  getMetrics(): Promise<FactoryMetrics>;
  getActivity(): Promise<ActivityEntry[]>;

  /** Business domain ownership and domain-aware governance (all scoped to the active customer). */
  listBusinessDomains(): Promise<BusinessDomain[]>;
  /** undefined until the story has reached the backlog and has a user story to review. */
  getDomainReview(changeId: string): Promise<DomainReview | undefined>;
  assignBusinessDomain(
    changeId: string,
    input: { businessDomainId?: string; uncertain?: boolean; note?: string }
  ): Promise<DomainReview>;
  startDomainOwnerReview(changeId: string, input: DecisionInput): Promise<DomainReview>;
  /**
   * Records the Domain Owner's edit AND routes it through the Reviewer
   * Agent before returning — the workflow rule that an edit must never
   * silently become the approved story (Section 4).
   */
  submitDomainOwnerEdit(
    changeId: string,
    input: { note?: string; userStory: UserStory }
  ): Promise<DomainReview>;
  approveDomainOwnerStory(changeId: string, input: DecisionInput): Promise<DomainReview>;
  /**
   * Terminal: the Domain Owner decided the requirement itself should
   * not proceed. Distinct from sendStoryBack/a revision request, which
   * stays in play — this ends it. Recorded in the same sidecar as
   * approval; never reaches Gate 2/mcp_server.
   */
  rejectDomainOwnerStory(changeId: string, input: DecisionInput): Promise<DomainReview>;
  /**
   * Application Manager approval — separate from Domain Owner approval,
   * the only one that clears Gate 2, and the action that adds the
   * change to the Delivery Queue. Not a sprint approval: there is no
   * planning ceremony or capacity behind this, just a queue admission.
   */
  approveForDelivery(changeId: string, input: DecisionInput): Promise<DomainReview>;
  /**
   * Terminal Gate 1 rejection — the one Domain Review rejection that
   * also reaches mcp_server (backlog.reject()), the same real control
   * approveForDelivery clears via backlog.approve(). No Delivery Queue
   * entry is created.
   */
  rejectForDelivery(changeId: string, input: DecisionInput): Promise<DomainReview>;
  /**
   * "Ask Jade about this requirement" — requirement collaboration, not
   * a generic chatbot. Callable by the Domain Owner (mid review) or the
   * Application Manager (on an already-approved requirement, from
   * Architecture Review); the answer is scoped to this one requirement
   * either way. An "explanation" turn never changes anything. A
   * "proposed_amendment" turn is a full draft for a human to review —
   * it is recorded but never applied here; applying one goes through
   * submitDomainOwnerEdit, unchanged, and requesting reconsideration
   * (below) is the only path forward on an already-approved requirement.
   */
  askAboutRequirement(changeId: string, input: { question: string }): Promise<DomainReview>;
  /**
   * The only way back from past Domain Owner approval: reopens Domain
   * Owner review (the existing domain_owner_reviewing stage) so a
   * concern raised via askAboutRequirement — or any other reason — is
   * never a silent amendment, only an explicit human request to
   * reconsider, going through the existing governed flow from there.
   */
  requestRequirementReconsideration(changeId: string, input: DecisionInput): Promise<DomainReview>;

  /**
   * The full Architecture Review run for a story — history (every
   * completed analysis, never overwritten by a re-run) and the "Ask
   * Jade about this solution" conversation. undefined until the story
   * has reached the Delivery Queue (Gate 1 cleared).
   */
  getArchitectureReview(changeId: string): Promise<ArchitectureReviewRun | undefined>;
  /**
   * "Ask Jade about this solution" — Architect-backed, scoped to the
   * solution already analysed for this story, never a generic chatbot.
   * An "explanation" turn never changes anything. A
   * "recommend_reanalysis" turn has no draft to apply — the Architect
   * can't produce one inline the way Improve does — it only ever
   * recommends re-running Architecture Review (the existing manual
   * retrigger), never applies anything itself.
   */
  askAboutSolution(changeId: string, input: { question: string }): Promise<ArchitectureReviewRun>;
  /**
   * The existing manual (re)trigger a recommend_reanalysis turn from
   * askAboutSolution points back at — normally unnecessary, since Gate 1
   * already starts Architecture Review automatically; useful after a
   * failed run, or when new information means the analysis should be
   * redone. Appends a new history entry rather than replacing the prior
   * one. Fire-and-forget on the backend (202) — callers re-fetch
   * getArchitectureReview to see the result once it lands.
   */
  retriggerArchitectureReview(changeId: string): Promise<void>;

  /** The set of approved changes Jade is authorised to work on, in queue order. */
  listDeliveryQueue(): Promise<DeliveryQueueEntry[]>;

  /* -------------------------------------------------------------- */
  /* Administration — Customer Setup, ERP / JDE Landscape, Agents,    */
  /* Business Domains (write path) and Integrations. All scoped to    */
  /* the active customer, same as everything else in this interface. */
  /* -------------------------------------------------------------- */

  /** The active customer's profile plus who is entitled to it. */
  getCustomerProfile(): Promise<CustomerProfile>;
  /** Admin: edit the active customer's own information. */
  updateCustomerProfile(input: CustomerInput): Promise<CustomerProfile>;
  /** Admin: create a new (real, non-demo) customer; the creator becomes its Admin. */
  createCustomer(input: CustomerInput): Promise<Customer>;
  /** JDE connection + engagement-scope status. Never a credential value. */
  getErpLandscape(): Promise<ErpLandscape>;
  /** Read-only: what the execution gate would decide right now. */
  getExecutionPreflight(changeId: string): Promise<PreflightResult>;
  /**
   * Settle an unknown write outcome from the ACTUAL target value. Jade reads
   * it itself where it can (mock mode); otherwise observedValue is what a
   * person read in JDE, with a note.
   */
  reconcileExecution(
    changeId: string,
    input: { observedValue?: string; note: string; evidenceReference?: string }
  ): Promise<ReconcileResult>;
  reconcileTestRun(
    changeId: string, input: { ran: boolean; note: string; evidenceReference: string }
  ): Promise<ReconcileResult>;
  getEngagementScope(): Promise<EngagementScope>;
  updateEngagementScope(input: EngagementScopeUpdateInput): Promise<EngagementScope>;

  /** Dashboard KPI alert colours for the active company -- any member reads, Admin saves. */
  getDashboardThresholds(): Promise<DashboardThresholds>;
  updateDashboardThresholds(input: DashboardThresholdsUpdateInput): Promise<DashboardThresholds>;

  /** The five subagent definitions, parsed live from .claude/agents/*.md. */
  listAgents(): Promise<AgentDefinition[]>;
  getAgentHealth(agentName: string): Promise<AgentHealth>;

  /** The Functional Agent Capability Catalogue -- read-only, never editable from this API. */
  listCapabilities(): Promise<CapabilityCatalog>;

  createBusinessDomain(input: BusinessDomainCreateInput): Promise<BusinessDomain>;
  /** expectedRevision is the domain's revision as loaded; a stale one is refused (saveErrors.ts). */
  updateBusinessDomainStatus(
    domainId: string,
    status: BusinessDomain["status"],
    expectedRevision: number
  ): Promise<BusinessDomain>;

  listIntegrations(): Promise<IntegrationStatus[]>;

  /**
   * Jira Service Management hand-off (Admin > Integrations > Jira).
   * Site/project/status/field configuration is ordinary, customer-scoped
   * settings. The credential (email + API token) is entered separately
   * via updateJiraCredentials, below — never part of this surface;
   * getJiraIntegrationStatus reports only whether one is present.
   */
  getJiraIntegration(): Promise<JiraIntegrationConfig>;
  updateJiraIntegration(input: JiraIntegrationConfigUpdateInput): Promise<JiraIntegrationConfig>;
  getJiraIntegrationStatus(): Promise<JiraConnectionStatus>;
  /**
   * Enters/replaces this customer's Jira email + API token. PILOT-SCOPED
   * (deliberately simple, see docs Section 19.7): the value is accepted
   * here and NEVER echoed back by this or any other call — the return
   * is status only, same as getJiraIntegrationStatus.
   */
  updateJiraCredentials(input: JiraCredentialsUpdateInput): Promise<JiraConnectionStatus>;
  /**
   * "Disconnect" — removes this customer's stored Jira credential
   * entirely (not just blanking it). The connector falls back to mock
   * immediately; site/project/status configuration is left untouched,
   * so reconnecting later doesn't mean re-entering all of it.
   */
  disconnectJiraCredentials(): Promise<JiraConnectionStatus>;
  /**
   * "Test Connection" — checks whatever is currently typed in the form
   * (site URL, project key, email, API token), whether or not it has
   * been saved yet. Always a real call to Jira, regardless of mock
   * mode; never persists anything.
   */
  testJiraConnection(input: JiraTestConnectionInput): Promise<JiraTestConnectionResult>;
  /**
   * Runs the sync handshake once, on demand: finds tickets in the
   * configured pickup status, creates a durable Jade Change Request for
   * each one not already imported, then moves Jira to the configured
   * post-pickup status with the Jade id written back and an acceptance
   * comment. Never triggers Receive -> Improve -> Check itself.
   */
  syncJiraIntegration(): Promise<JiraSyncResult>;

  /**
   * Admin > Users — company member list (active/inactive/pending
   * invitations), inviting, role/domain assignment, deactivate/
   * reactivate, resend/revoke. All require the Admin role on the
   * active company; enforced server-side (dashboard-only in the mock
   * service, which has no real role check of its own).
   */
  listCompanyUsers(): Promise<CompanyUsersOut>;
  inviteUser(input: InviteInput): Promise<InvitationOut>;
  resendInvitation(invitationId: string): Promise<InvitationOut>;
  revokeInvitation(invitationId: string): Promise<InvitationOut>;
  updateMembershipRoles(membershipId: string, input: UpdateMembershipInput): Promise<MembershipOut>;
  /** Admin-issued reset link: the only way to reset a password until an email provider exists. */
  issuePasswordResetLink(membershipId: string): Promise<PasswordResetLinkOut>;
  deactivateMembership(membershipId: string, expectedRevision: number): Promise<MembershipOut>;
  reactivateMembership(membershipId: string, expectedRevision: number): Promise<MembershipOut>;
}

// ---------------------------------------------------------------------
// Which implementation the app uses.
//
// Phase 1 default is still the mock, so nothing breaks without a .env
// file. Set VITE_USE_MOCK_API=false to point the app at the real
// FastAPI backend (api_service/) instead -- see .env.example. Almost
// everything is backed by real endpoints now (see HttpChangeFactoryApi's
// own comment for the small, named set of older methods that still
// aren't).
// ---------------------------------------------------------------------
import { MockChangeFactoryApi } from "./mockApi";
import { HttpChangeFactoryApi } from "./httpApi";

// The real backend is the default. The in-browser sample-data mode runs only
// when explicitly asked for (VITE_USE_MOCK_API=true), and says so on every page.
export const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK_API === "true";

export const api: ChangeFactoryApi = IS_MOCK_MODE ? new MockChangeFactoryApi() : new HttpChangeFactoryApi();
