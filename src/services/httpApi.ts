import type {
  ActivityEntry,
  AgentDefinition,
  AgentHealth,
  ArchitectureReviewRun,
  BusinessDomain,
  BusinessDomainCreateInput,
  Change,
  CustomerProfile,
  DeliveryQueueEntry,
  DomainReview,
  EngagementScope,
  EngagementScopeUpdateInput,
  ErpLandscape,
  FactoryMetrics,
  IntegrationStatus,
  JiraConnectionStatus,
  JiraCredentialsUpdateInput,
  JiraIntegrationConfig,
  JiraIntegrationConfigUpdateInput,
  JiraSyncResult,
  JiraTestConnectionInput,
  JiraTestConnectionResult,
  Session,
  UserStory,
} from "../types/domain";
import type { ChangeFactoryApi, CreateChangeInput, DecisionInput } from "./api";
import { getMockPersona, type PersonaKey } from "./session";

/**
 * Real implementation of ChangeFactoryApi, talking to the Phase 1
 * FastAPI backend (api_service/).
 *
 * Read endpoints, direct-entry intake, Receive/Improve/Check, the full
 * Domain Owner / Application Manager governance flow, Architecture
 * Review, and the Administration area (Customer Setup, ERP Landscape,
 * Agents, Business Domains write path, Integrations) are all backed by
 * real endpoints. A handful of older, superseded methods
 * (sendStoryBack, approveStoryForBacklog, approveChange, rejectChange
 * -- the pre-domain-governance story-level decision flow) still have
 * no backend route and throw a clear "not implemented yet" error
 * rather than silently doing nothing; use the mock service for those
 * specific flows until a later phase adds them.
 *
 * SECURITY NOTE: the X-Customer-Id and X-Demo-User-Id headers sent
 * below are assertions, exactly like the comment on
 * CUSTOMER_SCOPE_HEADER in api.ts already says -- the backend is what
 * actually enforces entitlement (dependencies.py's
 * require_customer_access), never this client. Nothing here should be
 * read as "the frontend decides access."
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// Mirrors session.ts's persona concept (Phase 1 has no real auth yet --
// see design doc Section 15.10). Reusing the SAME localStorage key
// session.ts already defines means the existing PersonaSwitch control
// drives identity for both the mock and the real API without any
// change to CustomerScope.tsx.
function demoUserIdFor(persona: PersonaKey): string {
  return persona === "customer-user" ? "u-ellen" : "u-hendro";
}

const ACTIVE_CUSTOMER_KEY = "ciq_http_active_customer";

function rememberActiveCustomer(customerId: string): void {
  localStorage.setItem(ACTIVE_CUSTOMER_KEY, customerId);
}

function readRememberedActiveCustomer(): string | null {
  return localStorage.getItem(ACTIVE_CUSTOMER_KEY);
}

function messageFromErrorBody(status: number, body: string): string {
  // FastAPI's default error shape is {"detail": "..."} -- surface that
  // directly rather than the raw JSON when present, so a caller that
  // just does `e.message` (e.g. Integrations.tsx's save() error
  // handling) shows the actual validation reason, not `{"detail":...}`.
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON -- fall through to the raw body
  }
  return `HTTP ${status}: ${body}`;
}

class HttpError extends Error {
  constructor(public status: number, public body: string) {
    super(messageFromErrorBody(status, body));
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; customerId?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "X-Demo-User-Id": demoUserIdFor(getMockPersona()),
  };
  if (options.customerId) headers["X-Customer-Id"] = options.customerId;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HttpError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function notImplemented(method: string): never {
  throw new Error(
    `HttpChangeFactoryApi.${method}() has no backend endpoint yet (Phase 1 is read-only + direct-entry intake). ` +
      "Set VITE_USE_MOCK_API=true to use the mock service for this flow until a later phase adds it."
  );
}

export class HttpChangeFactoryApi implements ChangeFactoryApi {
  private lastSession: Session | null = null;

  async getSession(): Promise<Session> {
    const session = await request<Session>("/session");
    const remembered = readRememberedActiveCustomer();
    const activeCustomerId =
      remembered && session.customers.some((c) => c.id === remembered)
        ? remembered
        : session.activeCustomerId;
    const withActive = { ...session, activeCustomerId };
    this.lastSession = withActive;
    return withActive;
  }

  /**
   * No server round trip: there is no endpoint to mutate "the active
   * customer" server-side in Phase 1 (nor does the backend need one --
   * entitlement is re-checked from X-Customer-Id on every actual data
   * call, so "switching" is just choosing which of the caller's own
   * entitled customers to scope subsequent requests to). This mirrors
   * how mockApi.ts persists the choice, just without a network call.
   */
  async setActiveCustomer(customerId: string): Promise<Session> {
    const base = this.lastSession ?? (await this.getSession());
    if (!base.customers.some((c) => c.id === customerId)) {
      throw new Error(
        `Not entitled to customer ${customerId} -- the server would reject this on the next real request the same way.`
      );
    }
    rememberActiveCustomer(customerId);
    const next = { ...base, activeCustomerId: customerId };
    this.lastSession = next;
    return next;
  }

  private async activeCustomerId(): Promise<string> {
    const session = this.lastSession ?? (await this.getSession());
    return session.activeCustomerId;
  }

  async listChanges(): Promise<Change[]> {
    const customerId = await this.activeCustomerId();
    return request<Change[]>("/changes", { customerId });
  }

  async getChange(id: string): Promise<Change | undefined> {
    const customerId = await this.activeCustomerId();
    try {
      return await request<Change>(`/changes/${encodeURIComponent(id)}`, { customerId });
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return undefined;
      throw e;
    }
  }

  async createChange(input: CreateChangeInput): Promise<Change> {
    const customerId = await this.activeCustomerId();
    const created = await request<{ id: string }>("/change-requests", {
      method: "POST",
      customerId,
      body: {
        title: input.title,
        businessSource: input.source,
        sourceReference: input.sourceReference,
        rawContent: input.originalRequest,
      },
    });
    // The API returns the ChangeRequest, not a Change -- fetch it back
    // through /changes/{id} so the caller gets the same shape every
    // other method returns (the assembler on the backend already knows
    // how to present an unpromoted ChangeRequest as a RECEIVED-state Change).
    const change = await this.getChange(created.id);
    if (!change) throw new Error(`Created change request ${created.id} but could not read it back`);
    return change;
  }

  /**
   * Starts Receive -> Improve -> Check as a background run on the
   * backend and returns immediately (the run can take minutes -- a
   * real model call per stage). The returned Change reflects
   * whatever state the run is in at that instant; callers that want
   * to show live progress should keep calling getChange(id) (e.g.
   * UserStories.tsx polls while processingStage is neither
   * undefined nor a terminal value).
   */
  async enhanceStory(id: string): Promise<Change> {
    const customerId = await this.activeCustomerId();
    return request<Change>(`/changes/${encodeURIComponent(id)}/enhance`, {
      method: "POST",
      customerId,
    });
  }

  async sendStoryBack(_id: string, _input: DecisionInput): Promise<Change> {
    notImplemented("sendStoryBack");
  }

  async approveStoryForBacklog(_id: string, _input: DecisionInput): Promise<Change> {
    notImplemented("approveStoryForBacklog");
  }

  async getBacklog(): Promise<Change[]> {
    const customerId = await this.activeCustomerId();
    return request<Change[]>("/backlog", { customerId });
  }

  async approveChange(_id: string, _input: DecisionInput): Promise<Change> {
    notImplemented("approveChange");
  }

  async rejectChange(_id: string, _input: DecisionInput): Promise<Change> {
    notImplemented("rejectChange");
  }

  async approveExactChange(id: string, input: DecisionInput): Promise<Change> {
    const customerId = await this.activeCustomerId();
    return request<Change>(`/changes/${encodeURIComponent(id)}/approve-change`, {
      method: "POST",
      customerId,
      body: { decidedBy: input.decidedBy, note: input.note },
    });
  }

  async rejectExactChange(id: string, input: DecisionInput): Promise<Change> {
    const customerId = await this.activeCustomerId();
    return request<Change>(`/changes/${encodeURIComponent(id)}/reject-change`, {
      method: "POST",
      customerId,
      body: { decidedBy: input.decidedBy, note: input.note, rejectionReason: input.rejectionReason },
    });
  }

  async getMetrics(): Promise<FactoryMetrics> {
    const customerId = await this.activeCustomerId();
    return request<FactoryMetrics>("/metrics", { customerId });
  }

  async getActivity(): Promise<ActivityEntry[]> {
    const customerId = await this.activeCustomerId();
    return request<ActivityEntry[]>("/activity", { customerId });
  }

  async listBusinessDomains(): Promise<BusinessDomain[]> {
    const customerId = await this.activeCustomerId();
    return request<BusinessDomain[]>("/business-domains", { customerId });
  }

  async getDomainReview(changeId: string): Promise<DomainReview | undefined> {
    const customerId = await this.activeCustomerId();
    try {
      return await request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review`, { customerId });
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return undefined;
      throw e;
    }
  }

  async assignBusinessDomain(
    changeId: string,
    input: { businessDomainId?: string; uncertain?: boolean; note?: string }
  ): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/assign-domain`, {
      method: "POST",
      customerId,
      body: { businessDomainId: input.businessDomainId, uncertain: input.uncertain ?? false, note: input.note ?? "" },
    });
  }

  async startDomainOwnerReview(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/start`, {
      method: "POST",
      customerId,
      body: { decidedBy: input.decidedBy, note: input.note },
    });
  }

  async submitDomainOwnerEdit(
    changeId: string,
    input: { editedBy: string; note?: string; userStory: UserStory }
  ): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/edit`, {
      method: "POST",
      customerId,
      body: { editedBy: input.editedBy, note: input.note ?? "", userStory: input.userStory },
    });
  }

  async approveDomainOwnerStory(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/approve`, {
      method: "POST",
      customerId,
      body: { decidedBy: input.decidedBy, note: input.note },
    });
  }

  async rejectDomainOwnerStory(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/reject`, {
      method: "POST",
      customerId,
      body: { decidedBy: input.decidedBy, note: input.note, rejectionReason: input.rejectionReason },
    });
  }

  async approveForDelivery(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/application-manager-approve`, {
      method: "POST",
      customerId,
      body: { decidedBy: input.decidedBy, note: input.note },
    });
  }

  async rejectForDelivery(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/application-manager-reject`, {
      method: "POST",
      customerId,
      body: { decidedBy: input.decidedBy, note: input.note, rejectionReason: input.rejectionReason },
    });
  }

  async askAboutRequirement(changeId: string, input: { askedBy: string; question: string }): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/ask`, {
      method: "POST",
      customerId,
      body: { askedBy: input.askedBy, question: input.question },
    });
  }

  async requestRequirementReconsideration(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/request-reconsideration`, {
      method: "POST",
      customerId,
      body: { decidedBy: input.decidedBy, note: input.note },
    });
  }

  async getArchitectureReview(changeId: string): Promise<ArchitectureReviewRun | undefined> {
    const customerId = await this.activeCustomerId();
    try {
      return await request<ArchitectureReviewRun>(
        `/changes/${encodeURIComponent(changeId)}/architecture-review`,
        { customerId }
      );
    } catch (e) {
      // 404 -- not in the Delivery Queue, or in it but no run yet either
      // way; 409 -- same "not in the Delivery Queue yet" precondition
      // the backend's _require_queued_change also uses for the other
      // architecture-review routes. Both mean "nothing to show yet",
      // not a real error, from this read-only call's point of view.
      if (e instanceof HttpError && (e.status === 404 || e.status === 409)) return undefined;
      throw e;
    }
  }

  async askAboutSolution(changeId: string, input: { askedBy: string; question: string }): Promise<ArchitectureReviewRun> {
    const customerId = await this.activeCustomerId();
    return request<ArchitectureReviewRun>(`/changes/${encodeURIComponent(changeId)}/architecture-review/ask`, {
      method: "POST",
      customerId,
      body: { askedBy: input.askedBy, question: input.question },
    });
  }

  async retriggerArchitectureReview(changeId: string): Promise<void> {
    const customerId = await this.activeCustomerId();
    await request<{ status: string }>(`/changes/${encodeURIComponent(changeId)}/architecture-review`, {
      method: "POST",
      customerId,
    });
  }

  async listDeliveryQueue(): Promise<DeliveryQueueEntry[]> {
    const customerId = await this.activeCustomerId();
    return request<DeliveryQueueEntry[]>("/delivery-queue", { customerId });
  }

  async getCustomerProfile(): Promise<CustomerProfile> {
    const customerId = await this.activeCustomerId();
    return request<CustomerProfile>("/admin/customer-profile", { customerId });
  }

  async getErpLandscape(): Promise<ErpLandscape> {
    const customerId = await this.activeCustomerId();
    return request<ErpLandscape>("/admin/erp-landscape", { customerId });
  }

  async getEngagementScope(): Promise<EngagementScope> {
    const customerId = await this.activeCustomerId();
    return request<EngagementScope>("/admin/engagement-scope", { customerId });
  }

  async updateEngagementScope(input: EngagementScopeUpdateInput): Promise<EngagementScope> {
    const customerId = await this.activeCustomerId();
    return request<EngagementScope>("/admin/engagement-scope", { method: "PUT", customerId, body: input });
  }

  async listAgents(): Promise<AgentDefinition[]> {
    const customerId = await this.activeCustomerId();
    return request<AgentDefinition[]>("/admin/agents", { customerId });
  }

  async getAgentHealth(agentName: string): Promise<AgentHealth> {
    const customerId = await this.activeCustomerId();
    return request<AgentHealth>(`/admin/agents/${encodeURIComponent(agentName)}/health`, { customerId });
  }

  async createBusinessDomain(input: BusinessDomainCreateInput): Promise<BusinessDomain> {
    const customerId = await this.activeCustomerId();
    return request<BusinessDomain>("/admin/business-domains", { method: "POST", customerId, body: input });
  }

  async updateBusinessDomainStatus(domainId: string, status: BusinessDomain["status"]): Promise<BusinessDomain> {
    const customerId = await this.activeCustomerId();
    return request<BusinessDomain>(`/admin/business-domains/${encodeURIComponent(domainId)}/status`, {
      method: "PUT",
      customerId,
      body: { status },
    });
  }

  async listIntegrations(): Promise<IntegrationStatus[]> {
    const customerId = await this.activeCustomerId();
    return request<IntegrationStatus[]>("/admin/integrations", { customerId });
  }

  async getJiraIntegration(): Promise<JiraIntegrationConfig> {
    const customerId = await this.activeCustomerId();
    return request<JiraIntegrationConfig>("/admin/jira-integration", { customerId });
  }

  async updateJiraIntegration(input: JiraIntegrationConfigUpdateInput): Promise<JiraIntegrationConfig> {
    const customerId = await this.activeCustomerId();
    return request<JiraIntegrationConfig>("/admin/jira-integration", { method: "PUT", customerId, body: input });
  }

  async getJiraIntegrationStatus(): Promise<JiraConnectionStatus> {
    const customerId = await this.activeCustomerId();
    return request<JiraConnectionStatus>("/admin/jira-integration/status", { customerId });
  }

  async updateJiraCredentials(input: JiraCredentialsUpdateInput): Promise<JiraConnectionStatus> {
    const customerId = await this.activeCustomerId();
    return request<JiraConnectionStatus>("/admin/jira-credentials", { method: "PUT", customerId, body: input });
  }

  async testJiraConnection(input: JiraTestConnectionInput): Promise<JiraTestConnectionResult> {
    const customerId = await this.activeCustomerId();
    return request<JiraTestConnectionResult>("/admin/jira-integration/test-connection", {
      method: "POST", customerId, body: input,
    });
  }

  async syncJiraIntegration(): Promise<JiraSyncResult> {
    const customerId = await this.activeCustomerId();
    return request<JiraSyncResult>("/admin/jira-integration/sync", { method: "POST", customerId });
  }
}
