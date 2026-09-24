/**
 * Process frameworks, a story's process mapping and maps, and its as-built
 * record. Talks to the real backend only (the demo never simulates these).
 * Response bodies keep the backend's snake_case keys.
 */

import { api, IS_MOCK_MODE } from "./api";
import { request } from "./httpApi";

export type SourceKind = "apqc_authorised" | "customer_defined" | "synthetic_fixture";

export interface FrameworkNode {
  framework_id: string; version: number; node_key: string; parent_key: string | null; level: number; position: number;
  name: string; description: string; node_type: string; external_ref: string; node_sha256: string;
}

export interface FrameworkVersion {
  framework_id: string; version: number; status: "draft" | "active" | "superseded"; file_name: string;
  file_sha256: string; file_size: number; sheet_name: string;
  column_mapping: { mapping: Record<string, string | null>; derive_parent: boolean };
  source_statement: string; validation: { errors: string[]; warnings: string[] }; node_count: number;
  content_sha256: string; changes: { compared_with_version?: number; added?: string[]; removed?: string[]; changed?: string[] };
  uploaded_by: string; uploaded_at: string; activated_by: string | null; activated_at: string | null; superseded_at: string | null;
}

export interface Framework {
  framework_id: string; name: string; source_kind: SourceKind; source_label: string; created_by: string; created_at: string;
  versions: FrameworkVersion[]; active_version: number | null;
}

export interface FrameworkList {
  frameworks: Framework[]; settings: { selected_framework_id: string | null; revision: number };
  source_kinds: Record<SourceKind, string>; fields: string[]; field_labels: Record<string, string>; required_fields: string[];
}

export interface Inspection {
  sheets: { sheet: string; headers: string[]; rows: number; proposed_mapping: Record<string, string | null> }[];
  default_sheet: string | null; fields: string[]; required_fields: string[]; field_labels: Record<string, string>;
}

export interface VersionPreview {
  framework: { framework_id: string; name: string; source_kind: SourceKind; source_label: string; active_version: number | null };
  version: FrameworkVersion; nodes: FrameworkNode[];
  affected_stories?: { story_id: string; mapping_revision: number; nodes: string[]; design_flagged: boolean }[];
}

export interface PinnedRef {
  framework_id: string; framework_name: string; version: number; node_key: string; node_sha256: string; name: string;
  path: { node_key: string; name: string }[]; external_ref: string; rationale: string; confidence?: string;
  status_now?: { state: string; detail: string };
}

export interface AnalysisRun {
  run_id: string; status: string; framework_id: string; framework_version: number; started_at: string;
  finished_at: string | null; error: string | null; model: string | null; scripted: boolean;
  result: { suggested_processes?: PinnedRef[]; rejected_suggestions?: string[]; missing_requirements?: string[];
            missing_controls?: string[]; missing_acceptance_criteria?: string[]; no_mapping_reason?: string; summary?: string };
}

export interface Mapping {
  revision: number; status: "confirmed" | "no_mapping"; refs: PinnedRef[]; no_mapping_reason: string;
  findings: Record<string, string[]>; analysis_run_id: string | null; reviewer_name: string; roles: string[];
  note: string; created_at: string;
}

export interface MapStep {
  id: string; label: string; type: "start" | "task" | "decision" | "end"; actor: string; system: string; controls: string[];
  node_ref: null | { framework_id: string; version: number; node_key: string; node_sha256?: string; name?: string };
  story_ids: string[]; basis: "assumption" | "confirmed"; confirmation_source: string; notes: string;
}
export interface MapConnection { from: string; to: string; label: string }
export interface MapContent { title: string; steps: MapStep[]; connections: MapConnection[] }
export interface MapVersion {
  map_id: string; version: number; content: MapContent; content_sha256: string; material_sha256: string;
  material_change: boolean; note: string; created_by: string; created_at: string;
}

export interface StoryProcessView {
  story_id: string; title: string; business_domain_id: string | null; route: string | null;
  framework: null | { framework_id: string; name: string; source_kind: SourceKind; source_label: string; version: number };
  runs: AnalysisRun[]; mapping: Mapping | null; mapping_history: Mapping[];
  maps: { as_is: { versions: MapVersion[] }; to_be: { versions: MapVersion[] } };
  fingerprint: { mapping_revision: number | null; map_versions: Record<string, number | null>; sha256: string };
  design: null | { baseline_id: string; design_revision: number; status: string;
                   reassessment: { kind: string; detail: string; flagged_at: string }[];
                   process_context_recorded: { sha256: string } | null; process_context_consulted: boolean;
                   architect_process_findings: Record<string, string[]> | null };
  can_review: boolean;
}

export interface Checkpoint { id: string; label: string; complete: boolean; detail: string }
export interface AsBuiltRecord {
  story_id: string; version: number; status: "draft" | "final" | "superseded"; delivery_mode: "simulation" | "live";
  content: { checkpoints: Checkpoint[]; all_checkpoints_complete: boolean; deviations: string[]; limitations: string[];
             simulated_notice: string | null; route: string | null; [k: string]: unknown };
  markdown: string; content_sha256: string; generated_by: string; generated_at: string;
  finalised_by: string | null; finalised_at: string | null;
}
export interface AsBuiltView {
  story_id: string; records: AsBuiltRecord[]; checkpoints_now: Checkpoint[]; delivery_mode_now: string; can_finalise: boolean;
}

