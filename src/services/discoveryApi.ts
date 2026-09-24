/**
 * Architect Environment Discovery — Admin > Integrations > JDE, the
 * technical baseline import, and the evidence behind each design.
 *
 * Talks to the real backend only. In mock (demo) mode every call says so
 * rather than inventing discovery results: there is no simulated JDE in
 * the browser. (The backend's own simulated AIS endpoint is available
 * against the real backend, clearly labelled SIMULATION.)
 */

import { api, IS_MOCK_MODE } from "./api";
import { request } from "./httpApi";

export type ConnectionMode = "simulation" | "live";
export type DataSharingPolicy = "metadata_only" | "configuration_and_artifacts" | "full";
export type CheckState = "ok" | "failed" | "unknown" | "stale";

export interface ApprovedRead {
  capabilityId: string;
  targets: string[];
  fields: string[];
  filterFields: string[];
}

export interface JdeProfileConfig {
  connectionMode: ConnectionMode;
  aisBaseUrl: string;
  environment: string;
  environmentType: "DEV";
  role: string;
  expectedApplicationRelease: string;
  expectedToolsRelease: string;
  pathCode: string;
  authMethod: "ais_token_request";
  customerContact: string;
  cncContact: string;
  networkRoute: string;
  isolationEvidence: string;
  routingIsolationConfirmed: boolean;
  privilegeStatement: string;
  privilegeConfirmed: boolean;
  /** CNC attestation of what the AIS contract does not expose: Tools release and path code. */
  runtimeAttestationConfirmed: boolean;
  runtimeAttestationEvidence: string;
  approvedReads: ApprovedRead[];
  discoveryWindow: { startsAt: string; endsAt: string } | null;
  limits: { maxRecords: number; timeoutSeconds: number; concurrentRequests: 1 };
  dataSharingPolicy: DataSharingPolicy;
}

export interface VerificationItem {
  item: string;
  status: "verified" | "attested" | "missing" | "mismatch";
  source: string;
  detail: string;
}

export interface CheckResult {
  state: CheckState;
  checkedAt?: string | null;
  detail: string;
  profileRevision?: number | null;
  /** Environment check only (snake_case keys): expected, server_defaults, session_context, attested, items, missing_evidence, notes. */
  facets?: {
    expected?: Record<string, string>;
    server_defaults?: Record<string, unknown>;
    session_context?: Record<string, unknown>;
    items?: VerificationItem[];
    missing_evidence?: string[];
    notes?: string[];
    contract_basis?: string;
  };
}

export interface CapabilityView {
  capabilityId: string;
  title: string;
  description: string;
  status: "supported" | "unverified" | "unavailable";
  statusDetail: string;
  dataClass: string;
  targetKind: string;
  approved: boolean;
  approvedTargets: string[];
  approvedFields: string[];
  approvedFilterFields: string[];
  alternative: string;
}

