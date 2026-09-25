import type {
  AcceptInvitationInput,
  ActivityEntry,
  AgentDefinition,
  AgentHealth,
  ArchitectureReviewRun,
  BusinessDomain,
  BusinessDomainCreateInput,
  CapabilityCatalog,
  Change,
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
  ForgotPasswordResult,
  IntegrationStatus,
  InvitationOut,
  InvitationPreview,
  InviteInput,
  JiraConnectionStatus,
  JiraCredentialsUpdateInput,
  JiraIntegrationConfig,
  JiraIntegrationConfigUpdateInput,
  JiraSyncResult,
  JiraTestConnectionInput,
  JiraTestConnectionResult,
  MembershipOut,
  MeOut,
  Session,
  UpdateMembershipInput,
  UserStory, CustomerInput, Customer } from "../types/domain";
import type { ChangeFactoryApi, CreateChangeInput, DecisionInput } from "./api";
import { RevisionConflictError } from "./saveErrors";

/**
 * Real implementation of ChangeFactoryApi, talking to the FastAPI
 * backend (api_service/).
 *
 * Read endpoints, direct-entry intake, Receive/Improve/Check, the full
 * Domain Owner / Application Manager governance flow, Architecture
 * Review, and the Administration area (Customer Setup, ERP Landscape,
 * Agents, Business Domains write path, Integrations, Users) are all
 * backed by real endpoints. A handful of older, superseded methods
 * (sendStoryBack, approveStoryForBacklog, approveChange, rejectChange
 * -- the pre-domain-governance story-level decision flow) still have
 * no backend route and throw a clear "not implemented yet" error
 * rather than silently doing nothing; use the mock service for those
 * specific flows until a later phase adds them.
 *
 * SECURITY NOTE: identity comes from a real, httponly session cookie
 * (see auth.ts's login()/logout()) -- this client never asserts who is
 * calling. X-Customer-Id IS still an assertion, exactly like the
 * comment on CUSTOMER_SCOPE_HEADER in api.ts already says -- the
 * backend is what actually enforces both entitlement and role
 * (dependencies.py's require_customer_access/require_role), never this
 * client. Nothing here should be read as "the frontend decides access."
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const ACTIVE_CUSTOMER_KEY = "ciq_http_active_customer";

function rememberActiveCustomer(customerId: string): void {
  localStorage.setItem(ACTIVE_CUSTOMER_KEY, customerId);
}

function readRememberedActiveCustomer(): string | null {
  return localStorage.getItem(ACTIVE_CUSTOMER_KEY);
}

const CSRF_COOKIE_NAME = "jde_csrf";
const UNSAFE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * Double-submit CSRF cookie (see the backend's dependencies.
 * verify_csrf_if_unsafe) -- login/accept-invitation set this cookie
 * deliberately NOT httponly, specifically so this can read it and echo
 * it back as X-CSRF-Token below. A cross-site attacker's page can
 * never read it (browsers enforce same-origin cookie access), so it
 * can never forge a matching header.
 */
function readCsrfCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
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

export class HttpError extends Error {
  constructor(public status: number, public body: string) {
    super(messageFromErrorBody(status, body));
  }
}

