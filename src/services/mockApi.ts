import type {
  ActivityEntry,
  AgentDefinition,
  AgentHealth,
  AgentRunSummary,
  ArchitectureReviewRun,
  BusinessDomain,
  BusinessDomainCreateInput,
  CapabilityCatalog,
  Change,
  ChangeType,
  CompanyUsersOut,
  ConversationTurn,
  CustomerProfile,
  DeliveryQueueEntry,
  DomainReview,
  DomainReviewStage,
  DashboardThresholds,
  DashboardThresholdsUpdateInput,
  EngagementScope,
  EngagementScopeUpdateInput,
  ErpLandscape,
  FactoryMetrics,
  FeedbackSummary,
  IntegrationStatus,
  InvitationOut,
  InviteInput,
  JiraConnectionStatus,
  JiraCredentialsUpdateInput,
  JiraIntegrationConfig,
  JiraIntegrationConfigUpdateInput,
  JiraSyncError,
  JiraSyncResult,
  JiraTestConnectionInput,
  JiraTestConnectionResult,
  LifecycleState,
  MembershipOut,
  StoryVersion,
  UpdateMembershipInput,
  UserStory,
} from "../types/domain";
import type { Session } from "../types/domain";
import type { ChangeFactoryApi, CreateChangeInput, DecisionInput } from "./api";
import { DEFAULT_DASHBOARD_THRESHOLDS } from "./dashboardThresholds";
import { nextRevision } from "./saveErrors";
import { CUSTOMERS, getMockSession, identitiesForCustomer, setMockActiveCustomer } from "./session";
import { MOCK_AGENTS, MOCK_BUSINESS_DOMAINS, MOCK_CAPABILITY_CATALOG, MOCK_CHANGES } from "./mockData";

/** Simulates network latency so loading states are real, not decorative. */
const delay = <T,>(value: T, ms = 220): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const now = () => new Date().toISOString();

/** Mirrors the backend's _PRE_DOMAIN_OWNER_APPROVAL_STAGES (metrics_service.py). */
const PRE_DOMAIN_OWNER_APPROVAL = new Set<DomainReviewStage>([
  "ready_for_domain_owner", "domain_owner_reviewing", "domain_owner_requested_revision", "reviewer_agent_refining",
]);

/** Mirrors jira_gateway.py's JiraMockGateway -- an in-memory stand-in
 * exercising the same field/comment/transition write-back sequence a
 * live Jira connector would, against whatever status names the admin
 * configures (never a hardcoded default). */
interface MockJiraIssue {
  key: string;
  id: string;
  summary: string;
  description: string;
  reporter: string;
  createdAt: string;
  status: string;
  metadata: Record<string, string>;
  fields: Record<string, string>;
  comments: string[];
}

function defaultJiraFixture(): MockJiraIssue[] {
  // Arbitrary fixture content, exactly like the backend's own
  // JiraMockGateway seed -- the status value is a seed default only,
  // matching the example name used throughout this integration's own
  // design discussion; it is never read or special-cased by any logic
  // below, which always filters by whatever status name is configured.
  return [
    {
      key: "JADE-101", id: "10101",
      summary: "Default delivery date is wrong on sales orders",
      description:
        "When our sales team enters a new sales order, the requested delivery date defaults to today. " +
        "We would like it to default to 7 working days out instead.",
      reporter: "BicycleWorks Sales Team",
      createdAt: "2026-09-01T09:00:00.000Z",
      status: "Ready for Jade",
      metadata: { workType: "Change", priority: "Medium" },
      fields: {},
      comments: [],
    },
    {
      key: "JADE-104", id: "10104",
      summary: "Warehouse cannot see available stock at a glance",
      description:
        "Warehouse staff need On hand, Allocated, Available, On order and Backordered for an item in one " +
        "place instead of interpreting several separate quantities.",
      reporter: "BicycleWorks Warehouse",
      createdAt: "2026-09-03T14:30:00.000Z",
      status: "Ready for Jade",
      metadata: { workType: "Improvement", priority: "Low" },
      fields: {},
      comments: [],
    },
  ];
}

/**
 * In-memory implementation of ChangeFactoryApi.
 *
 * Every metric below is DERIVED from the change list — nothing is a
 * hard-coded dashboard number. That matters: when this is replaced by
 * the FastAPI backend, the dashboard keeps working because it was
 * never reading fabricated totals in the first place.
 */
export class MockChangeFactoryApi implements ChangeFactoryApi {
  private changes: Change[] = JSON.parse(JSON.stringify(MOCK_CHANGES));
  private domainReviews = new Map<string, DomainReview>();
  private architectureReviews = new Map<string, ArchitectureReviewRun>();
  private deliveryQueue: DeliveryQueueEntry[] = [];
  private businessDomains: BusinessDomain[] = JSON.parse(JSON.stringify(MOCK_BUSINESS_DOMAINS));
  private engagementScopes = new Map<string, EngagementScope>();
  private dashboardThresholds = new Map<string, DashboardThresholds>();
  /** Keyed by agent name -- grows as the mock's own flows run, so Admin
   * > Agents' health view reflects what this session actually did,
   * same "derived, not hard-coded" rule as everything else here. */
  private agentRuns = new Map<string, AgentRunSummary[]>();
  private feedbackLog: { customerId: string; kind: string; reasonCode?: string }[] = [];
  private jiraConfigs = new Map<string, JiraIntegrationConfig>();
  /** Per-customer Jira credentials -- mirrors jira_credentials_service.py's
   * own per-customer plaintext storage (pilot-scoped simplicity, see
   * that module's docstring); never read back by any method below,
   * same "write-only from the API's own point of view" rule. */
  private jiraCredentials = new Map<string, { email: string; apiToken: string }>();
  /** Per-customer fixture tickets for the Jira mock -- stateful across
   * "Sync now" clicks within a session (unlike the real backend's
   * per-call mock gateway), so a second click legitimately shows
   * nothing new once the first has moved everything past the
   * configured pickup status. */
  private jiraMockIssues = new Map<string, MockJiraIssue[]>();
  /** Per-customer company member list -- lazily seeded on first read
   * from the two demo personas (session.ts), then mutable via the
   * Admin > Users methods below, same "derived once, then a real
   * mutable store for the rest of the session" pattern jiraConfigs
   * already follows. */
  private companyMembers = new Map<string, MembershipOut[]>();
  private invitations = new Map<string, InvitationOut[]>();

  private ensureCompanyMembers(customerId: string): MembershipOut[] {
    let members = this.companyMembers.get(customerId);
    if (!members) {
      members = identitiesForCustomer(customerId).map((identity) => ({
        membershipId: `mem-${identity.id}`,
        userId: identity.id,
        email: `${identity.id.replace(/^u-/, "")}@example.com`,
        displayName: identity.displayName,
        status: "active",
        roles: ["admin", "domain_owner", "product_manager", "dashboard_viewer"],
        domainIds: [],
      }));
      this.companyMembers.set(customerId, members);
    }
    return members;
  }

