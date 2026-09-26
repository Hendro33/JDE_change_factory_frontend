/**
 * Customer AI connection, Agent Start-up Packs, agent runs/health and
 * request documents. Real backend only: nothing here has a mock.
 */
import { api, IS_MOCK_MODE } from "./api";
import { downloadFile, request } from "./httpApi";

async function customerId(): Promise<string> {
  if (IS_MOCK_MODE) throw new Error("This needs Jade's backend.");
  return (await api.getSession()).activeCustomerId;
}

export interface AiModel { id: string; label: string; input: number; output: number }
export interface AiLimits { max_usd_per_run: number; monthly_usd: number; max_turns: number }
export type DocumentPolicy = "metadata_only" | "permitted_content";

export interface AiConnection {
  provider: string;
  providerLabel: string;
  testProvider: boolean;
  runtime: string;
  runtimeLabel: string;
  activities: { id: string; label: string; roles: string[]; note: string; models: string[] }[];
  evaluation: Record<string, string>;
  activityModels?: Record<string, string>;
  models: AiModel[];
  rateCardVersion: string;
  documentPolicies: DocumentPolicy[];
  defaultLimits: AiLimits;
  audit: { action: string; detail: string; actor: string; at: string }[];
  configured: boolean;
  model?: string;
  revision?: number;
  enabled?: boolean;
  documentPolicy?: DocumentPolicy;
  limits?: AiLimits;
  credentialState: string;
  credentialHint?: string | null;
  credentialRevision?: number;
  credentialUpdatedAt?: string | null;
  credentialUpdatedBy?: string | null;
  credentialRevokedAt?: string | null;
  lastTest?: { at: string; outcome: string; detail: string; connectionRevision: number; credentialRevision: number } | null;
  tested: boolean;
  updatedAt?: string;
  updatedBy?: string;
  monthSpendUsd?: number;
  testExplanation: string;
  serverKeyConfigured: boolean;
}

export interface PackContent {
  description: string;
  instructions: string;
  skills: { name: string; body: string }[];
  knowledge: string[];
  inputs: string;
  outputs: string;
  capabilities: string[];
  limits: { max_turns?: number };
}

export interface PackRevisionSummary {
  revision: number; status: "draft" | "published"; sha256: string; note: string;
  created_at: string; created_by: string; published_at: string | null; published_by: string | null;
}

export interface PackSummary {
  packId: string; role: string; name: string; source: string; template: boolean;
  disabledAt: string | null; disabledBy: string | null; revisions: PackRevisionSummary[];
}

export interface PackRevision {
  packId: string; role: string; name: string; template: boolean; revision: number; status: "draft" | "published";
  sha256: string; note: string; content: PackContent; createdAt: string; createdBy: string;
  publishedAt: string | null; publishedBy: string | null; ceiling: string[];
}

export interface Assignment {
  packId: string; packName: string; revision: number; version: number; assignedAt: string; assignedBy: string;
}

export interface RoleInfo { role: string; label: string; ceiling: string[] }

export interface AiRun {
  run_id: string; company_id: string; driver: string; story_id: string | null; roles: string[] | null;
  status: "running" | "completed" | "failed" | "blocked"; provider: string | null; configured_model: string | null;
  reported_model: string | null; credential_source: string | null; connection_revision: number | null;
  credential_revision: number | null;
  packs: { role: string; packId: string; packName: string; revision: number; sha256: string; model?: string }[] | null;
  runtime: string | null;
  models: Record<string, string> | null;
  context: { package_id: string; version: number; sha256: string }[] | null;
  notes: string[] | null;
  knowledge: { action: string; filename?: string; id?: string; sections?: string[] }[] | null;
  usage: { tokens?: Record<string, number> | null; rateCardEstimateUsd?: number | null; tokensBasis?: string } | null;
  cost_usd: number | null; cost_basis: string | null; error: string | null; started_at: string; finished_at: string | null;
}

export interface RoleHealth {
  role: string; label: string;
  state: "not configured" | "configured" | "connection tested" | "working" | "disabled" | "failed";
  disabled: boolean; blockedReason: string | null; configured: boolean; connectionTested: boolean;
  connectionRevision: number | null; configuredModel: string | null; activity: string | null;
  pack: { role: string; packId: string; packName: string; revision: number; sha256: string } | null;
  assignment: Assignment | null; lastRun: AiRun | null; lastSuccessfulRealRun: AiRun | null;
}

export interface Attachment {
  id: string; requestId: string | null; status: "pending" | "attached" | "deleted"; filename: string;
  fileType: "pdf" | "docx" | "txt"; sizeBytes: number; sha256: string; revision: number; uploadedBy: string;
  uploadedAt: string; extractionStatus: "pending" | "extracting" | "ready" | "failed" | "deleted";
  extractionDetail: string; extractionVersion: number; sections: number | null;
  deletedAt: string | null; deletedBy: string | null;
}