export interface JdeProfileView {
  companyId: string;
  configured: boolean;
  revision: number;
  config?: JdeProfileConfig | null;
  credentialConfigured: boolean;
  credentialUsernameMasked?: string | null;
  credentialStorage: string;
  /** Keys: reachability, authentication, environment, approved_read. */
  health: Record<string, CheckResult>;
  capabilities: CapabilityView[];
  discoveryEnabled: boolean;
  enabledBy?: string | null;
  enabledAt?: string | null;
  disabled: boolean;
  disabledBy?: string | null;
  disabledAt?: string | null;
  enableBlockers: string[];
  modeLabel: string;
  liveAllowedByDeployment: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface ActionResult {
  outcome: string;
  detail: string;
  profile: JdeProfileView;
  evidence?: Record<string, unknown> | null;
  inFlight: Record<string, unknown>[];
}

export interface ActivityRow {
  id: number;
  requestId: string;
  profileRevision?: number | null;
  actorUserId?: string | null;
  actorName?: string | null;
  agentRunId?: string | null;
  storyId?: string | null;
  operation: string;
  target: string;
  mode?: string | null;
  startedAt: string;
  durationMs?: number | null;
  resultCount?: number | null;
  outcome: string;
  reason: string;
}

export type ArtifactKind = "technical_export" | "reference_document";
export type ExportFormat =
  | "text" | "c_source" | "er_text" | "omw_xml" | "json" | "markdown" | "csv" | "par" | "zip" | "pdf" | "docx" | "other";
export type RuntimeCorrespondence = "matches_dev_runtime" | "known_mismatch" | "unknown";

export interface ArtifactUploadInput {
  kind: ArtifactKind;
  domainId?: string | null;
  objectName: string;
  objectType: string;
  exportFormat: ExportFormat;
  customerEnvironment: string;
  pathCode: string;
  release: string;
  sourceLocation: string;
  repository: string;
  commitRef: string;
  exportedAt: string;
  runtimeCorrespondence: RuntimeCorrespondence;
  runtimeStatement: string;
  runtimeStatedBy: string;
  docTitle: string;
  docRevision: string;
  appliesToReleases: string[];
  fileName: string;
  contentBase64: string;
}

export interface ArtifactView {
  artifactId: string;
  revision: number;
  domainId?: string | null;
  kind: ArtifactKind;
  /** Upload metadata as recorded (snake_case keys). */
  meta: Record<string, unknown>;
  sha256: string;
  sizeBytes: number;
  extractionStatus: "supported" | "unsupported";
  extractionNote: string;
  uploadedBy: string;
  uploadedAt: string;
  compatibility?: string | null;
  latest: boolean;
}

/** manifest and observation contents keep the backend's snake_case keys. */
export interface DesignBaselineView {
  baselineId: string;
  storyId: string;
  designRevision: number;
  baselineRevision: number;
  createdAt: string;
  trigger: string;
  manifest: EvidenceManifest;
  manifestSha256: string;
  status: "current" | "needs_reassessment" | "superseded" | string;
  reassessment: { kind: string; detail: string; flagged_at?: string }[];
  observations: Record<string, unknown>[];
}

export interface EvidenceManifest {
  scope_statement: string;
  design_revision: number;
  created_at: string;
  trigger: string;
  environment_profile: null | {
    revision: number; environment: string; path_code: string; application_release: string;
    tools_release: string; mode: string; role: string; data_sharing_policy: string;
  };
  observations: {
    observation_id: string; capability_id: string; target: string; fields: string[]; observed_at: string;
    mode: string; record_count: number; payload_sha256: string; payload_sha256_role?: string; retained?: string;
    values_shared: boolean; provenance: string;
  }[];
  evidence_notes?: string[];
  refresh_note?: string;
  artifacts: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  dependencies: string[];
  customisations: string[];
  citations: { claim: string; evidence_ids: string[]; basis: string; claimed_basis: string; validated: boolean;
               note?: string; limitations?: string[] }[];
  gaps: { kind: string; description: string; question: string; blocked_step: string; source: string }[];
  contradictions: string[];
  confidence_limitations: string[];
  blocked_requests: { capability_id: string; target: string; reason: string }[];
  refresh_changes?: { previous: string; current: string; changed: boolean }[];
}

class DemoModeError extends Error {
  constructor() {
    super("JDE discovery needs the real backend. The demo has no discovery service and never simulates results in the browser.");
  }
}

async function customer(): Promise<string> {
  if (IS_MOCK_MODE) throw new DemoModeError();
  return (await api.getSession()).activeCustomerId;
}

const enc = encodeURIComponent;

export const discoveryApi = {
  async getProfile(): Promise<JdeProfileView> {
    return request<JdeProfileView>("/admin/jde/profile", { customerId: await customer() });
  },
  async saveProfile(config: JdeProfileConfig, expectedRevision: number | null): Promise<JdeProfileView> {
    return request<JdeProfileView>("/admin/jde/profile", {
      method: "PUT", customerId: await customer(), body: { ...config, expectedRevision },
    });
  },
  /** The password goes to the server once and is never read back. */
  async saveCredential(username: string, password: string, expectedRevision: number): Promise<JdeProfileView> {
    return request<JdeProfileView>("/admin/jde/credential", {
      method: "PUT", customerId: await customer(), body: { username, password, expectedRevision },
    });
  },
  async testConnection(): Promise<ActionResult> {
    return request<ActionResult>("/admin/jde/test-connection", { method: "POST", customerId: await customer() });
  },
  async sampleRead(capabilityId: string): Promise<ActionResult> {
    return request<ActionResult>("/admin/jde/sample-read", {
      method: "POST", customerId: await customer(), body: { capabilityId },
    });
  },
  async enable(expectedRevision: number): Promise<ActionResult> {
    return request<ActionResult>("/admin/jde/enable", {
      method: "POST", customerId: await customer(), body: { expectedRevision },
    });
  },
  async disable(): Promise<ActionResult> {
    return request<ActionResult>("/admin/jde/disable", { method: "POST", customerId: await customer() });
  },
  async activity(): Promise<ActivityRow[]> {
    return request<ActivityRow[]>("/admin/jde/activity", { customerId: await customer() });
  },
  async listArtifacts(): Promise<ArtifactView[]> {
    return request<ArtifactView[]>("/admin/jde/artifacts", { customerId: await customer() });
  },
  async uploadArtifact(input: ArtifactUploadInput): Promise<ArtifactView> {
    return request<ArtifactView>("/admin/jde/artifacts", { method: "POST", customerId: await customer(), body: input });
  },
  async designEvidence(changeId: string): Promise<DesignBaselineView[]> {
    return request<DesignBaselineView[]>(`/changes/${enc(changeId)}/architecture-review/evidence`, {
      customerId: await customer(),
    });
  },
  async refreshEvidence(changeId: string): Promise<DesignBaselineView> {
    return request<DesignBaselineView>(`/changes/${enc(changeId)}/architecture-review/refresh-evidence`, {
      method: "POST", customerId: await customer(),
    });
  },
};

export const HEALTH_CHECKS: { key: string; label: string }[] = [
  { key: "reachability", label: "Reachability" },
  { key: "authentication", label: "Authentication" },
  { key: "environment", label: "Environment verification" },
  { key: "approved_read", label: "Approved-read success" },
];

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read the file"));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });
}
