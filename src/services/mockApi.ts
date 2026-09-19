import type {
  ActivityEntry,
  Change,
  ChangeType,
  FactoryMetrics,
  LifecycleState,
} from "../types/domain";
import type { Session } from "../types/domain";
import type { ChangeFactoryApi, CreateChangeInput, DecisionInput } from "./api";
import { MOCK_CHANGES } from "./mockData";
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
}
