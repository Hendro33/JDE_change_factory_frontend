/**
 * Shared navigation types. Kept separate from App.tsx so pages can
 * import them without a circular import (App.tsx imports every page).
 */

export type Page =
  | "dashboard"
  | "userstories"
  | "userstoryreview"
  | "approval"
  | "architecture"
  | "technical"
  | "deliveryqueue"
  | "pipeline"
  | "domains"
  | "admin-customer"
  | "admin-erp"
  | "admin-agents"
  | "admin-integrations"
  | "admin-users";

export type NavFilter = Record<string, string>;

/**
 * What a page receives when App.tsx navigates it somewhere with a
 * filter pre-applied (e.g. a Dashboard metric click). `navToken` bumps
 * on every navigate() call so a page reacts even when re-navigated to
 * itself with a new filter.
 */
export interface NavTarget {
  navFilter?: NavFilter;
  navToken: number;
}

export type Navigate = (page: Page, filter?: NavFilter) => void;