  private recordAgentRun(agentName: string, storyId: string, stage: AgentRunSummary["stage"] = "done"): void {
    const runs = this.agentRuns.get(agentName) ?? [];
    runs.unshift({
      runId: `${storyId}-${agentName}-${Math.random().toString(16).slice(2, 8)}`,
      storyId,
      stage,
      startedAt: now(),
      updatedAt: now(),
    });
    this.agentRuns.set(agentName, runs.slice(0, 20));
  }

  async getSession(): Promise<Session> {
    return delay(getMockSession(), 80);
  }

  async setActiveCustomer(customerId: string): Promise<Session> {
    // Throws if the customer is outside the caller's entitlements —
    // the same check the real API performs server-side.
    return delay(setMockActiveCustomer(customerId), 80);
  }

  /** The active customer id, re-read per call so a switch takes effect. */
  private get scope(): string {
    return getMockSession().activeCustomerId;
  }

  /**
   * Every read goes through here. In the real backend this is a WHERE
   * clause applied server-side from the session, not a filter the
   * client could choose to skip.
   */
  private scoped(): Change[] {
    return this.changes.filter((c) => c.customerId === this.scope);
  }

  async listChanges(): Promise<Change[]> {
    return delay([...this.scoped()]);
  }

  async getChange(id: string): Promise<Change | undefined> {
    // Scoped lookup: a change belonging to another customer is not
    // "forbidden", it simply does not exist for this caller.
    return delay(this.scoped().find((c) => c.id === id));
  }

  async createChange(input: CreateChangeInput): Promise<Change> {
    const seq = 1043 + this.changes.filter((c) => c.id.startsWith("CHG-10")).length;
    const change: Change = {
      id: `CHG-${seq}`,
      customerId: this.scope,
      title: input.title,
      source: input.source,
      sourceReference: input.sourceReference,
      originalRequest: input.originalRequest,
      changeType: "Other",
      state: "RECEIVED",
      priority: "Medium",
      complexitySignal: "Unknown",
      businessImpact: {
        financialImpact: "",
        operationalReach: "",
        riskCompliance: "",
        strategicAlignment: "",
        urgency: "",
      },
      createdAt: now(),
      updatedAt: now(),
      updatedBy: "You",
      evidence: [
        {
          entryId: "E1",
          stage: "Intake",
          detail: `Captured from ${input.source} (${input.sourceReference || "no reference"})`,
          actor: "You",
          capturedAt: now(),
          prevHash: "GENESIS",
          entryHash: "hash-1",
        },
      ],
    };
    this.changes = [change, ...this.changes];
    return delay(change);
  }

  /**
   * Stands in for Receive -> Improve -> Check.
   * The real backend runs three agents here; the mock produces a
   * representative enriched story so the screen can be exercised.
   */
  async enhanceStory(id: string): Promise<Change> {
    const change = this.scoped().find((c) => c.id === id);
    if (!change) throw new Error(`No change ${id}`);

    change.state = "REFINING";
    change.userStory = {
      statement: `As a user affected by this request, I want ${change.title.toLowerCase()}, so that the problem described in ${change.sourceReference || "the original request"} stops recurring.`,
      businessContext: change.originalRequest,
      acceptanceCriteria: [
        { id: "AC1", text: "The described behaviour no longer occurs for the affected users.", verifiedBy: "T1" },
      ],
      testScript: [
        { id: "T1", action: "Reproduce the original scenario", expected: "The described problem does not occur" },
      ],
      businessRules: [],
      assumptions: [],
      openQuestions: [
        "Which specific JD Edwards application and version does this affect?",
        "How often does this occur, and how many people does it affect?",
      ],
      qualityStatus: "needs_revision",
      revisionCount: 1,
    };
    change.updatedAt = now();
    change.updatedBy = "AI Intake";
    change.evidence.push({
      entryId: `E${change.evidence.length + 1}`,
      stage: "Quality gate",
      detail: "Story enriched; open questions remain before it can pass the quality gate",
      actor: "AI Check",
      capturedAt: now(),
      prevHash: `hash-${change.evidence.length}`,
      entryHash: `hash-${change.evidence.length + 1}`,
    });
    this.recordAgentRun("receive-agent", id);
    this.recordAgentRun("improve-agent", id);
    this.recordAgentRun("check-agent", id);
    return delay(change, 900);
  }

  async sendStoryBack(id: string, input: DecisionInput): Promise<Change> {
    return this.recordDecision(id, "REFINING", "Story returned for clarification", input);
  }

  async approveStoryForBacklog(id: string, input: DecisionInput): Promise<Change> {
    return this.recordDecision(id, "BACKLOG_READY", "Story passed the quality gate and reached the backlog", input);
  }

  async getBacklog(): Promise<Change[]> {
    return delay(this.scoped().filter((c) => c.state === "BACKLOG_READY"));
  }

  async approveChange(id: string, input: DecisionInput): Promise<Change> {
    const change = await this.recordDecision(id, "APPROVED", "Approved for implementation", input);
    change.storyApproval = {
      approvalId: `AP-${id}-S`,
      kind: "story",
      status: "approved",
      approvedBy: getMockSession().displayName,
      approvedAt: now(),
      note: input.note,
    };
    return change;
  }

  async rejectChange(id: string, input: DecisionInput): Promise<Change> {
    const change = await this.recordDecision(id, "REJECTED", "Rejected at backlog review", input);
    change.storyApproval = {
      approvalId: `AP-${id}-S`,
      kind: "story",
      status: "rejected",
      approvedBy: getMockSession().displayName,
      approvedAt: now(),
      note: input.note,
    };
    return change;
  }

