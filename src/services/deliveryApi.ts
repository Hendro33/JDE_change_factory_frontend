/**
 * Hand-offs to a named implementer and the business acceptance of the
 * outcome (backend: delivery/handoff.py, services/acceptance.py).
 */
import type { Change, HandoffView } from "../types/domain";
import { api } from "./api";
import { downloadFile, request } from "./httpApi";

async function customerId(): Promise<string> {
  return (await api.getSession()).activeCustomerId;
}

const base = (id: string) => `/changes/${encodeURIComponent(id)}`;

export const deliveryApi = {
  async handoff(id: string): Promise<HandoffView> {
    return request<HandoffView>(`${base(id)}/handoff`, { customerId: await customerId() });
  },
  async downloadSpecification(id: string): Promise<void> {
    return downloadFile(`${base(id)}/handoff/specification.pdf`, await customerId(), `JADE-specification-${id}.pdf`);
  },
  async authoriseHandoff(id: string, note: string): Promise<Change> {
    return request<Change>(`${base(id)}/handoff/authorise`, { method: "POST", customerId: await customerId(), body: { note } });
  },
  async nameImplementer(id: string, itemId: string, name: string): Promise<Change> {
    return request<Change>(`${base(id)}/handoff/items/${encodeURIComponent(itemId)}/implementer`, {
      method: "POST", customerId: await customerId(), body: { name },
    });
  },
  async completeHandoffItem(id: string, itemId: string, input: { implementer: string; evidenceReference: string; note: string }): Promise<Change> {
    return request<Change>(`${base(id)}/handoff/items/${encodeURIComponent(itemId)}/complete`, {
      method: "POST", customerId: await customerId(), body: input,
    });
  },
  async verifyHandoff(id: string, input: { passed: boolean; evidenceReference: string; note: string }): Promise<Change> {
    return request<Change>(`${base(id)}/handoff/verification`, { method: "POST", customerId: await customerId(), body: input });
  },
  async recordAcceptance(id: string, input: { decision: "accepted" | "not_accepted"; note: string; onBehalfOf?: string }): Promise<Change> {
    return request<Change>(`${base(id)}/acceptance`, {
      method: "POST", customerId: await customerId(), body: { onBehalfOf: "", ...input },
    });
  },
};
