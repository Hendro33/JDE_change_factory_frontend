/**
 * The seam between this UI and the backend.
 *
 * Every component talks to `api` (exported at the bottom of this file)
 * and never to mock data directly. To connect the real ConsultIQ
 * Change Factory engine later, implement ChangeFactoryApi against
 * FastAPI and swap the one line at the bottom — no component should
 * need to change.
 */

import type {
  ActivityEntry,
  Change,
  ChangeSource,
  FactoryMetrics,
  Session,
} from "../types/domain";

/**
 * The REST endpoints the FastAPI backend is expected to expose.
 * Kept here so the contract is visible in one place while the
 * backend is still being built.
 */
export const API_ENDPOINTS = {
  /**
   * Returns the signed-in user and the customers they may reach.
   * The entitlement list is resolved server-side from the auth token —
   * never supplied or extended by the client.
   */
  getSession: "GET /session",

  listChanges: "GET /changes",
  createChange: "POST /changes",
  getChange: "GET /changes/{id}",

  enhanceStory: "POST /changes/{id}/enhance",
  approveStory: "POST /changes/{id}/approve-story",
  sendStoryBack: "POST /changes/{id}/send-back",

  getBacklog: "GET /backlog",
  approveForBacklog: "POST /changes/{id}/approve",
  rejectChange: "POST /changes/{id}/reject",

  getArchitecture: "GET /changes/{id}/architecture",
  getImplementation: "GET /changes/{id}/implementation",

  approveExactChange: "POST /changes/{id}/approve-change",
  executeChange: "POST /changes/{id}/execute",
  runTest: "POST /changes/{id}/test",
  validate: "POST /changes/{id}/validate",

  getEvidence: "GET /changes/{id}/evidence",

  getMetrics: "GET /metrics",
  getActivity: "GET /activity",
} as const;

/**
 * Every request below is customer-scoped.
 *
 * The active customer travels as an `X-Customer-Id` header, set once by
 * the service layer rather than threaded through every component.
 *
 * SECURITY: the backend must treat that header as an assertion to be
 * checked, not obeyed. On every request it re-resolves the caller's
 * entitlements from the auth token and rejects the call if the header
 * names a customer outside them. A header alone must never widen
 * access — otherwise switching customer becomes a client-side edit.
 */
export const CUSTOMER_SCOPE_HEADER = "X-Customer-Id";

export interface CreateChangeInput {
  title: string;
  source: ChangeSource;
  sourceReference: string;
  originalRequest: string;
}

export interface DecisionInput {
  /** Every decision is recorded against a named person. */
  decidedBy: string;
  note: string;
}

/**
 * The full surface this UI needs. A FastAPI-backed implementation
 * must satisfy exactly this.
 */
export interface ChangeFactoryApi {
  /** Who is signed in, and which customers they may reach. */
  getSession(): Promise<Session>;

  /**
   * Switches the active customer for subsequent calls.
   * Rejects if the customer is not in the caller's entitlements.
   */
  setActiveCustomer(customerId: string): Promise<Session>;

  /** All methods below return data for the ACTIVE customer only. */
  listChanges(): Promise<Change[]>;
  getChange(id: string): Promise<Change | undefined>;
  createChange(input: CreateChangeInput): Promise<Change>;

  /** Runs Receive -> Improve -> Check. Returns the enriched story. */
  enhanceStory(id: string): Promise<Change>;
  sendStoryBack(id: string, input: DecisionInput): Promise<Change>;
  approveStoryForBacklog(id: string, input: DecisionInput): Promise<Change>;

  getBacklog(): Promise<Change[]>;
  approveChange(id: string, input: DecisionInput): Promise<Change>;
  rejectChange(id: string, input: DecisionInput): Promise<Change>;

  /**
   * Approves one exact operation (design doc Section 6.5).
   * Deliberately separate from approveChange: approving a story is not
   * the same decision as approving the specific write it becomes.
   */
  approveExactChange(id: string, input: DecisionInput): Promise<Change>;

  getMetrics(): Promise<FactoryMetrics>;
  getActivity(): Promise<ActivityEntry[]>;
}

// ---------------------------------------------------------------------
// Which implementation the app uses.
//
// Phase 1 default is still the mock, so nothing breaks without a .env
// file. Set VITE_USE_MOCK_API=false to point the app at the real
// FastAPI backend (api_service/) instead -- see .env.example. Only
// getSession/setActiveCustomer/listChanges/getChange/createChange/
// getBacklog/getMetrics/getActivity are backed by real endpoints so
// far; the rest throw a clear "not implemented yet" error against the
// real backend (HttpChangeFactoryApi's own comment explains why).
// ---------------------------------------------------------------------
import { MockChangeFactoryApi } from "./mockApi";
import { HttpChangeFactoryApi } from "./httpApi";

export const api: ChangeFactoryApi =
  import.meta.env.VITE_USE_MOCK_API === "false"
    ? new HttpChangeFactoryApi()
    : new MockChangeFactoryApi();