  async approveExactChange(id: string, input: DecisionInput): Promise<Change> {
    const change = this.scoped().find((c) => c.id === id);
    if (!change) throw new Error(`No change ${id}`);
    // Same rule as the real gate: the company's approval policy decides
    // who may approve, and without one nobody can.
    const policy = this.engagementScopes.get(this.scope)?.approvalPolicy;
    if (!policy) {
      throw new Error(
        "This company has no approval policy, so nobody is authorised to approve an exact change. " +
          "An Admin must set one under Admin > ERP / JDE Landscape."
      );
    }
    const session = getMockSession();
    const roles = session.customers.find((c) => c.id === this.scope)?.roles ?? [];
    if (!roles.some((r) => (policy.exactChangeApproverRoles as string[]).includes(r))) {
      throw new Error(
        `${session.displayName} does not hold a role this company's approval policy allows ` +
          `(allowed: ${policy.exactChangeApproverRoles.join(", ")}).`
      );
    }
    change.changeApproval = {
      approvalId: `AP-${id}-C`,
      kind: "change",
      status: "approved",
      changeHash: "mock-hash-" + Math.random().toString(16).slice(2, 10),
      approvedBy: getMockSession().displayName,
      approvedAt: now(),
      expiresAt: new Date(Date.now() + policy.approvalValidHours * 3600000).toISOString(),
      note: input.note,
    };
    change.state = "CHANGE_APPROVED";
    change.updatedAt = now();
    change.updatedBy = getMockSession().displayName;
    change.evidence.push({
      entryId: `E${change.evidence.length + 1}`,
      stage: "Change approval",
      detail: `Exact change approved by ${getMockSession().displayName}`,
      actor: getMockSession().displayName,
      capturedAt: now(),
      prevHash: `hash-${change.evidence.length}`,
      entryHash: `hash-${change.evidence.length + 1}`,
    });
    this.recordAgentRun("architect", id);
    this.feedbackLog.push({ customerId: this.scope, kind: "exact_change_approval" });
    return delay(change);
  }

  async rejectExactChange(id: string, input: DecisionInput): Promise<Change> {
    const change = this.scoped().find((c) => c.id === id);
    if (!change) throw new Error(`No change ${id}`);
    change.changeApproval = {
      approvalId: `AP-${id}-C`,
      kind: "change",
      status: "rejected",
      approvedBy: getMockSession().displayName,
      approvedAt: now(),
      note: input.note,
    };
    change.state = "REJECTED";
    change.updatedAt = now();
    change.updatedBy = getMockSession().displayName;
    change.evidence.push({
      entryId: `E${change.evidence.length + 1}`,
      stage: "Change approval",
      detail: `Exact change rejected by ${getMockSession().displayName}${input.rejectionReason ? ` (${input.rejectionReason})` : ""}`,
      actor: getMockSession().displayName,
      capturedAt: now(),
      prevHash: `hash-${change.evidence.length}`,
      entryHash: `hash-${change.evidence.length + 1}`,
    });
    this.feedbackLog.push({ customerId: this.scope, kind: "exact_change_rejection", reasonCode: input.rejectionReason });
    return delay(change);
  }

  private async recordDecision(
    id: string,
    state: LifecycleState,
    detail: string,
    input: DecisionInput
  ): Promise<Change> {
    const change = this.scoped().find((c) => c.id === id);
    if (!change) throw new Error(`No change ${id}`);
    change.state = state;
    change.updatedAt = now();
    change.updatedBy = getMockSession().displayName;
    change.evidence.push({
      entryId: `E${change.evidence.length + 1}`,
      stage: "Decision",
      detail: input.note ? `${detail} — ${input.note}` : detail,
      actor: getMockSession().displayName,
      capturedAt: now(),
      prevHash: `hash-${change.evidence.length}`,
      entryHash: `hash-${change.evidence.length + 1}`,
    });
    return delay(change);
  }

  async getMetrics(): Promise<FactoryMetrics> {
    const all = this.scoped();
    const inState = (...s: LifecycleState[]) => all.filter((c) => s.includes(c.state)).length;

    const incomingRequests = inState("RECEIVED");
    const awaitingApproval = inState("BACKLOG_READY");
    const awaitingDomainOwner = all.filter(
      (c) => c.state === "BACKLOG_READY" && (!c.domainReviewStage || PRE_DOMAIN_OWNER_APPROVAL.has(c.domainReviewStage))
    ).length;
    // Gate 1 -- Domain Owner already approved, Application Manager hasn't
    // authorised it for delivery yet.
    const awaitingApplicationManager = all.filter(
      (c) => c.state === "BACKLOG_READY" && c.domainReviewStage === "ready_for_application_manager"
    ).length;
    // Gate 2 -- an exact change has been proposed and nobody has approved
    // or rejected it yet.
    const awaitingExactChangeApproval = all.filter((c) => c.exactChange && !c.changeApproval).length;
    const inDelivery = this.deliveryQueue.filter((e) => e.customerId === this.scope).length;
    const inBuild = inState("APPROVED", "ARCHITECTING", "SPEC_READY", "CHANGE_APPROVED", "EXECUTING");
    const inTesting = inState("TESTING");
    const completed = inState("CLOSED", "VALIDATED", "CNC_HANDOFF", "RESOLVED_WITHOUT_CHANGE");

    const typeCounts = new Map<ChangeType, number>();
    all.forEach((c) => typeCounts.set(c.changeType, (typeCounts.get(c.changeType) ?? 0) + 1));

    // Business impact: count approved changes that actually stated each criterion.
    const stated = (v: string) => v.trim().length > 0;
    const approved = all.filter((c) => c.storyApproval?.status === "approved");
    const impact = [
      { category: "Operational", count: approved.filter((c) => stated(c.businessImpact.operationalReach)).length },
      { category: "Financial", count: approved.filter((c) => stated(c.businessImpact.financialImpact)).length },
      { category: "Compliance", count: approved.filter((c) => stated(c.businessImpact.riskCompliance)).length },
      { category: "Strategic", count: approved.filter((c) => stated(c.businessImpact.strategicAlignment)).length },
      { category: "Time-critical", count: approved.filter((c) => stated(c.businessImpact.urgency)).length },
    ];

    const approvals = all.filter((c) => c.storyApproval).length;
    const rejections = all.filter((c) => c.storyApproval?.status === "rejected").length;
    const firstTimePass = all.filter((c) => c.userStory && c.userStory.revisionCount === 0).length;
    const withStory = all.filter((c) => c.userStory).length;

    return delay({
      totals: [
        { key: "incoming_requests", label: "Incoming Requests", value: incomingRequests, delta: 0 },
        { key: "awaiting_domain_owner", label: "User Stories awaiting Domain Owner approval", value: awaitingDomainOwner, delta: 0 },
        { key: "awaiting_application_manager", label: "User Stories awaiting Application Manager decision", value: awaitingApplicationManager, delta: 0 },
        { key: "awaiting_exact_change_approval", label: "Changes awaiting Exact Change Approval", value: awaitingExactChangeApproval, delta: 0 },
        { key: "in_delivery", label: "Changes in Delivery", value: inDelivery, delta: 0 },
        { key: "awaiting_business_validation", label: "Awaiting Business Validation", value: inTesting, delta: 0 },
        { key: "completed", label: "Completed", value: completed, delta: 0 },
      ],
      pipeline: [
        { stage: "New", count: inState("RECEIVED") },
        { stage: "Story enhancement", count: inState("REFINING") },
        { stage: "Awaiting approval", count: awaitingApproval },
        { stage: "In build", count: inBuild },
        { stage: "Testing", count: inTesting },
        { stage: "Completed", count: completed },
      ],
      changeTypes: Array.from(typeCounts.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      businessImpactBreakdown: impact.sort((a, b) => b.count - a.count),
      businessDomainBreakdown: this.domainBreakdown(all),
      performance: {
        averageCycleTimeDays: 4.2,
        averageCycleTimeDelta: -1.3,
        firstTimeSuccessRate: withStory ? Math.round((firstTimePass / withStory) * 100) : 0,
        firstTimeSuccessDelta: 6,
        humanApprovals: approvals,
        humanRejections: rejections,
        changeVolume: all.length,
        changeVolumeDelta: 33,
      },
    });
  }

  async getActivity(): Promise<ActivityEntry[]> {
    return delay(
      [...this.scoped()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6)
        .map((c) => ({
          time: new Date(c.updatedAt).toLocaleString("en-GB", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          }),
          changeId: c.id,
          description: c.title,
          state: c.state,
          updatedBy: c.updatedBy,
        }))
    );
  }

