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
  Change,
  ChangeSource,
  CustomerProfile,
  DeliveryQueueEntry,
  DomainReview,
  EngagementScope,
  EngagementScopeUpdateInput,
  ErpLandscape,
  FactoryMetrics,
  FeedbackReasonCode,
  IntegrationStatus,
  Session,
  UserStory,
} from "../types/domain";

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

  listDeliveryQueue: "GET /delivery-queue",

  getCustomerProfile: "GET /admin/customer-profile",
  getErpLandscape: "GET /admin/erp-landscape",
  getEngagementScope: "GET /admin/engagement-scope",
  updateEngagementScope: "PUT /admin/engagement-scope",
  listAgents: "GET /admin/agents",
  getAgent: "GET /admin/agents/{name}",
  getAgentHealth: "GET /admin/agents/{name}/health",
  createBusinessDomain: "POST /admin/business-domains",
  updateBusinessDomainStatus: "PUT /admin/business-domains/{id}/status",
  listIntegrations: "GET /admin/integrations",
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
}

export interface DecisionInput {
  /** Every decision is recorded against a named person. */
  decidedBy: string;
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
    input: { editedBy: string; note?: string; userStory: UserStory }
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

  /** The set of approved changes Jade is authorised to work on, in queue order. */
  listDeliveryQueue(): Promise<DeliveryQueueEntry[]>;

  /* -------------------------------------------------------------- */
  /* Administration — Customer Setup, ERP / JDE Landscape, Agents,    */
  /* Business Domains (write path) and Integrations. All scoped to    */
  /* the active customer, same as everything else in this interface. */
  /* -------------------------------------------------------------- */

  /** The active customer's profile plus who is entitled to it. */
  getCustomerProfile(): Promise<CustomerProfile>;
  /** JDE connection + engagement-scope status. Never a credential value. */
  getErpLandscape(): Promise<ErpLandscape>;
  getEngagementScope(): Promise<EngagementScope>;
  updateEngagementScope(input: EngagementScopeUpdateInput): Promise<EngagementScope>;

  /** The five subagent definitions, parsed live from .claude/agents/*.md. */
  listAgents(): Promise<AgentDefinition[]>;
  getAgentHealth(agentName: string): Promise<AgentHealth>;

  createBusinessDomain(input: BusinessDomainCreateInput): Promise<BusinessDomain>;
  updateBusinessDomainStatus(domainId: string, status: BusinessDomain["status"]): Promise<BusinessDomain>;

  listIntegrations(): Promise<IntegrationStatus[]>;
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

export const api: ChangeFactoryApi =
  import.meta.env.VITE_USE_MOCK_API === "false"
    ? new HttpChangeFactoryApi()
    : new MockChangeFactoryApi();