export interface AttachmentLimits {
  maxFiles: number; maxFileBytes: number; maxTotalBytes: number; types: string[]; abandonedAfterHours: number;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export const aiApi = {
  async connection(): Promise<AiConnection> {
    return request<AiConnection>("/admin/ai/connection", { customerId: await customerId() });
  },
  async saveConnection(body: { model: string; enabled: boolean; documentPolicy: DocumentPolicy; limits: Partial<AiLimits>;
    activityModels: Record<string, string>; expectedRevision: number | null }): Promise<AiConnection> {
    return request<AiConnection>("/admin/ai/connection", { method: "PUT", customerId: await customerId(), body });
  },
  async saveKey(apiKey: string): Promise<AiConnection> {
    return request<AiConnection>("/admin/ai/connection/credential", {
      method: "PUT", customerId: await customerId(), body: { apiKey },
    });
  },
  async revokeKey(): Promise<AiConnection> {
    return request<AiConnection>("/admin/ai/connection/credential", { method: "DELETE", customerId: await customerId() });
  },
  async test(): Promise<{ outcome: string; detail: string; billable: boolean; connection: AiConnection }> {
    return request("/admin/ai/connection/test", {
      method: "POST", customerId: await customerId(), body: { confirmBillable: true },
    });
  },
  async roles(): Promise<RoleInfo[]> {
    return request<RoleInfo[]>("/admin/ai/roles", { customerId: await customerId() });
  },
  async packs(): Promise<{ packs: PackSummary[]; assignments: Record<string, Assignment> }> {
    return request("/admin/ai/packs", { customerId: await customerId() });
  },
  async revision(packId: string, revision: number): Promise<PackRevision> {
    return request<PackRevision>(`/admin/ai/packs/${encodeURIComponent(packId)}/revisions/${revision}`, {
      customerId: await customerId(),
    });
  },
  async createPack(role: string, name: string, fromPackId: string, fromRevision: number): Promise<PackRevision> {
    return request<PackRevision>("/admin/ai/packs", {
      method: "POST", customerId: await customerId(), body: { role, name, fromPackId, fromRevision },
    });
  },
  async saveDraft(packId: string, content: PackContent, note: string): Promise<PackRevision> {
    return request<PackRevision>(`/admin/ai/packs/${encodeURIComponent(packId)}/draft`, {
      method: "PUT", customerId: await customerId(), body: { content, note },
    });
  },
  async publish(packId: string, revision: number): Promise<PackRevision> {
    return request<PackRevision>(`/admin/ai/packs/${encodeURIComponent(packId)}/revisions/${revision}/publish`, {
      method: "POST", customerId: await customerId(),
    });
  },
  async setDisabled(packId: string, disabled: boolean): Promise<PackSummary> {
    return request<PackSummary>(`/admin/ai/packs/${encodeURIComponent(packId)}/disabled`, {
      method: "PUT", customerId: await customerId(), body: { disabled },
    });
  },
  async assign(role: string, packId: string, revision: number, expectedVersion: number | null):
    Promise<Record<string, Assignment>> {
    return request(`/admin/ai/assignments/${role}`, {
      method: "PUT", customerId: await customerId(), body: { packId, revision, expectedVersion },
    });
  },
  async unassign(role: string): Promise<Record<string, Assignment>> {
    return request(`/admin/ai/assignments/${role}`, { method: "DELETE", customerId: await customerId() });
  },
  async packAudit(): Promise<{ packs: { action: string; detail: string; actor: string; at: string; role: string | null;
    pack_id: string | null; pack_revision: number | null }[] }> {
    return request("/admin/ai/audit", { customerId: await customerId() });
  },
  async runs(): Promise<AiRun[]> {
    return request<AiRun[]>("/admin/ai/runs", { customerId: await customerId() });
  },
  async health(): Promise<{ roles: RoleHealth[]; runtime: string; provider: string }> {
    return request("/admin/ai/health", { customerId: await customerId() });
  },

  // -- Request documents
  async attachmentLimits(): Promise<AttachmentLimits> {
    return request<AttachmentLimits>("/change-requests/attachments/limits", { customerId: await customerId() });
  },
  async upload(file: File): Promise<Attachment> {
    const contentBase64 = await fileToBase64(file);
    return request<Attachment>("/change-requests/attachments", {
      method: "POST", customerId: await customerId(), body: { filename: file.name, contentBase64 },
    });
  },
  async pending(id: string): Promise<Attachment> {
    return request<Attachment>(`/change-requests/attachments/${id}`, { customerId: await customerId() });
  },
  async removePending(id: string): Promise<void> {
    return request<void>(`/change-requests/attachments/${id}`, { method: "DELETE", customerId: await customerId() });
  },
  async attachments(requestId: string): Promise<{ attachments: Attachment[]; limits: AttachmentLimits }> {
    return request(`/change-requests/${encodeURIComponent(requestId)}/attachments`, { customerId: await customerId() });
  },
  async removeAttachment(requestId: string, id: string): Promise<{ attachments: Attachment[] }> {
    return request(`/change-requests/${encodeURIComponent(requestId)}/attachments/${id}`, {
      method: "DELETE", customerId: await customerId(),
    });
  },
  async retry(requestId: string, id: string): Promise<Attachment> {
    return request<Attachment>(`/change-requests/${encodeURIComponent(requestId)}/attachments/${id}/retry`, {
      method: "POST", customerId: await customerId(),
    });
  },
  async download(requestId: string, a: Attachment): Promise<void> {
    return downloadFile(`/change-requests/${encodeURIComponent(requestId)}/attachments/${a.id}/download`,
      await customerId(), a.filename);
  },
};

export const EXTRACTION_LABEL: Record<Attachment["extractionStatus"], string> = {
  pending: "Waiting to be read", extracting: "Reading…", ready: "Ready", failed: "Could not be read",
  deleted: "Removed",
};
export const EXTRACTION_TONE: Record<Attachment["extractionStatus"], string> = {
  pending: "info", extracting: "info", ready: "ok", failed: "stop", deleted: "",
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