/** The local backend only accepts pages served at http://localhost:5173 (its CORS origin). */
const LOCAL_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function unreachableMessage(): string {
  const here = typeof window !== "undefined" ? window.location.origin : "";
  const localBackend = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE_URL);
  if (localBackend && here && !LOCAL_ORIGINS.includes(here)) {
    return "This page is not your local Jade, so it cannot reach Jade's backend. Start Jade on your Mac with " +
      "scripts/run_local_preview.sh and open http://localhost:5173 in a browser on that Mac.";
  }
  return `Cannot reach Jade's backend at ${BASE_URL}. Check that it is running (scripts/run_local_preview.sh) and try again.`;
}

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; customerId?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.customerId) headers["X-Customer-Id"] = options.customerId;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const method = options.method ?? "GET";
  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = readCsrfCookie();
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      // The session cookie is httponly, set by /auth/login -- this is
      // what actually sends it (and is required for it to be sent
      // cross-origin, see config.py's cookie_samesite comment).
      credentials: "include",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(unreachableMessage());
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 409 || res.status === 428) {
      // A revisioned save that lost a race (see saveErrors.ts). Other
      // 409s (e.g. a lifecycle-state conflict) carry no currentRevision
      // and stay ordinary HttpErrors.
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.currentRevision === "number") {
          throw new RevisionConflictError(res.status, parsed.currentRevision);
        }
      } catch (e) {
        if (e instanceof RevisionConflictError) throw e;
      }
    }
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
      body: { note: input.note },
    });
  }

  async rejectExactChange(id: string, input: DecisionInput): Promise<Change> {
    const customerId = await this.activeCustomerId();
    return request<Change>(`/changes/${encodeURIComponent(id)}/reject-change`, {
      method: "POST",
      customerId,
      body: { note: input.note, rejectionReason: input.rejectionReason },
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
      body: { note: input.note },
    });
  }

  async submitDomainOwnerEdit(
    changeId: string,
    input: { note?: string; userStory: UserStory }
  ): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/edit`, {
      method: "POST",
      customerId,
      body: { note: input.note ?? "", userStory: input.userStory },
    });
  }

  async approveDomainOwnerStory(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/approve`, {
      method: "POST",
      customerId,
      body: { note: input.note },
    });
  }

  async rejectDomainOwnerStory(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/reject`, {
      method: "POST",
      customerId,
      body: { note: input.note, rejectionReason: input.rejectionReason },
    });
  }

  async approveForDelivery(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/application-manager-approve`, {
      method: "POST",
      customerId,
      body: { note: input.note },
    });
  }

  async rejectForDelivery(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/application-manager-reject`, {
      method: "POST",
      customerId,
      body: { note: input.note, rejectionReason: input.rejectionReason },
    });
  }

  async askAboutRequirement(changeId: string, input: { question: string }): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/ask`, {
      method: "POST",
      customerId,
      body: { question: input.question },
    });
  }

  async requestRequirementReconsideration(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/request-reconsideration`, {
      method: "POST",
      customerId,
      body: { note: input.note },
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

  async askAboutSolution(changeId: string, input: { question: string }): Promise<ArchitectureReviewRun> {
    const customerId = await this.activeCustomerId();
    return request<ArchitectureReviewRun>(`/changes/${encodeURIComponent(changeId)}/architecture-review/ask`, {
      method: "POST",
      customerId,
      body: { question: input.question },
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

  async updateCustomerProfile(input: CustomerInput): Promise<CustomerProfile> {
    const customerId = await this.activeCustomerId();
    return request<CustomerProfile>("/admin/customer-profile", { method: "PUT", customerId, body: input });
  }

  async createCustomer(input: CustomerInput): Promise<Customer> {
    const customerId = await this.activeCustomerId();
    const created = await request<Customer>("/admin/customers", { method: "POST", customerId, body: input });
    rememberActiveCustomer(created.id);
    this.lastSession = null;
    return created;
  }

  async getErpLandscape(): Promise<ErpLandscape> {
    const customerId = await this.activeCustomerId();
    return request<ErpLandscape>("/admin/erp-landscape", { customerId });
  }

  async getExecutionPreflight(changeId: string): Promise<PreflightResult> {
    const customerId = await this.activeCustomerId();
    return request<PreflightResult>(`/changes/${encodeURIComponent(changeId)}/execution/preflight`, { customerId });
  }

  async reconcileExecution(changeId: string, input: { observedValue?: string; note: string; evidenceReference?: string }) {
    const customerId = await this.activeCustomerId();
    return request<ReconcileResult>(
      `/changes/${encodeURIComponent(changeId)}/execution/reconcile`,
      { method: "POST", customerId, body: input }
    );
  }

  async reconcileTestRun(changeId: string, input: { ran: boolean; note: string; evidenceReference: string }) {
    const customerId = await this.activeCustomerId();
    return request<ReconcileResult>(`/changes/${encodeURIComponent(changeId)}/execution/reconcile-test`, {
      method: "POST", customerId, body: input,
    });
  }

  async getEngagementScope(): Promise<EngagementScope> {
    const customerId = await this.activeCustomerId();
    return request<EngagementScope>("/admin/engagement-scope", { customerId });
  }

  async updateEngagementScope(input: EngagementScopeUpdateInput): Promise<EngagementScope> {
    const customerId = await this.activeCustomerId();
    return request<EngagementScope>("/admin/engagement-scope", { method: "PUT", customerId, body: input });
  }

  async getDashboardThresholds(): Promise<DashboardThresholds> {
    const customerId = await this.activeCustomerId();
    return request<DashboardThresholds>("/admin/dashboard-thresholds", { customerId });
  }

  async updateDashboardThresholds(input: DashboardThresholdsUpdateInput): Promise<DashboardThresholds> {
    const customerId = await this.activeCustomerId();
    return request<DashboardThresholds>("/admin/dashboard-thresholds", { method: "PUT", customerId, body: input });
  }

  async listAgents(): Promise<AgentDefinition[]> {
    const customerId = await this.activeCustomerId();
    return request<AgentDefinition[]>("/admin/agents", { customerId });
  }

  async listCapabilities(): Promise<CapabilityCatalog> {
    const customerId = await this.activeCustomerId();
    return request<CapabilityCatalog>("/admin/capabilities", { customerId });
  }

  async getAgentHealth(agentName: string): Promise<AgentHealth> {
    const customerId = await this.activeCustomerId();
    return request<AgentHealth>(`/admin/agents/${encodeURIComponent(agentName)}/health`, { customerId });
  }

  async createBusinessDomain(input: BusinessDomainCreateInput): Promise<BusinessDomain> {
    const customerId = await this.activeCustomerId();
    return request<BusinessDomain>("/admin/business-domains", { method: "POST", customerId, body: input });
  }

  async updateBusinessDomainStatus(
    domainId: string,
    status: BusinessDomain["status"],
    expectedRevision: number
  ): Promise<BusinessDomain> {
    const customerId = await this.activeCustomerId();
    return request<BusinessDomain>(`/admin/business-domains/${encodeURIComponent(domainId)}/status`, {
      method: "PUT",
      customerId,
      body: { status, expectedRevision },
    });
  }

  async listIntegrations(): Promise<IntegrationStatus[]> {
    const customerId = await this.activeCustomerId();
    return request<IntegrationStatus[]>("/admin/integrations", { customerId });
  }

  async getJiraIntegration(): Promise<JiraIntegrationConfig> {
    const customerId = await this.activeCustomerId();
    // Requires the Admin role on this company -- enforced server-side
    // (require_role("admin")); a non-admin gets a 403 here, same as
    // every other call, with no special header needed on this end.
    return request<JiraIntegrationConfig>("/admin/jira-integration", { customerId });
  }

  async updateJiraIntegration(input: JiraIntegrationConfigUpdateInput): Promise<JiraIntegrationConfig> {
    const customerId = await this.activeCustomerId();
    return request<JiraIntegrationConfig>("/admin/jira-integration", { method: "PUT", customerId, body: input });
  }

  async getJiraIntegrationStatus(): Promise<JiraConnectionStatus> {
    const customerId = await this.activeCustomerId();
    // Open to any active company member, including Dashboard Viewer --
    // Demand > Requests reads this too.
    return request<JiraConnectionStatus>("/admin/jira-integration/status", { customerId });
  }

  async updateJiraCredentials(input: JiraCredentialsUpdateInput): Promise<JiraConnectionStatus> {
    const customerId = await this.activeCustomerId();
    return request<JiraConnectionStatus>("/admin/jira-credentials", { method: "PUT", customerId, body: input });
  }

  async disconnectJiraCredentials(): Promise<JiraConnectionStatus> {
    const customerId = await this.activeCustomerId();
    return request<JiraConnectionStatus>("/admin/jira-credentials", { method: "DELETE", customerId });
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

  async listCompanyUsers(): Promise<CompanyUsersOut> {
    const customerId = await this.activeCustomerId();
    return request<CompanyUsersOut>("/admin/users", { customerId });
  }

  async inviteUser(input: InviteInput): Promise<InvitationOut> {
    const customerId = await this.activeCustomerId();
    return request<InvitationOut>("/admin/users/invite", { method: "POST", customerId, body: input });
  }

  async resendInvitation(invitationId: string): Promise<InvitationOut> {
    const customerId = await this.activeCustomerId();
    return request<InvitationOut>(`/admin/users/invitations/${encodeURIComponent(invitationId)}/resend`, {
      method: "POST", customerId,
    });
  }

  async revokeInvitation(invitationId: string): Promise<InvitationOut> {
    const customerId = await this.activeCustomerId();
    return request<InvitationOut>(`/admin/users/invitations/${encodeURIComponent(invitationId)}/revoke`, {
      method: "POST", customerId,
    });
  }

  async issuePasswordResetLink(membershipId: string): Promise<PasswordResetLinkOut> {
    const customerId = await this.activeCustomerId();
    return request<PasswordResetLinkOut>(`/admin/users/${encodeURIComponent(membershipId)}/password-reset-link`, {
      method: "POST", customerId,
    });
  }

  async updateMembershipRoles(membershipId: string, input: UpdateMembershipInput): Promise<MembershipOut> {
    const customerId = await this.activeCustomerId();
    return request<MembershipOut>(`/admin/users/${encodeURIComponent(membershipId)}/roles`, {
      method: "PUT", customerId, body: input,
    });
  }

  async deactivateMembership(membershipId: string, expectedRevision: number): Promise<MembershipOut> {
    const customerId = await this.activeCustomerId();
    return request<MembershipOut>(`/admin/users/${encodeURIComponent(membershipId)}/deactivate`, {
      method: "POST", customerId, body: { expectedRevision },
    });
  }

  async reactivateMembership(membershipId: string, expectedRevision: number): Promise<MembershipOut> {
    const customerId = await this.activeCustomerId();
    return request<MembershipOut>(`/admin/users/${encodeURIComponent(membershipId)}/reactivate`, {
      method: "POST", customerId, body: { expectedRevision },
    });
  }
}

// ---------------------------------------------------------------------
// Auth -- login/logout/password reset/invitation acceptance. Standalone
// (not part of ChangeFactoryApi) since the mock service has no real
// login: its existing persona picker (session.ts) is unaffected by any
// of this, and stays the way to demo the app without a backend.
// ---------------------------------------------------------------------
export const authApi = {
  async me(): Promise<MeOut> {
    return request<MeOut>("/auth/me");
  },
  async login(email: string, password: string): Promise<MeOut> {
    return request<MeOut>("/auth/login", { method: "POST", body: { email, password } });
  },
  async logout(): Promise<void> {
    await request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  },
  async forgotPassword(email: string): Promise<ForgotPasswordResult> {
    return request<ForgotPasswordResult>("/auth/forgot-password", { method: "POST", body: { email } });
  },
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await request<{ ok: boolean }>("/auth/reset-password", {
      method: "POST", body: { token, newPassword },
    });
  },
  async previewInvitation(token: string): Promise<InvitationPreview> {
    return request<InvitationPreview>(`/auth/invitation/${encodeURIComponent(token)}/preview`);
  },
  async acceptInvitation(input: AcceptInvitationInput): Promise<MeOut> {
    return request<MeOut>("/auth/accept-invitation", { method: "POST", body: input });
  },
  async acceptInvitationAsExistingUser(token: string): Promise<MeOut> {
    return request<MeOut>("/auth/accept-invitation/existing-user", { method: "POST", body: { token } });
  },
};