  async listBusinessDomains(): Promise<BusinessDomain[]> {
    return delay(this.businessDomains.filter((d) => d.customerId === this.scope));
  }

  /** Same rule as every other metric: derived from real records, never hard-coded. */
  private domainBreakdown(all: Change[]) {
    const governed = all.filter(
      (c) => !["RECEIVED", "REFINING", "REJECTED", "FAILED"].includes(c.state)
    );
    if (governed.length === 0) return [];

    const domainsById = new Map(this.businessDomains.map((d) => [d.id, d]));
    const counts = new Map<string | null, number>();
    for (const c of governed) {
      const key = c.businessDomainId ?? null;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([domainId, count]) => {
        const domain = domainId ? domainsById.get(domainId) : undefined;
        return {
          domainId,
          domainName: domain?.name ?? "Unclassified / needs review",
          apqcCode: domain?.apqcCode ?? "",
          count,
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  private ensureDomainReview(changeId: string): DomainReview {
    const existing = this.domainReviews.get(changeId);
    if (existing) return existing;
    const change = this.scoped().find((c) => c.id === changeId);
    if (!change?.userStory) throw new Error(`No user story yet for ${changeId}`);
    // A change that already carries an Architect decision or exact
    // change could only exist in the real system if its DomainReview
    // already cleared both gates -- static seed data (CHG-1041,
    // CHG-1039, ...) models the Change as already past Architecture
    // Review without ever separately seeding the DomainReview sidecar
    // that got it there. Infer that here rather than defaulting every
    // first-touched change to "ready_for_domain_owner" regardless of
    // how far along it actually is -- otherwise Architecture Review's
    // "Flag for Domain Owner reconsideration" (which requires an
    // already-approved stage) would wrongly refuse on these.
    const alreadyPastGate1 = Boolean(change.architectDecision || change.exactChange);
    const approvedBy = change.storyApproval?.approvedBy ?? "Application Manager";
    const approvedAt = change.storyApproval?.approvedAt ?? now();
    const review: DomainReview = {
      changeId,
      domainClassificationUncertain: false,
      domainClassificationNote: "",
      stage: alreadyPastGate1 ? "application_manager_approved" : "ready_for_domain_owner",
      history: [
        { label: "ai_generated", userStory: change.userStory, actor: "Check Agent", note: "", capturedAt: now() },
      ],
      conversation: [],
      ...(alreadyPastGate1
        ? {
            domainOwnerApproval: {
              approvalId: `AP-${changeId}-DO`, kind: "domain_owner" as const, status: "approved" as const,
              approvedBy, approvedAt, note: "",
            },
            applicationManagerApproval: {
              approvalId: `AP-${changeId}-AM`, kind: "application_manager" as const, status: "approved" as const,
              approvedBy, approvedAt, note: "",
            },
          }
        : {}),
      updatedAt: now(),
    };
    this.domainReviews.set(changeId, review);
    return review;
  }

  private saveDomainReview(review: DomainReview): DomainReview {
    review.updatedAt = now();
    this.domainReviews.set(review.changeId, review);
    const change = this.scoped().find((c) => c.id === review.changeId);
    if (change) {
      change.businessDomainId = review.businessDomainId;
      change.domainReviewStage = review.stage;
    }
    // A fresh object, not the stored reference: callers set React state
    // directly from this return value, and a setState call given the
    // SAME reference as current state is a silent no-op (Object.is
    // bails the re-render) even though the stored copy was genuinely
    // mutated -- this bit askAboutRequirement below exactly that way
    // when it was the only state update in its round trip.
    return { ...review };
  }

  async getDomainReview(changeId: string): Promise<DomainReview | undefined> {
    const change = this.scoped().find((c) => c.id === changeId);
    if (!change?.userStory) return delay(undefined);
    return delay({ ...this.ensureDomainReview(changeId) });
  }

  async assignBusinessDomain(
    changeId: string,
    input: { businessDomainId?: string; uncertain?: boolean; note?: string }
  ): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    review.businessDomainId = input.uncertain ? undefined : input.businessDomainId;
    review.domainClassificationUncertain = input.uncertain ?? false;
    review.domainClassificationNote = input.note ?? "";
    return delay(this.saveDomainReview(review));
  }

  async startDomainOwnerReview(changeId: string, _input: DecisionInput): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    if (review.stage === "ready_for_domain_owner") review.stage = "domain_owner_reviewing";
    return delay(this.saveDomainReview(review));
  }

  /**
   * Simulates the Reviewer Agent the same way enhanceStory() simulates
   * Receive/Improve/Check: a representative, deterministic pass rather
   * than a real model call — the workflow shape (edit is never the
   * final version) is what this mock exists to exercise.
   */
  async submitDomainOwnerEdit(
    changeId: string,
    input: { note?: string; userStory: UserStory }
  ): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    if (review.stage !== "domain_owner_reviewing") {
      throw new Error(`Cannot submit an edit from stage ${review.stage}`);
    }
    const editVersion: StoryVersion = {
      label: "domain_owner_edit",
      userStory: input.userStory,
      actor: getMockSession().displayName,
      note: input.note ?? "",
      capturedAt: now(),
    };
    review.history.push(editVersion);
    review.stage = "reviewer_agent_refining";

    // Deterministic, not trusted from input.userStory: the count before
    // this edit cycle is the honest reference point, matching the real
    // backend's own rule (a Domain Owner's edited draft doesn't reliably
    // carry the prior count either).
    const priorCount = review.history[review.history.length - 2]?.userStory.revisionCount ?? 0;
    const revised: UserStory = {
      ...input.userStory,
      businessContext: `${input.userStory.businessContext} (Reviewer Agent pass: wording tightened and criteria re-checked for testability.)`,
      qualityStatus: "passed",
      revisionCount: priorCount + 1,
    };
    review.history.push({
      label: "reviewer_agent_revision",
      userStory: revised,
      actor: "Reviewer Agent",
      note: "",
      capturedAt: now(),
    });
    review.stage = "domain_owner_reviewing";
    this.recordAgentRun("improve-agent", changeId);
    this.feedbackLog.push({ customerId: this.scope, kind: "domain_owner_edit" });
    return delay(this.saveDomainReview(review), 500);
  }

  async approveDomainOwnerStory(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    if (review.stage !== "domain_owner_reviewing") {
      throw new Error(`Cannot approve from stage ${review.stage}`);
    }
    review.domainOwnerApproval = {
      approvalId: `AP-${changeId}-DO`,
      kind: "domain_owner",
      status: "approved",
      approvedBy: getMockSession().displayName,
      approvedAt: now(),
      note: input.note,
      identityId: getMockSession().userId,
    };
    review.stage = "ready_for_application_manager";
    return delay(this.saveDomainReview(review));
  }

  async rejectDomainOwnerStory(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    if (review.stage !== "domain_owner_reviewing") {
      throw new Error(`Cannot reject from stage ${review.stage}`);
    }
    review.domainOwnerApproval = {
      approvalId: `AP-${changeId}-DO`,
      kind: "domain_owner",
      status: "rejected",
      approvedBy: getMockSession().displayName,
      approvedAt: now(),
      note: input.note,
      identityId: getMockSession().userId,
    };
    // Terminal: recorded in this sidecar only, same as approval never
    // calling into mcp_server -- Change.state is untouched.
    review.stage = "domain_owner_rejected";
    this.feedbackLog.push({ customerId: this.scope, kind: "domain_owner_rejection", reasonCode: input.rejectionReason });
    return delay(this.saveDomainReview(review));
  }

  async approveForDelivery(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    if (review.stage !== "ready_for_application_manager") {
      throw new Error(`Cannot approve for delivery from stage ${review.stage}`);
    }
    review.applicationManagerApproval = {
      approvalId: `AP-${changeId}-AM`,
      kind: "application_manager",
      status: "approved",
      approvedBy: getMockSession().displayName,
      approvedAt: now(),
      note: input.note,
      identityId: getMockSession().userId,
    };
    review.stage = "application_manager_approved";
    this.saveDomainReview(review);

    // Mirrors the real backend: only Application Manager approval
    // actually clears the story for build, and adds it to the
    // Delivery Queue -- not a Sprint, just an ordered queue entry.
    await this.approveChange(changeId, input);
    if (!this.deliveryQueue.some((e) => e.changeId === changeId)) {
      const customerId = this.scope;
      this.deliveryQueue.push({
        changeId,
        customerId,
        position: this.deliveryQueue.filter((e) => e.customerId === customerId).length + 1,
        status: "queued",
        addedBy: getMockSession().displayName,
        addedAt: now(),
        note: input.note,
      });
    }
    return { ...review };
  }

  /**
   * Mock stand-in for conversation_driver.py -- a simple heuristic
   * (question-shaped text -> explanation, anything else -> a proposed
   * amendment appending it as a business rule) so "Ask Jade about this
   * requirement" is exercisable end to end without a real model call,
   * the same "representative, not real" convention enhanceStory above
   * already uses.
   */
  async askAboutRequirement(changeId: string, input: { question: string }): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    if (review.history.length === 0) throw new Error(`No requirement to discuss yet for ${changeId}`);
    const currentStory = review.history[review.history.length - 1].userStory;
    const q = input.question.trim();
    const looksLikeAQuestion = /^(why|what|how|is|does|can|could|explain|when|who|where)\b/i.test(q) || q.endsWith("?");

    const turn: ConversationTurn = looksLikeAQuestion
      ? {
          turnId: `CONV-${Math.random().toString(16).slice(2, 10)}`,
          askedBy: getMockSession().displayName,
          question: q,
          answer: currentStory.businessContext || currentStory.statement,
          kind: "explanation",
          askedAt: now(),
        }
      : {
          turnId: `CONV-${Math.random().toString(16).slice(2, 10)}`,
          askedBy: getMockSession().displayName,
          question: q,
          answer: "That reads like new information rather than a question — here is how I would update the requirement to include it. Nothing changes until you review and submit it.",
          kind: "proposed_amendment",
          proposedUserStory: { ...currentStory, businessRules: [...currentStory.businessRules, q] },
          askedAt: now(),
        };

    review.conversation = [...review.conversation, turn];
    return delay(this.saveDomainReview(review), 500);
  }

