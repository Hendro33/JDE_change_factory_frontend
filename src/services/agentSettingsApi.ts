/** Which agents are switched on for the active customer (Admin > Agents). */
import { api } from "./api";
import { request } from "./httpApi";

export interface AgentSettings {
  agents: { name: string; label: string; enabled: boolean }[];
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

async function customerId(): Promise<string> {
  return (await api.getSession()).activeCustomerId;
}

export const agentSettingsApi = {
  async get(): Promise<AgentSettings> {
    return request<AgentSettings>("/admin/agent-settings", { customerId: await customerId() });
  },
  async save(disabled: string[], expectedRevision: number): Promise<AgentSettings> {
    return request<AgentSettings>("/admin/agent-settings", {
      method: "PUT", customerId: await customerId(), body: { disabled, expectedRevision },
    });
  },
};
