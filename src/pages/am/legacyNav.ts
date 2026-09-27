/**
 * Bridges the restored Application Management and User Story Review
 * screens (written for main's in-page navigation: navigate(page, filter),
 * onOpenChange(id), navFilter/navToken) to the permanent URLs of the
 * current router. The screens keep their original behaviour; every
 * destination is now a real, shareable address.
 */
import { useMemo } from "react";
import { navigate, useLocation } from "../../router";
import type { NavFilter, NavTarget, Page } from "../../types/nav";

const PAGE_PATH: Record<Page, string> = {
  dashboard: "/am",
  userstories: "/stories",
  userstoryreview: "/stories/review",
  approval: "/am/backlog-review",
  architecture: "/am/architecture-review",
  technical: "/am/technical",
  process: "/am/process",
  asbuilt: "/am/as-built",
  deliveryqueue: "/am/delivery-queue",
  pipeline: "/am/changes",
  domains: "/business",
  "admin-process": "/business",
  "admin-customer": "/admin/organisation",
  "admin-erp": "/admin/governance",
  "admin-agents": "/admin/agents",
  "admin-ai": "/admin/agents/ai",
  "admin-agent-config": "/admin/agents/configuration",
  "admin-knowledge": "/admin/connections/references",
  "admin-integrations": "/admin/connections/jde",
  "admin-users": "/admin/organisation/users",
};

/** The URL for one of the original screens, with its filter as query parameters. */
export function pageUrl(page: Page, filter?: NavFilter): string {
  if (page === "userstories") {
    if (filter?.action === "create") return "/stories/new";
    const q = new URLSearchParams();
    if (filter?.view === "requests") q.set("phase", "understand");
    if (filter?.domainId) q.set("domain", filter.domainId);
    return `/stories${q.toString() ? `?${q}` : ""}`;
  }
  const q = new URLSearchParams(Object.entries(filter ?? {}).filter(([, v]) => v !== undefined && v !== ""));
  return `${PAGE_PATH[page]}${q.toString() ? `?${q}` : ""}`;
}

export function legacyNavigate(page: Page, filter?: NavFilter) {
  navigate(pageUrl(page, filter));
}

/** The Application Management record of one change. */
export function changePath(id: string): string {
  return `/am/changes/${encodeURIComponent(id)}`;
}

export function openChange(id: string) {
  navigate(changePath(id));
}

/**
 * The original screens re-apply their filter whenever navToken changes;
 * here the filter is the URL's query, and the token changes with it.
 */
export function useNavTarget(): NavTarget {
  const { path, query } = useLocation();
  const key = `${path}?${query.toString()}`;
  return useMemo(() => {
    let token = 0;
    for (let i = 0; i < key.length; i++) token = (token * 31 + key.charCodeAt(i)) | 0;
    return { navFilter: Object.fromEntries(query.entries()), navToken: token };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
