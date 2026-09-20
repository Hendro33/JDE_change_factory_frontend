import { useEffect, useRef, useState } from "react";
import { api } from "./services/api";
import type { Session } from "./types/domain";
import type { NavFilter, NavTarget, Page } from "./types/nav";
import { CustomerScope, PersonaSwitch } from "./components/CustomerScope";
import { Dashboard } from "./pages/Dashboard";
import { UserStories } from "./pages/UserStories";
import { ApprovalBacklog } from "./pages/ApprovalBacklog";
import { DeliveryQueuePage } from "./pages/DeliveryQueue";
import { Pipeline } from "./pages/Pipeline";
import { BusinessDomains } from "./pages/BusinessDomains";
import { ChangeDetail } from "./pages/ChangeDetail";
import { CustomerSetup } from "./pages/admin/CustomerSetup";
import { ErpLandscape } from "./pages/admin/ErpLandscape";
import { Agents } from "./pages/admin/Agents";
import { Integrations } from "./pages/admin/Integrations";

interface NavItem { key: Page; label: string; filter?: NavFilter }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { label: "Home", items: [{ key: "dashboard", label: "Dashboard" }] },
  { label: "Demand", items: [
    { key: "userstories", label: "Requests", filter: { view: "requests" } },
    { key: "userstories", label: "User Stories", filter: { view: "all" } },
  ] },
  { label: "Governance", items: [
    { key: "userstories", label: "User Story Review", filter: { view: "review" } },
    { key: "approval", label: "Approval & Backlog" },
  ] },
  { label: "Delivery", items: [
    { key: "deliveryqueue", label: "Delivery Queue" },
    { key: "pipeline", label: "Active Changes", filter: { stage: "active" } },
    { key: "pipeline", label: "Validation", filter: { stage: "validation" } },
  ] },
  { label: "Release", items: [
    { key: "pipeline", label: "Ready for Release / CNC", filter: { stage: "release" } },
  ] },
  { label: "Knowledge", items: [
    { key: "domains", label: "Business Domains" },
  ] },
];

/**
 * Kept out of NAV_GROUPS on purpose and rendered after the `.spacer`,
 * in the same slot the inert "Settings" label used to occupy — an
 * administrative area is deliberately visually separate from the main
 * task-oriented groups, not just another item among them.
 */
const ADMIN_GROUP: NavGroup = {
  label: "Admin",
  items: [
    { key: "admin-customer", label: "Customer Setup" },
    { key: "admin-erp", label: "ERP / JDE Landscape" },
    { key: "admin-agents", label: "Agents" },
    { key: "domains", label: "Business Domains" },
    { key: "admin-integrations", label: "Integrations" },
  ],
};

function NavGroupMenu({
  group, page, navFilter, onNavigate,
}: {
  group: NavGroup;
  page: Page;
  navFilter: NavFilter | undefined;
  onNavigate: (p: Page, filter?: NavFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (group.items.length === 1 && !group.items[0].filter) {
    const only = group.items[0];
    return (
      <button className={page === only.key ? "on" : ""} onClick={() => onNavigate(only.key)}>
        {group.label}
      </button>
    );
  }

  const activeItem = group.items.find((it) => it.key === page && sameFilter(it.filter, navFilter));
  const groupActive = activeItem ?? group.items.find((it) => it.key === page);

  return (
    <div className="navgroup" ref={ref}>
      <button
        className={groupActive ? "on" : ""}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {group.label}
        <span aria-hidden="true" className="navgroup-caret">▾</span>
      </button>
      {open && (
        <ul className="navgroup-menu" role="menu">
          {group.items.map((it, i) => (
            <li key={`${it.key}-${i}`}>
              <button
                className={activeItem === it ? "on" : ""}
                onClick={() => { setOpen(false); onNavigate(it.key, it.filter); }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function sameFilter(a: NavFilter | undefined, b: NavFilter | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k) => a[k] === b[k]);
}

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [navFilter, setNavFilter] = useState<NavFilter | undefined>(undefined);
  /** Bumps on every navigate() call so a page can react even when re-navigated to itself with a new filter. */
  const [navToken, setNavToken] = useState(0);
  /** Bumping this remounts the page so it refetches for the new customer. */
  const [scopeKey, setScopeKey] = useState(0);

  useEffect(() => { api.getSession().then(setSession); }, []);

  function navigate(p: Page, filter?: NavFilter) {
    setDetailId(null);
    setPage(p);
    setNavFilter(filter);
    setNavToken((t) => t + 1);
  }

  async function switchCustomer(customerId: string) {
    const next = await api.setActiveCustomer(customerId);
    setSession(next);
    // Leaving a change detail open across a customer switch would show
    // a record that no longer belongs to the active scope.
    setDetailId(null);
    setScopeKey((k) => k + 1);
  }

  function reloadSession() {
    api.getSession().then((s) => {
      setSession(s);
      setDetailId(null);
      setScopeKey((k) => k + 1);
    });
  }

  const navTarget: NavTarget = { navFilter, navToken };

  return (
    <div className="app">
      <header className="masthead">
        <div className="brandmark">
          <span className="logo">consult<b>IQ</b></span>
          <span className="product">
            <strong>Jade</strong>
            <span>An AI delivery team for enterprise change</span>
          </span>
        </div>
        <div className="who">
          {session && <CustomerScope session={session} onSwitch={switchCustomer} />}
          <span className="divider" />
          <span>
            {session?.displayName ?? "…"}
            {session && <span className="role">{session.role}</span>}
          </span>
        </div>
      </header>

      <nav className="mainnav">
        {NAV_GROUPS.map((g) => (
          <NavGroupMenu key={g.label} group={g} page={page} navFilter={navFilter} onNavigate={navigate} />
        ))}
        <span className="spacer" />
        <NavGroupMenu group={ADMIN_GROUP} page={page} navFilter={navFilter} onNavigate={navigate} />
      </nav>

      <main className="page" key={scopeKey}>
        {detailId ? (
          <ChangeDetail changeId={detailId} onBack={() => setDetailId(null)} />
        ) : page === "dashboard" ? (
          <Dashboard onOpenChange={setDetailId} onNavigate={navigate} />
        ) : page === "userstories" ? (
          <UserStories onOpenChange={setDetailId} {...navTarget} />
        ) : page === "approval" ? (
          <ApprovalBacklog {...navTarget} />
        ) : page === "deliveryqueue" ? (
          <DeliveryQueuePage onOpenChange={setDetailId} />
        ) : page === "domains" ? (
          <BusinessDomains onNavigate={navigate} />
        ) : page === "admin-customer" ? (
          <CustomerSetup />
        ) : page === "admin-erp" ? (
          <ErpLandscape />
        ) : page === "admin-agents" ? (
          <Agents />
        ) : page === "admin-integrations" ? (
          <Integrations />
        ) : (
          <Pipeline onOpenChange={setDetailId} {...navTarget} />
        )}
      </main>

      <footer className="sitefoot">
        <span className="logo">consult<b>IQ</b></span>
        <span>An AI delivery team for enterprise change</span>
        <span style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <PersonaSwitch onChange={reloadSession} />
          <span>Jade · v0.1 prototype · front-end only, mock data</span>
        </span>
      </footer>
    </div>
  );
}