async function customer(): Promise<string> {
  if (IS_MOCK_MODE) throw new Error("Process frameworks, maps and as-built records need the real backend.");
  return (await api.getSession()).activeCustomerId;
}

const enc = encodeURIComponent;
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function download(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { credentials: "include", headers: { "X-Customer-Id": await customer() } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const processApi = {
  async frameworks(): Promise<FrameworkList> {
    return request<FrameworkList>("/process/frameworks", { customerId: await customer() });
  },
  async template(): Promise<void> { return download("/process/template", "jade_process_framework_template.xlsx"); },
  async inspect(fileName: string, contentBase64: string): Promise<Inspection> {
    return request<Inspection>("/process/frameworks/inspect", { method: "POST", customerId: await customer(),
      body: { fileName, contentBase64 } });
  },
  async createDraft(body: { name: string; sourceKind: SourceKind; sourceStatement: string; fileName: string; contentBase64: string;
                            sheet: string; mapping: Record<string, string | null>; deriveParent: boolean; frameworkId?: string | null }): Promise<VersionPreview> {
    return request<VersionPreview>("/process/frameworks/drafts", { method: "POST", customerId: await customer(), body });
  },
  async remap(frameworkId: string, sheet: string, mapping: Record<string, string | null>, deriveParent: boolean): Promise<VersionPreview> {
    return request<VersionPreview>(`/process/frameworks/${enc(frameworkId)}/draft/remap`, { method: "POST",
      customerId: await customer(), body: { sheet, mapping, deriveParent } });
  },
  async version(frameworkId: string, version: number): Promise<VersionPreview> {
    return request<VersionPreview>(`/process/frameworks/${enc(frameworkId)}/versions/${version}`, { customerId: await customer() });
  },
  async activate(frameworkId: string, version: number): Promise<VersionPreview> {
    return request<VersionPreview>(`/process/frameworks/${enc(frameworkId)}/versions/${version}/activate`, {
      method: "POST", customerId: await customer() });
  },
  async originalFile(frameworkId: string, version: number): Promise<void> {
    return download(`/process/frameworks/${enc(frameworkId)}/versions/${version}/file`, "framework.xlsx");
  },
  async select(frameworkId: string, expectedRevision: number): Promise<unknown> {
    return request("/process/settings", { method: "PUT", customerId: await customer(),
      body: { selectedFrameworkId: frameworkId, expectedRevision } });
  },
  async nodeStories(frameworkId: string, nodeKey: string): Promise<{ story_id: string; revision: number; versions: number[] }[]> {
    return request(`/process/frameworks/${enc(frameworkId)}/nodes/${enc(nodeKey)}/stories`, { customerId: await customer() });
  },
  async story(storyId: string): Promise<StoryProcessView> {
    return request<StoryProcessView>(`/changes/${enc(storyId)}/process`, { customerId: await customer() });
  },
  async startAnalysis(storyId: string): Promise<AnalysisRun> {
    return request<AnalysisRun>(`/changes/${enc(storyId)}/process/analysis`, { method: "POST", customerId: await customer() });
  },
  async decide(storyId: string, body: { status: "confirmed" | "no_mapping"; refs: { framework_id: string; version: number; node_key: string; rationale?: string }[];
                                        noMappingReason: string; findings: Record<string, string[]>; analysisRunId: string | null;
                                        note: string; expectedRevision: number }): Promise<StoryProcessView> {
    return request<StoryProcessView>(`/changes/${enc(storyId)}/process/mapping`, { method: "POST", customerId: await customer(), body });
  },
  async saveMap(storyId: string, kind: "as_is" | "to_be", content: MapContent, note: string, expectedVersion: number):
      Promise<{ saved: MapVersion & { design_flagged: boolean }; view: StoryProcessView }> {
    return request(`/changes/${enc(storyId)}/process/maps/${kind}`, { method: "PUT", customerId: await customer(),
      body: { content, note, expectedVersion } });
  },
  async asBuilt(storyId: string): Promise<AsBuiltView> {
    return request<AsBuiltView>(`/changes/${enc(storyId)}/as-built`, { customerId: await customer() });
  },
  async generateAsBuilt(storyId: string): Promise<AsBuiltRecord> {
    return request<AsBuiltRecord>(`/changes/${enc(storyId)}/as-built`, { method: "POST", customerId: await customer() });
  },
  async finaliseAsBuilt(storyId: string, version: number): Promise<AsBuiltRecord> {
    return request<AsBuiltRecord>(`/changes/${enc(storyId)}/as-built/${version}/finalise`, { method: "POST", customerId: await customer() });
  },
  async downloadMarkdown(storyId: string, version: number): Promise<void> {
    return download(`/changes/${enc(storyId)}/as-built/${version}/markdown`, `${storyId}_as_built_v${version}.md`);
  },
};