  async requestRequirementReconsideration(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    const reconsiderable = new Set(["domain_owner_approved", "ready_for_application_manager", "application_manager_approved"]);
    if (!reconsiderable.has(review.stage)) {
      throw new Error(`Cannot request reconsideration from stage ${review.stage}`);
    }
    review.stage = "domain_owner_reviewing";
    this.feedbackLog.push({ customerId: this.scope, kind: "requirement_reconsideration_requested" });
    return delay(this.saveDomainReview(review));
  }

  async rejectForDelivery(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    if (review.stage !== "ready_for_application_manager") {
      throw new Error(`Cannot reject for delivery from stage ${review.stage}`);
    }
    review.applicationManagerApproval = {
      approvalId: `AP-${changeId}-AM`,
      kind: "application_manager",
      status: "rejected",
      approvedBy: getMockSession().displayName,
      approvedAt: now(),
      note: input.note,
      identityId: getMockSession().userId,
    };
    review.stage = "application_manager_rejected";
    this.saveDomainReview(review);

    // Mirrors the real backend: this is the one Domain Review rejection
    // that reaches Gate 2 (backlog.reject()) -- Change.state becomes
    // REJECTED and no Delivery Queue entry is ever created.
    await this.rejectChange(changeId, input);
    this.feedbackLog.push({ customerId: this.scope, kind: "application_manager_rejection", reasonCode: input.rejectionReason });
    return { ...review };
  }

  /**
   * Lazily materialised from the Change's own (static seed) architect
   * decision/implementation spec, the first time either is asked for --
   * same convention as ensureDomainReview. undefined when Architecture
   * Review hasn't produced anything yet for this change (the mock never
   * synthesises one on its own, same honest limitation as this file's
   * existing "architectDecision is seed data only" note).
   */
  private ensureArchitectureReview(changeId: string): ArchitectureReviewRun | undefined {
    const existing = this.architectureReviews.get(changeId);
    if (existing) return existing;
    const change = this.scoped().find((c) => c.id === changeId);
    if (!change?.architectDecision || !change.implementationSpec) return undefined;
    const run: ArchitectureReviewRun = {
      storyId: changeId,
      stage: "done",
      startedAt: change.architectDecision.decidedAt,
      updatedAt: change.architectDecision.decidedAt,
      architectDecision: change.architectDecision,
      implementationSpec: change.implementationSpec,
      history: [
        {
          architectDecision: change.architectDecision,
          implementationSpec: change.implementationSpec,
          note: "",
          capturedAt: change.architectDecision.decidedAt,
        },
      ],
      conversation: [],
    };
    this.architectureReviews.set(changeId, run);
    return run;
  }

