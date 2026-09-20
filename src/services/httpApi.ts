import type {
  ActivityEntry,
  BusinessDomain,
  Change,
  DeliveryQueueEntry,
  DomainReview,
  FactoryMetrics,
  Session,
  UserStory,
} from "../types/domain";
import type { ChangeFactoryApi, CreateChangeInput, DecisionInput } from "./api";
import { getMockPersona, type PersonaKey } from "./session";

/**
 * Real implementation of ChangeFactoryApi, talking to the Phase 1
 * FastAPI backend (api_service/).
 *
 * Phase 1 only implements the read endpoints plus direct-entry intake
 * (POST /change-requests) -- see the repository analysis. Everything
 * downstream of "approve for backlog" (enhance, send-back, approve,
 * reject, approve-exact-change) has no backend endpoint yet, since
 * that needs the Claude Agent SDK orchestration and the Phase 2/3
 * approval UI wiring this phase deliberately does not build. Calling
 * one of those methods against this implementation throws a clear
 * "not implemented yet" error rather than silently doing nothing.
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

class HttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`HTTP ${status}: ${body}`);
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

  async approveExactChange(_id: string, _input: DecisionInput): Promise<Change> {
    notImplemented("approveExactChange");
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

  async approveForDelivery(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const customerId = await this.activeCustomerId();
    return request<DomainReview>(`/changes/${encodeURIComponent(changeId)}/domain-review/application-manager-approve`, {
      method: "POST",
      customerId,
      body: { decidedBy: input.decidedBy, note: input.note },
    });
  }

  async listDeliveryQueue(): Promise<DeliveryQueueEntry[]> {
    const customerId = await this.activeCustomerId();
    return request<DeliveryQueueEntry[]>("/delivery-queue", { customerId });
  }
}
