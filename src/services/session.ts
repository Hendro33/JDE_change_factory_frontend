import type { Customer, IdentitySummary, Session } from "../types/domain";

/**
 * Mock authentication and customer entitlement.
 *
 * In production this is resolved server-side from the authenticated
 * identity (SSO / OIDC claims or a user-customer mapping table). The
 * browser never decides which customers it may see — it only asks, and
 * the API answers based on who is signed in.
 *
 * For the prototype there are two personas so both behaviours can be
 * demonstrated:
 *
 *   customer-user  a single-customer Application Manager. Scope is
 *                  implicit; NO customer selector is shown.
 *   consultant     a ConsultIQ consultant with three engagements.
 *                  Sees a selector and can switch between them.
 */

export const CUSTOMERS: Customer[] = [
  { id: "vdb", name: "Van den Berg Logistiek", shortName: "Van den Berg", toolsRelease: "9.2.7", environment: "DEV" },
  { id: "nhd", name: "Noord-Holland Dairy", shortName: "NH Dairy", toolsRelease: "9.2.8", environment: "DEV" },
  { id: "mrv", name: "Maasrivier Industrials", shortName: "Maasrivier", toolsRelease: "9.2.5", environment: "DEV" },
];

export type PersonaKey = "customer-user" | "consultant";

const PERSONAS: Record<PersonaKey, Omit<Session, "activeCustomerId">> = {
  "customer-user": {
    userId: "u-ellen",
    displayName: "Ellen Vos",
    role: "Application Manager",
    // Entitled to one engagement only — their own.
    customers: [CUSTOMERS[0]],
  },
  consultant: {
    userId: "u-hendro",
    displayName: "Hendro",
    role: "ConsultIQ Consultant",
    customers: CUSTOMERS,
  },
};

const PERSONA_STORAGE_KEY = "ciq_persona";
const ACTIVE_STORAGE_KEY = "ciq_active_customer";

function readPersona(): PersonaKey {
  const fromUrl = new URLSearchParams(window.location.search).get("persona");
  if (fromUrl === "customer-user" || fromUrl === "consultant") return fromUrl;
  const stored = localStorage.getItem(PERSONA_STORAGE_KEY);
  return stored === "customer-user" ? "customer-user" : "consultant";
}

/**
 * Resolves the session. Stands in for `GET /session`, which the real
 * backend derives from the auth token.
 */
export function getMockSession(): Session {
  const key = readPersona();
  const base = PERSONAS[key];
  const remembered = localStorage.getItem(ACTIVE_STORAGE_KEY);
  const activeCustomerId =
    remembered && base.customers.some((c) => c.id === remembered)
      ? remembered
      : base.customers[0].id;
  return { ...base, activeCustomerId };
}

/**
 * Records the chosen customer.
 *
 * Note what this does NOT do: grant access. It throws if the customer
 * is not in the session's entitlement list, mirroring the check the
 * real API must perform on every request rather than trusting the
 * client's choice.
 */
export function setMockActiveCustomer(customerId: string): Session {
  const session = getMockSession();
  if (!session.customers.some((c) => c.id === customerId)) {
    throw new Error(
      `Not entitled to customer ${customerId}. The server rejects this the same way — a customer id from the browser is a request, not a permission.`
    );
  }
  localStorage.setItem(ACTIVE_STORAGE_KEY, customerId);
  return { ...session, activeCustomerId: customerId };
}

/** Prototype only — lets you demo both personas without a login screen. */
export function setMockPersona(key: PersonaKey): void {
  localStorage.setItem(PERSONA_STORAGE_KEY, key);
  localStorage.removeItem(ACTIVE_STORAGE_KEY);
}

export function getMockPersona(): PersonaKey {
  return readPersona();
}

/** Admin > Customer Setup: who is entitled to a given customer, mirroring
 * customer_service.py's identities_for_customer(). */
export function identitiesForCustomer(customerId: string): IdentitySummary[] {
  return Object.values(PERSONAS)
    .filter((p) => p.customers.some((c) => c.id === customerId))
    .map((p) => ({ id: p.userId, displayName: p.displayName, role: p.role }));
}