  private saveArchitectureReview(run: ArchitectureReviewRun): ArchitectureReviewRun {
    run.updatedAt = now();
    this.architectureReviews.set(run.storyId, run);
    // Same fresh-object rule saveDomainReview's own comment explains --
    // never return the stored reference.
    return { ...run };
  }

  async getArchitectureReview(changeId: string): Promise<ArchitectureReviewRun | undefined> {
    const run = this.ensureArchitectureReview(changeId);
    return delay(run ? { ...run } : undefined);
  }

  /**
   * Mock stand-in for conversation_driver.ask_about_solution -- same
   * question-shaped heuristic as askAboutRequirement above, but there is
   * never a draft to propose: a non-question input only ever recommends
   * re-running Architecture Review (kind "recommend_reanalysis"), never
   * an inline amendment.
   */
  async askAboutSolution(changeId: string, input: { question: string }): Promise<ArchitectureReviewRun> {
    const run = this.ensureArchitectureReview(changeId);
    if (!run || run.history.length === 0) throw new Error(`No completed architecture review to discuss yet for ${changeId}`);
    const latest = run.history[run.history.length - 1];
    const q = input.question.trim();
    const looksLikeAQuestion = /^(why|what|how|is|does|can|could|explain|when|who|where)\b/i.test(q) || q.endsWith("?");

    const turn: ConversationTurn = looksLikeAQuestion
      ? {
          turnId: `CONV-${Math.random().toString(16).slice(2, 10)}`,
          askedBy: getMockSession().displayName,
          question: q,
          answer:
            latest.architectDecision.existingFunctionalityFound ||
            `Recommended route: ${latest.architectDecision.recommendedRoute}.`,
          kind: "explanation",
          askedAt: now(),
        }
      : {
          turnId: `CONV-${Math.random().toString(16).slice(2, 10)}`,
          askedBy: getMockSession().displayName,
          question: q,
          answer:
            "That reads like new information that could change the recommended approach. I can't redo the analysis here -- this looks worth a fresh Architecture Review run.",
          kind: "recommend_reanalysis",
          askedAt: now(),
        };

    run.conversation = [...run.conversation, turn];
    return delay(this.saveArchitectureReview(run), 500);
  }

  /**
   * Mock stand-in for the existing manual retrigger -- a real re-run
   * would call the architect subagent again; the mock has no dynamic
   * architect to call (architectDecision here is static seed data, see
   * ensureArchitectureReview's own comment), so it appends a fresh
   * history entry confirming the same recommendation rather than
   * fabricating a different one. What matters for this flow is that it
   * APPENDS -- never overwrites -- the prior entry, same as the real
   * backend's complete().
   */
  async retriggerArchitectureReview(changeId: string): Promise<void> {
    const run = this.ensureArchitectureReview(changeId);
    if (!run || run.history.length === 0) throw new Error(`No architecture review yet for ${changeId}`);
    const latest = run.history[run.history.length - 1];
    run.history = [...run.history, { ...latest, note: "Re-run via manual retrigger.", capturedAt: now() }];
    this.saveArchitectureReview(run);
    await delay(undefined, 400);
  }

  async listDeliveryQueue(): Promise<DeliveryQueueEntry[]> {
    const customerId = this.scope;
    return delay(
      this.deliveryQueue.filter((e) => e.customerId === customerId).sort((a, b) => a.position - b.position)
    );
  }

  /* ---------------------------------------------------------------- */
  /* Administration                                                    */
  /* ---------------------------------------------------------------- */

  async getCustomerProfile(): Promise<CustomerProfile> {
    const customer = CUSTOMERS.find((c) => c.id === this.scope);
    if (!customer) throw new Error(`No such customer: ${this.scope}`);
    return delay({ customer, identities: identitiesForCustomer(this.scope) });
  }

  async getErpLandscape(): Promise<ErpLandscape> {
    const customer = CUSTOMERS.find((c) => c.id === this.scope);
    if (!customer) throw new Error(`No such customer: ${this.scope}`);
    const scope = this.engagementScopes.get(this.scope);
    const configured = !!scope && (scope.functionalAgent.approvedVersions.length > 0 || scope.technicalAgent.authorizedObjectTypes.length > 0);
    return delay({
      customerId: this.scope,
      toolsRelease: customer.toolsRelease,
      environment: customer.environment,
      // The mock always presents mock mode, unconfigured -- the same
      // honest "nothing is live yet" state the real backend reports
      // when JDE_MCP_MOCK_MODE=true and no AIS credentials are set.
      ais: { mockMode: true, baseUrlConfigured: false },
      engagementScopeConfigured: configured,
      scopeGloballySharedNote:
        "The Engagement Scope below is this company's own and is what the execution gate enforces for its " +
        "stories: approved versions, dated spike experiments, the DEV environment binding and the approval " +
        "policy. The JDE (AIS) connection itself is still one deployment-wide setting shared by every company; " +
        "making it per-company is a later step.",
    });
  }

  async getEngagementScope(): Promise<EngagementScope> {
    const existing = this.engagementScopes.get(this.scope);
    if (existing) return delay(existing);
    return delay({
      customerId: this.scope,
      toolsRelease: "",
      functionalAgent: { approvedVersions: [], spikeExperiments: [], neverTouchCategories: [], approvers: [] },
      technicalAgent: { authorizedObjectTypes: [], reservedProductCode: "", namingPrefix: "", approvers: [] },
      revision: 0,
    });
  }

  async updateEngagementScope(input: EngagementScopeUpdateInput): Promise<EngagementScope> {
    const existing = this.engagementScopes.get(this.scope);
    const revision = nextRevision(existing?.revision, input.expectedRevision);
    const actor = getMockSession().displayName;
    const stamp = now();
    const scope: EngagementScope = {
      customerId: this.scope,
      toolsRelease: input.toolsRelease,
      environment: input.environment,
      functionalAgent: {
        ...input.functionalAgent,
        spikeExperiments: (input.functionalAgent.spikeExperiments ?? []).map((s) => ({
          ...s,
          approvedBy: s.approvedBy ?? actor,
          approvedAt: s.approvedAt ?? stamp,
        })),
      },
      technicalAgent: input.technicalAgent,
      approvalPolicy: input.approvalPolicy ?? null,
      revision,
      updatedAt: stamp,
      updatedBy: actor,
    };
    this.engagementScopes.set(this.scope, scope);
    return delay(scope);
  }

  async getDashboardThresholds(): Promise<DashboardThresholds> {
    return delay(this.dashboardThresholds.get(this.scope) ?? { ...DEFAULT_DASHBOARD_THRESHOLDS });
  }

