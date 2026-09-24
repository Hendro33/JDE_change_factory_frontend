/**
 * Technical work -- the Technical Agent's packages, their exact approval,
 * the governed milestones and the human CNC hand-off.
 *
 * Talks to the real backend only; the demo has no Technical workflow and
 * never simulates one in the browser. Response bodies keep the backend's
 * snake_case keys.
 */

import { api, IS_MOCK_MODE } from "./api";
import { request } from "./httpApi";

export interface TestCase {
  object_key: string; name: string; kind: "positive" | "negative" | "neighbouring" | string; event: string;
  inputs: Record<string, unknown>; expected: Record<string, unknown>; rationale: string;
}

export interface Candidate {
  object_key: string; file_name: string; source_ref: string; format: string;
  before_sha256: string; after_sha256: string; text: string; diff: string;
}

export interface PackageContent {
  schema: string; revision: number; company_id: string; story_id: string; domain_id: string | null;
  target_environment: string; mode: "simulation" | "live" | string;
  design: { design_revision: number; baseline_id: string; design_approval_id: string; manifest_sha256?: string };
  objects: { object_key: string; object_name: string; object_type: string; system_code: string; format: string }[];
  sources: { evidence_id: string; artifact_id: string; revision: number; sha256: string; classification: string;
             runtime_check: { state?: string; detail?: string }; provenance: Record<string, string | null> }[];
  candidates: Candidate[]; diff: string; dependencies: string[];
  toolchain: { adapter: string; adapter_version: string; formats: string[]; requires_build: boolean;
               requires_cnc_activation: boolean; live_adapter: { available: boolean; reason?: string } };
  explanation: string; requirement_trace: { requirement: string; how: string }[]; test_plan: TestCase[];
  missing_evidence: string[]; unsupported: string[]; lifecycle: string[];
  recovery: { plan: string; constraints: string[] };
  repair_of: null | { revision: number; content_sha256: string; reason: string };
}

export interface Milestone { milestone: string; at: number; actor?: string; log?: string[]; evidence_entry_hash?: string }

export interface TestResult {
  name: string; kind: string; passed: boolean; expected: Record<string, unknown>;
  actual?: Record<string, unknown>; error?: string; runtime_sha256: string;
}

export interface PackageApproval {
  change_id: string; status: "pending" | "approved" | "rejected"; approved_by: string | null;
  approved_at: number | null; expires_at: number | null; decision_note: string | null;
  execution_mode: string;
  invalidations: { kind: string; detail: string; source: string; at_iso: string }[] | null;
  milestone_states: { apply: string; build: string; verify: string; cnc: string };
  milestones: Milestone[] | null;
  cnc_activation: null | { by: string; user_id: string; package_name: string; evidence_reference: string;
                           at: number; simulated: boolean };
  verification: null | { passed: boolean; results: TestResult[]; runtime_is_approved_artifact: boolean;
                         runtime_sha256: Record<string, string> };
}

export interface PackageView {
  revision: number; package_id: string; content_sha256: string; created_at: string; created_by_run: string;
  superseded_by: number | null; content: PackageContent; approval: PackageApproval | null;
  eligibility: { eligible: boolean; reasons: string[] };
}

export interface TechnicalRun {
  run_id: string; purpose: string; status: "running" | "completed" | "failed" | string;
  design_revision: number; baseline_id: string; started_at: string; finished_at: string | null;
  error: string | null; model: string | null;
  usage: { total_cost_usd?: number; num_turns?: number; models?: string[] };
  outcome: { kind?: string; explanation?: string; questions?: string[]; revision?: number; summary?: string };
  events: { at: string; event: string; detail: string }[];
}

export interface TechnicalWorkView {
  story_id: string; mode: string; simulation_label: string | null; format_label: string;
  assignment: null | {
    design_revision: number; route: string; baseline_id: string; manifest_sha256: string;
    baseline_status: string; target_environment: string; domain_id: string | null;
    architect_decision: { recommended_route: string; existing_functionality_found: string; objects_affected: string[] };
    implementation_spec: { sequence: string[]; human_actions_required: string[]; validation_approach: string };
    design_approval: null | { id: string; design_revision: number; baseline_id: string; approved_by: string;
                              approved_at: string };
  };
  assignment_problem: string | null;
  capability: { capability_id: string; status: string; technical_validation: string };
  runs: TechnicalRun[]; packages: PackageView[];
  human_actions: { action: string; by: string; at: string | number; detail: string; simulated?: boolean }[];
  estate: null | { environment: string; revision: number;
                   objects: Record<string, { active_sha256: string; active_package: string; checked_in_sha256: string | null;
                                             build: null | { status: string; log: string[] } }> };
}

class DemoModeError extends Error {
  constructor() {
    super("Technical work needs the real backend. The demo never simulates the Technical Agent in the browser.");
  }
}

async function customer(): Promise<string> {
  if (IS_MOCK_MODE) throw new DemoModeError();
  return (await api.getSession()).activeCustomerId;
}

const enc = encodeURIComponent;

export const technicalApi = {
  async work(storyId: string): Promise<TechnicalWorkView> {
    return request<TechnicalWorkView>(`/changes/${enc(storyId)}/technical`, { customerId: await customer() });
  },
  async approveDesign(storyId: string, designRevision: number, note: string): Promise<unknown> {
    return request(`/changes/${enc(storyId)}/technical/approve-design`, {
      method: "POST", customerId: await customer(), body: { designRevision, note },
    });
  },
  async startRun(storyId: string, purpose: "prepare" | "execute" | "verify", note = ""): Promise<TechnicalRun> {
    return request<TechnicalRun>(`/changes/${enc(storyId)}/technical/runs`, {
      method: "POST", customerId: await customer(), body: { purpose, note },
    });
  },
  async approvePackage(storyId: string, revision: number, note: string): Promise<unknown> {
    return request(`/changes/${enc(storyId)}/technical/packages/${revision}/approve`, {
      method: "POST", customerId: await customer(), body: { note },
    });
  },
  async rejectPackage(storyId: string, revision: number, note: string): Promise<unknown> {
    return request(`/changes/${enc(storyId)}/technical/packages/${revision}/reject`, {
      method: "POST", customerId: await customer(), body: { note },
    });
  },
  async milestone(storyId: string, revision: number, name: "apply" | "build" | "verify"): Promise<unknown> {
    return request(`/changes/${enc(storyId)}/technical/packages/${revision}/${name}`, {
      method: "POST", customerId: await customer(),
    });
  },
  async recordCnc(storyId: string, revision: number, packageName: string, evidenceReference: string,
                  note: string): Promise<unknown> {
    return request(`/changes/${enc(storyId)}/technical/packages/${revision}/cnc-activation`, {
      method: "POST", customerId: await customer(), body: { packageName, evidenceReference, note },
    });
  },
  async reconcile(storyId: string, revision: number, milestone: "apply" | "build", note: string): Promise<unknown> {
    return request(`/changes/${enc(storyId)}/technical/packages/${revision}/reconcile`, {
      method: "POST", customerId: await customer(), body: { milestone, note },
    });
  },
};
