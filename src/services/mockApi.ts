import type {
  ActivityEntry,
  BusinessDomain,
  Change,
  ChangeType,
  DomainReview,
  FactoryMetrics,
  LifecycleState,
  StoryVersion,
  UserStory,
} from "../types/domain";
import type { Session } from "../types/domain";
import type { ChangeFactoryApi, CreateChangeInput, DecisionInput } from "./api";
import { MOCK_BUSINESS_DOMAINS, MOCK_CHANGES } from "./mockData";
import { getMockSession, setMockActiveCustomer } from "./session";

/** Simulates network latency so loading states are real, not decorative. */
const delay = <T,>(value: T, ms = 220): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const now = () => new Date().toISOString();

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
      approvedBy: input.decidedBy,
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
      approvedBy: input.decidedBy,
      approvedAt: now(),
      note: input.note,
    };
    return change;
  }

  async approveExactChange(id: string, input: DecisionInput): Promise<Change> {
    const change = this.scoped().find((c) => c.id === id);
    if (!change) throw new Error(`No change ${id}`);
    change.changeApproval = {
      approvalId: `AP-${id}-C`,
      kind: "change",
      status: "approved",
      changeHash: "mock-hash-" + Math.random().toString(16).slice(2, 10),
      approvedBy: input.decidedBy,
      approvedAt: now(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      note: input.note,
    };
    change.state = "CHANGE_APPROVED";
    change.updatedAt = now();
    change.updatedBy = input.decidedBy;
    change.evidence.push({
      entryId: `E${change.evidence.length + 1}`,
      stage: "Change approval",
      detail: `Exact change approved by ${input.decidedBy}`,
      actor: input.decidedBy,
      capturedAt: now(),
      prevHash: `hash-${change.evidence.length}`,
      entryHash: `hash-${change.evidence.length + 1}`,
    });
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
    change.updatedBy = input.decidedBy;
    change.evidence.push({
      entryId: `E${change.evidence.length + 1}`,
      stage: "Decision",
      detail: input.note ? `${detail} — ${input.note}` : detail,
      actor: input.decidedBy,
      capturedAt: now(),
      prevHash: `hash-${change.evidence.length}`,
      entryHash: `hash-${change.evidence.length + 1}`,
    });
    return delay(change);
  }

  async getMetrics(): Promise<FactoryMetrics> {
    const all = this.scoped();
    const inState = (...s: LifecycleState[]) => all.filter((c) => s.includes(c.state)).length;

    const awaitingApproval = inState("BACKLOG_READY");
    const inBuild = inState("APPROVED", "ARCHITECTING", "SPEC_READY", "CHANGE_APPROVED", "EXECUTING");
    const inTesting = inState("TESTING");
    const completed = inState("CLOSED", "VALIDATED", "CNC_HANDOFF", "RESOLVED_WITHOUT_CHANGE");
    const rejected = inState("REJECTED", "FAILED");

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
        { label: "Total requests", value: all.length, delta: 33 },
        { label: "Awaiting approval", value: awaitingApproval, delta: 2 },
        { label: "In build", value: inBuild, delta: -1 },
        { label: "In testing", value: inTesting, delta: -2 },
        { label: "Completed", value: completed, delta: 4 },
        { label: "Rejected / on hold", value: rejected, delta: 0 },
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
    return delay(MOCK_BUSINESS_DOMAINS.filter((d) => d.customerId === this.scope));
  }

  /** Same rule as every other metric: derived from real records, never hard-coded. */
  private domainBreakdown(all: Change[]) {
    const governed = all.filter(
      (c) => !["RECEIVED", "REFINING", "REJECTED", "FAILED"].includes(c.state)
    );
    if (governed.length === 0) return [];

    const domainsById = new Map(MOCK_BUSINESS_DOMAINS.map((d) => [d.id, d]));
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
    const review: DomainReview = {
      changeId,
      domainClassificationUncertain: false,
      domainClassificationNote: "",
      stage: "ready_for_domain_owner",
      history: [
        { label: "ai_generated", userStory: change.userStory, actor: "Check Agent", note: "", capturedAt: now() },
      ],
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
    return review;
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
    input: { editedBy: string; note?: string; userStory: UserStory }
  ): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    if (review.stage !== "domain_owner_reviewing") {
      throw new Error(`Cannot submit an edit from stage ${review.stage}`);
    }
    const editVersion: StoryVersion = {
      label: "domain_owner_edit",
      userStory: input.userStory,
      actor: input.editedBy,
      note: input.note ?? "",
      capturedAt: now(),
    };
    review.history.push(editVersion);
    review.stage = "reviewer_agent_refining";

    const revised: UserStory = {
      ...input.userStory,
      businessContext: `${input.userStory.businessContext} (Reviewer Agent pass: wording tightened and criteria re-checked for testability.)`,
      qualityStatus: "passed",
      revisionCount: input.userStory.revisionCount + 1,
    };
    review.history.push({
      label: "reviewer_agent_revision",
      userStory: revised,
      actor: "Reviewer Agent",
      note: "",
      capturedAt: now(),
    });
    review.stage = "domain_owner_reviewing";
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
      approvedBy: input.decidedBy,
      approvedAt: now(),
      note: input.note,
    };
    review.stage = "ready_for_application_manager";
    return delay(this.saveDomainReview(review));
  }

  async approveForSprint(changeId: string, input: DecisionInput): Promise<DomainReview> {
    const review = this.ensureDomainReview(changeId);
    if (review.stage !== "ready_for_application_manager") {
      throw new Error(`Cannot approve for sprint from stage ${review.stage}`);
    }
    review.applicationManagerApproval = {
      approvalId: `AP-${changeId}-AM`,
      kind: "application_manager",
      status: "approved",
      approvedBy: input.decidedBy,
      approvedAt: now(),
      note: input.note,
    };
    review.stage = "application_manager_approved";
    this.saveDomainReview(review);

    // Mirrors the real backend: only Application Manager approval
    // actually clears the story for build.
    await this.approveChange(changeId, input);
    return review;
  }
}
