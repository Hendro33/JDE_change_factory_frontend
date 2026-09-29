/**
 * Agent execution: the agents make the approved changes in the customer's
 * DEV system. Settings live under Administration > Systems & Connections >
 * JD Edwards; the on/off switches under Governance.
 */

import { api } from "./api";
import { fetchBlob, request } from "./httpApi";

export interface ExecutionConfig {
  webClientUrl: string;
  webOmwUrl: string;
  /** sha256 of the web client's certificate uploaded for this customer; "" = the AIS certificate or public CAs. */
  webCaCertificateSha256: string;
  writeRole: string;
  notes: string;
}

export interface ExecutionCheck {
  state: "ok" | "failed" | "unknown" | "stale";
  detail: string;
  checkedAt?: string | null;
  checked_at?: string | null;
}

export interface ExecutionCapability {
  capabilityId: string;
  title: string;
  itemKind?: string | null;
  enabled: boolean;
  detail: string;
}

export interface ExecutionAuditRow {
  action: string;
  detail: string;
  actor: string;
  at: string;
}

export interface ExecutionView {
  configured: boolean;
  revision: number;
  config: ExecutionConfig;
  writeUserConfigured: boolean;
  writeUserMasked?: string | null;
  writeUserStorage: string;
  agentExecutionEnabled: boolean;
  capabilities: ExecutionCapability[];
  checks: Record<string, ExecutionCheck>;
  routes: Record<"ais" | "browser", { ready: boolean; detail: string; label: string }>;
  browserAvailable: boolean;
  browserDetail: string;
  connection: {
    aisBaseUrl: string; environment: string; pathCode: string; discoveryRole: string;
    discoveryUserMasked?: string | null; discoveryEnabled: boolean;
  };
  updatedAt?: string | null;
  updatedBy?: string | null;
  audit: ExecutionAuditRow[];
}

export interface ReconcileItemInput {
  note: string;
  evidenceReference: string;
  statedValue?: string;
  statedValues?: Record<string, string>;
  statedSpecification?: string;
}

async function customer(): Promise<string> {
  return (await api.getSession()).activeCustomerId;
}

const enc = encodeURIComponent;

export const executionApi = {
  async get(): Promise<ExecutionView> {
    return request<ExecutionView>("/admin/jde/execution", { customerId: await customer() });
  },
  async save(config: ExecutionConfig, expectedRevision: number | null): Promise<ExecutionView> {
    return request<ExecutionView>("/admin/jde/execution", {
      method: "PUT", customerId: await customer(), body: { ...config, expectedRevision },
    });
  },
  /** The password goes to the server once and is never read back. */
  async saveWriteUser(username: string, password: string, expectedRevision: number): Promise<ExecutionView> {
    return request<ExecutionView>("/admin/jde/execution/write-user", {
      method: "PUT", customerId: await customer(), body: { username, password, expectedRevision },
    });
  },
  async test(): Promise<{ results: Record<string, { state: string; detail: string }>; execution: ExecutionView }> {
    return request("/admin/jde/execution/test", { method: "POST", customerId: await customer() });
  },
  /** capabilityId "" = the customer-wide switch. */
  async setSwitch(capabilityId: string, enabled: boolean, reason: string): Promise<ExecutionView> {
    return request<ExecutionView>("/admin/jde/execution/switch", {
      method: "PUT", customerId: await customer(), body: { capabilityId, enabled, reason },
    });
  },
  async runAgents(changeId: string): Promise<{ status: string }> {
    return request(`/changes/${enc(changeId)}/delivery/agents/run`, { method: "POST", customerId: await customer() });
  },
  async reconcileItem(changeId: string, itemId: string, input: ReconcileItemInput): Promise<{ outcome: string; observed: unknown; source: string }> {
    return request(`/changes/${enc(changeId)}/delivery/items/${enc(itemId)}/reconcile`, {
      method: "POST", customerId: await customer(), body: input,
    });
  },
  /** A screenshot the browser executor stored as evidence (a blob URL for an <img>). */
  async screenshot(changeId: string, key: string): Promise<string> {
    const blob = await fetchBlob(`/changes/${enc(changeId)}/delivery/screenshots?key=${enc(key)}`, await customer());
    return URL.createObjectURL(blob);
  },
};