  async updateDashboardThresholds(input: DashboardThresholdsUpdateInput): Promise<DashboardThresholds> {
    const existing = this.dashboardThresholds.get(this.scope);
    const thresholds: DashboardThresholds = {
      warnAt: input.warnAt,
      criticalAt: input.criticalAt,
      configured: true,
      revision: nextRevision(existing?.revision, input.expectedRevision),
      updatedAt: now(),
      updatedBy: getMockSession().displayName,
    };
    this.dashboardThresholds.set(this.scope, thresholds);
    return delay(thresholds);
  }

  async listAgents(): Promise<AgentDefinition[]> {
    return delay(MOCK_AGENTS);
  }

  async listCapabilities(): Promise<CapabilityCatalog> {
    return delay(MOCK_CAPABILITY_CATALOG);
  }

  async getAgentHealth(agentName: string): Promise<AgentHealth> {
    const runs = this.agentRuns.get(agentName) ?? [];
    const runCounts: Record<string, number> = {};
    for (const r of runs) runCounts[r.stage] = (runCounts[r.stage] ?? 0) + 1;

    const feedbackKinds: Record<string, string[]> = {
      architect: ["exact_change_approval", "exact_change_rejection"],
      "improve-agent": ["domain_owner_edit", "domain_owner_rejection"],
    };
    const kinds = feedbackKinds[agentName] ?? [];
    const customerFeedback = this.feedbackLog.filter((f) => f.customerId === this.scope);
    const feedback: FeedbackSummary[] = kinds
      .map((kind) => {
        const matching = customerFeedback.filter((f) => f.kind === kind);
        const reasons: Record<string, number> = {};
        for (const f of matching) if (f.reasonCode) reasons[f.reasonCode] = (reasons[f.reasonCode] ?? 0) + 1;
        return { kind, count: matching.length, reasons };
      })
      .filter((f) => f.count > 0);

    return delay({ agentName, recentRuns: runs, runCounts, feedback });
  }

  async createBusinessDomain(input: BusinessDomainCreateInput): Promise<BusinessDomain> {
    const domain: BusinessDomain = {
      id: `DOM-${Math.random().toString(16).slice(2, 10)}`,
      customerId: this.scope,
      apqcCode: input.apqcCode,
      name: input.name,
      level: input.level,
      description: input.description ?? "",
      domainOwner: input.domainOwner ?? "",
      status: "active",
      revision: 1,
      updatedAt: now(),
      updatedBy: getMockSession().displayName,
    };
    this.businessDomains = [...this.businessDomains, domain];
    return delay(domain);
  }

  async updateBusinessDomainStatus(
    domainId: string,
    status: BusinessDomain["status"],
    expectedRevision: number
  ): Promise<BusinessDomain> {
    const domain = this.businessDomains.find((d) => d.id === domainId && d.customerId === this.scope);
    if (!domain) throw new Error(`No such business domain: ${domainId}`);
    domain.revision = nextRevision(domain.revision, expectedRevision);
    domain.status = status;
    domain.updatedAt = now();
    domain.updatedBy = getMockSession().displayName;
    return delay(domain);
  }

  async listIntegrations(): Promise<IntegrationStatus[]> {
    const jira = this.jiraConfigs.get(this.scope);
    const jiraConfigured = !!jira && jiraIsConfigured(jira);
    return delay([
      { name: "JD Edwards (AIS)", connected: false, detail: "Running in mock mode -- see ERP / JDE Landscape for connection status" },
      {
        name: "Jira Service Management",
        connected: false,
        detail: jiraConfigured
          ? `Running in mock mode -- configured for project ${jira!.projectKey}, try "Sync now" below`
          : "Running in mock mode -- see Jira below to configure and try a sync",
      },
      { name: "Topdesk", connected: false, detail: "Not connected -- source and source reference are free-text fields today, no live connector" },
      { name: "Slack / Teams approvals", connected: false, detail: "Not connected -- approvals happen in-app today" },
    ]);
  }

  async getJiraIntegration(): Promise<JiraIntegrationConfig> {
    const existing = this.jiraConfigs.get(this.scope);
    if (existing) return delay(existing);
    return delay({
      customerId: this.scope, baseUrl: "", projectKey: "", pickupStatus: "", postPickupStatus: "",
      jadeIdField: "", requestTypeField: "", revision: 0,
    });
  }

  async updateJiraIntegration(input: JiraIntegrationConfigUpdateInput): Promise<JiraIntegrationConfig> {
    const revision = nextRevision(this.jiraConfigs.get(this.scope)?.revision, input.expectedRevision);
    const config: JiraIntegrationConfig = {
      customerId: this.scope,
      baseUrl: normalizeJiraBaseUrl(input.baseUrl),
      projectKey: input.projectKey,
      pickupStatus: input.pickupStatus,
      postPickupStatus: input.postPickupStatus,
      jadeIdField: input.jadeIdField,
      requestTypeField: input.requestTypeField,
      revision,
      updatedAt: now(),
      updatedBy: getMockSession().displayName,
    };
    this.jiraConfigs.set(this.scope, config);
    return delay(config);
  }

  async getJiraIntegrationStatus(): Promise<JiraConnectionStatus> {
    const config = this.jiraConfigs.get(this.scope);
    const creds = this.jiraCredentials.get(this.scope);
    return delay({
      mockMode: true,
      credentialsConfigured: !!creds && !!creds.email && !!creds.apiToken,
      configConfigured: !!config && jiraIsConfigured(config),
    });
  }

  async updateJiraCredentials(input: JiraCredentialsUpdateInput): Promise<JiraConnectionStatus> {
    this.jiraCredentials.set(this.scope, { email: input.email, apiToken: input.apiToken });
    return this.getJiraIntegrationStatus();
  }

  async disconnectJiraCredentials(): Promise<JiraConnectionStatus> {
    this.jiraCredentials.delete(this.scope);
    return this.getJiraIntegrationStatus();
  }

  /**
   * Mock stand-in for jira_gateway.test_live_connection -- there is no
   * real Jira site to call here, so this is a representative check
   * (are the required fields present?) rather than a real HTTP round
   * trip, same "representative, not real" convention enhanceStory
   * already uses elsewhere in this file. Never persists anything.
   */
  async testJiraConnection(input: JiraTestConnectionInput): Promise<JiraTestConnectionResult> {
    await delay(undefined, 500);
    if (!input.email.trim() || !input.apiToken.trim()) return { ok: false, message: "Email and API token are both required." };
    let site: string;
    try {
      site = normalizeJiraBaseUrl(input.baseUrl);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Invalid Jira site URL." };
    }
    if (input.projectKey?.trim()) {
      return { ok: true, message: `Connected to ${site} as ${input.email}. Project '${input.projectKey}' is accessible. (mock check -- no real Jira call was made)` };
    }
    return { ok: true, message: `Connected to ${site} as ${input.email}. (mock check -- no real Jira call was made)` };
  }

