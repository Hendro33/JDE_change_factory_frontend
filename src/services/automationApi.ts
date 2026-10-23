/**
 * Routine automation (redesign step 4) and notifications.
 */
import { api } from "./api";
import { request } from "./httpApi";

async function customerId(): Promise<string> {
  return (await api.getSession()).activeCustomerId;
}

export interface AutomationEvent { at: string; storyId?: string | null; kind: string; action: string; detail: string }

export interface AutomationSettings {
  enabled: boolean;
  jiraPickup: boolean;
  serverEnabled: boolean;
  updatedBy?: string | null;
  updatedAt?: string | null;
  setupChangedAt?: string | null;
  setupChanged?: string;
  lastJiraPickupAt?: string | null;
  maxRunsPerDay: number;
  recheckHours: number;
  jiraPickupMinutes: number;
  events: AutomationEvent[];
}

export type NotificationKind = "decision" | "task" | "completion" | "exception";

export interface JadeNotification {
  id: string;
  at: string;
  kind: NotificationKind;
  title: string;
  text: string;
  storyId?: string | null;
  tab?: string | null;
  unread: boolean;
}

export interface NotificationFeed {
  items: JadeNotification[];
  unread: number;
  digest: "off" | "daily";
  emailAvailable: boolean;
}

export const automationApi = {
  async get(): Promise<AutomationSettings> {
    return request<AutomationSettings>("/automation", { customerId: await customerId() });
  },
  async save(input: { enabled?: boolean; jiraPickup?: boolean }): Promise<AutomationSettings> {
    return request<AutomationSettings>("/automation", { method: "PUT", customerId: await customerId(), body: input });
  },
  async notifications(): Promise<NotificationFeed> {
    return request<NotificationFeed>("/notifications", { customerId: await customerId() });
  },
  async markRead(): Promise<NotificationFeed> {
    return request<NotificationFeed>("/notifications/read", { method: "POST", customerId: await customerId() });
  },
  async setDigest(digest: "off" | "daily"): Promise<NotificationFeed> {
    return request<NotificationFeed>("/notifications/preferences", { method: "PUT", customerId: await customerId(), body: { digest } });
  },
};