  async syncJiraIntegration(): Promise<JiraSyncResult> {
    const config = this.jiraConfigs.get(this.scope);
    if (!config || !jiraIsConfigured(config)) {
      throw new Error("Jira is not fully configured for this customer -- set it up under Admin > Integrations > Jira first.");
    }
    let issues = this.jiraMockIssues.get(this.scope);
    if (!issues) {
      issues = defaultJiraFixture();
      this.jiraMockIssues.set(this.scope, issues);
    }

    const picked = issues.filter((i) => i.status === config.pickupStatus);
    const imported: string[] = [];
    const updatedInJira: string[] = [];
    const errors: JiraSyncError[] = [];

    for (const issue of picked) {
      const stableId = `CR-JIRA-${issue.key}`;
      if (!this.changes.some((c) => c.id === stableId)) {
        // Intake only -- never triggers enhanceStory itself.
        const change: Change = {
          id: stableId,
          customerId: this.scope,
          title: issue.summary,
          source: "Jira",
          sourceReference: `Jira ${issue.key}`,
          originalRequest: issue.description,
          changeType: "Other",
          state: "RECEIVED",
          priority: "Medium",
          complexitySignal: "Unknown",
          businessImpact: { financialImpact: "", operationalReach: "", riskCompliance: "", strategicAlignment: "", urgency: "" },
          createdAt: issue.createdAt,
          updatedAt: now(),
          updatedBy: issue.reporter,
          sourceMetadata: { ...issue.metadata },
          evidence: [],
        };
        this.changes = [change, ...this.changes];
        imported.push(stableId);
      }

      // Idempotency short-circuit -- skip a duplicate comment on retry.
      if (issue.fields[config.jadeIdField] !== stableId) {
        issue.fields[config.jadeIdField] = stableId;
        issue.comments.push(`Jade has accepted this request. Jade Change ID: ${stableId}`);
      }
      issue.status = config.postPickupStatus;
      updatedInJira.push(issue.key);
    }

    return delay({ considered: picked.length, imported, updatedInJira, errors }, 400);
  }

  /* ---------------------------------------------------------------- */
  /* Admin > Users -- company members and invitations. The mock has no */
  /* real per-user login (see session.ts's persona picker), so "who    */
  /* invited this" is always the active persona's own display name.   */
  /* ---------------------------------------------------------------- */

  async listCompanyUsers(): Promise<CompanyUsersOut> {
    return delay({
      members: this.ensureCompanyMembers(this.scope),
      invitations: this.invitations.get(this.scope) ?? [],
    });
  }

  async inviteUser(input: InviteInput): Promise<InvitationOut> {
    const session = getMockSession();
    const nowIso = new Date().toISOString();
    const invitation: InvitationOut = {
      id: `inv-${Math.random().toString(16).slice(2, 10)}`,
      email: input.email,
      roles: input.roles,
      domainIds: input.domainIds,
      status: "pending",
      createdAt: nowIso,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      invitedByDisplayName: session.displayName,
      previewUrl: `${window.location.origin}${window.location.pathname}?acceptInvitation=mock-${Math.random().toString(16).slice(2, 10)}`,
    };
    const list = this.invitations.get(this.scope) ?? [];
    this.invitations.set(this.scope, [invitation, ...list]);
    return delay(invitation);
  }

  private findInvitation(invitationId: string): InvitationOut {
    const list = this.invitations.get(this.scope) ?? [];
    const invitation = list.find((i) => i.id === invitationId);
    if (!invitation) throw new Error(`No such invitation: ${invitationId}`);
    return invitation;
  }

  async resendInvitation(invitationId: string): Promise<InvitationOut> {
    const invitation = this.findInvitation(invitationId);
    invitation.status = "pending";
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    invitation.previewUrl = `${window.location.origin}${window.location.pathname}?acceptInvitation=mock-${Math.random().toString(16).slice(2, 10)}`;
    return delay(invitation);
  }

  async revokeInvitation(invitationId: string): Promise<InvitationOut> {
    const invitation = this.findInvitation(invitationId);
    invitation.status = "revoked";
    invitation.previewUrl = null;
    return delay(invitation);
  }

  private findMembership(membershipId: string): MembershipOut {
    const members = this.ensureCompanyMembers(this.scope);
    const member = members.find((m) => m.membershipId === membershipId);
    if (!member) throw new Error(`No such company member: ${membershipId}`);
    return member;
  }

  private assertNotLastActiveAdmin(members: MembershipOut[], membershipId: string): void {
    const otherActiveAdmins = members.some(
      (m) => m.membershipId !== membershipId && m.status === "active" && m.roles.includes("admin")
    );
    const target = members.find((m) => m.membershipId === membershipId);
    if (target?.roles.includes("admin") && target.status === "active" && !otherActiveAdmins) {
      throw new Error("Cannot remove the last active Admin from a company.");
    }
  }

  async updateMembershipRoles(membershipId: string, input: UpdateMembershipInput): Promise<MembershipOut> {
    const members = this.ensureCompanyMembers(this.scope);
    if (!input.roles.includes("admin")) this.assertNotLastActiveAdmin(members, membershipId);
    const member = this.findMembership(membershipId);
    member.roles = input.roles;
    member.domainIds = input.domainIds;
    return delay(member);
  }

  async deactivateMembership(membershipId: string): Promise<MembershipOut> {
    const members = this.ensureCompanyMembers(this.scope);
    this.assertNotLastActiveAdmin(members, membershipId);
    const member = this.findMembership(membershipId);
    member.status = "inactive";
    return delay(member);
  }

  async reactivateMembership(membershipId: string): Promise<MembershipOut> {
    const member = this.findMembership(membershipId);
    member.status = "active";
    return delay(member);
  }
}

function jiraIsConfigured(c: JiraIntegrationConfig): boolean {
  return !!(c.baseUrl && c.projectKey && c.pickupStatus && c.postPickupStatus && c.jadeIdField);
}

/** Mirrors jira_gateway.normalize_jira_base_url on the real backend -- same rule, same error text shape. */
function normalizeJiraBaseUrl(raw: string): string {
  const candidate = raw.trim().replace(/\/+$/, "");
  if (!candidate) throw new Error("Jira site URL is required.");
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Jira site URL must be a full URL, e.g. https://yourcompany.atlassian.net.");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Jira site URL must be a full URL, e.g. https://yourcompany.atlassian.net.");
  }
  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error(
      "Jira site URL should be the site's base URL only (e.g. https://yourcompany.atlassian.net) -- not a project, queue, board or issue link."
    );
  }
  return `${parsed.protocol}//${parsed.host}`;
}
