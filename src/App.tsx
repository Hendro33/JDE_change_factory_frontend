import { ValidationWorkspace } from "./pages/validation/Validation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./services/api";
import { authApi } from "./services/httpApi";
import type { BusinessDomain, CompanyRole, MyWork, Session } from "./types/domain";
import { CustomerScope } from "./components/CustomerScope";
import { SetupHandover } from "./components/SetupHandover";
import { ROLE_LABEL, SessionContext, type SessionInfo, attentionOf, storyTitle, Loading } from "./components/design";
import { GlobalSearch } from "./components/GlobalSearch";
import { Link, match, navigate, storyPath, useLocation } from "./router";
import { MyWorkPage } from "./pages/work/MyWork";
import { StoriesPage } from "./pages/stories/Stories";
import { NewRequestPage } from "./pages/stories/NewRequest";
import { StoryWorkspace } from "./pages/stories/StoryWorkspace";
import { BusinessArchitecturePage } from "./pages/business/BusinessArchitecture";
import { KnowledgePage } from "./pages/knowledge/Knowledge";
import { ReportsPage } from "./pages/reports/Reports";
import { SearchPage } from "./pages/search/Search";
import { AdministrationPage } from "./pages/admin/Administration";
import { NotFoundPage } from "./pages/NotFound";
import { AmWorkspace } from "./pages/am/AmWorkspace";
import { gateFor } from "./pages/stories/NextActionCard";
import { DemandReview } from "./pages/demand/DemandNav";
import { EmptyState, useSessionInfo } from "./components/design";
import { Login } from "./pages/auth/Login";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { AcceptInvitation } from "./pages/auth/AcceptInvitation";

/**
 * The primary navigation, by role. Business Demand is the Domain Owner's
 * journey (request to approved story); Application Management is the
 * Application Manager's (approved story to release and as-built); the
 * two stay separate. Administration is shown only to administrators.
 */
const PRIMARY_NAV: { to: string; label: string; short?: string; section: string; show?: (info: SessionInfo) => boolean }[] = [
  { to: "/work", label: "My Work", section: "work" },
  { to: "/stories", label: "Business Demand", short: "Demand", section: "stories" },
  { to: "/business", label: "Business Architecture", short: "Architecture", section: "business" },
  { to: "/am", label: "Application Management", short: "App Management", section: "am", show: (i) => i.appManagement },
  { to: "/validation", label: "Validation", section: "validation", show: (i) => i.has("test_manager", "product_manager", "admin") },
  { to: "/reports", label: "Insights", section: "reports" },
];

/** Which nav section a path belongs to -- exactly one, derived from the URL. */
function sectionOf(path: string): string {
  const first = path.split("/").filter(Boolean)[0] ?? "work";
  return first === "search" ? "" : first;
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open, close]);
  return ref;
}

function Notifications({ work }: { work: MyWork | null }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const { decisions, otherTasks, newRequests, count } = attentionOf(work);
  const items = [...decisions, ...otherTasks];
  return (
    <div className="notif" ref={ref}>
      <button className="iconbtn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}
              aria-label={`${count} item${count === 1 ? "" : "s"} need your attention`}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>
        {count > 0 && <span className="notif-count">{count}</span>}
      </button>
      {open && (
        <div className="notif-menu" role="menu">
          <div className="notif-head">{count === 0 ? "Nothing needs you right now" : `${count} thing${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} your attention`}</div>
          {items.slice(0, 8).map((c) => (
            <Link key={c.id} role="menuitem" className="notif-item" to={(c.lifecycle?.nextAction.action && gateFor(c.lifecycle.nextAction.action, c.id)?.to) || storyPath(c.id, c.lifecycle?.nextAction.tab, "next-action")} onClick={() => setOpen(false)}>
              <span className="notif-title">{c.lifecycle?.nextAction.kind === "decision" ? "Decision needed" : "To do"} · {c.lifecycle?.phaseLabel}</span>
              <span className="notif-story">{storyTitle(c)}</span>
            </Link>
          ))}
          {newRequests.length > 0 && (
            <Link role="menuitem" className="notif-item" to="/stories?phase=understand" onClick={() => setOpen(false)}>
              <span className="notif-title">To do · Understand</span>
              <span className="notif-story">{newRequests.length} new request{newRequests.length === 1 ? "" : "s"} to analyse</span>
            </Link>
          )}
          <Link className="notif-all" to="/work" onClick={() => setOpen(false)}>Open My Work</Link>
        </div>
      )}
    </div>
  );
}

function UserMenu({ session, roles, onSignedOut }: { session: Session; roles: CompanyRole[]; onSignedOut?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const initials = session.displayName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="usermenu" ref={ref}>
      <button className="avatar" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open} aria-label={`Account: ${session.displayName}`}>
        {initials}
      </button>
      {open && (
        <div className="usermenu-panel">
          <div className="usermenu-name">{session.displayName}</div>
          <div className="usermenu-mail">{session.email}</div>
          <div className="usermenu-roles">{roles.map((r) => ROLE_LABEL[r] ?? r).join(" · ") || "No role on this customer"}</div>
          {onSignedOut && (
            <button className="btn" onClick={async () => { await authApi.logout(); onSignedOut(); }}>Sign out</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Administration is the Jade Administrator's; other roles do not see it at all. */
function AdminGate({ children }: { children: JSX.Element }) {
  const info = useSessionInfo();
  if (info.admin) return children;
  return <EmptyState title="Administration is for administrators">Setting up and maintaining Jade is done by the Jade Administrator of this customer.</EmptyState>;
}

function Routes() {
  const { path } = useLocation();
  useEffect(() => { if (path === "/") navigate("/work", { replace: true }); }, [path]);
  let m: Record<string, string> | null;
  if (path === "/") return null;
  if (match("/work", path)) return <MyWorkPage />;
  if (match("/stories", path)) return <StoriesPage />;
  if (match("/stories/new", path)) return <NewRequestPage />;
  if (match("/stories/review", path)) return <DemandReview />;
  if ((m = match("/stories/:id/:tab?", path))) return <StoryWorkspace key={m.id} storyId={m.id} tab={m.tab} />;
  if ((m = match("/business/:domainId?", path))) return <BusinessArchitecturePage domainId={m.domainId} />;
  if (match("/knowledge", path)) return <KnowledgePage />;
  if (match("/reports", path)) return <ReportsPage />;
  if (match("/search", path)) return <SearchPage />;
  if (path === "/validation" || path === "/validation/tasks") return <ValidationWorkspace />;
  if (path === "/am" || path.startsWith("/am/")) return <AmWorkspace />;
  if ((m = match("/admin/:section?/:sub?", path))) return <AdminGate><AdministrationPage section={m.section} sub={m.sub} /></AdminGate>;
  return <NotFoundPage />;
}

function MainApp({ onSignedOut, onSetupFinished }: { onSignedOut: () => void; onSetupFinished: (email: string) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [domains, setDomains] = useState<BusinessDomain[]>([]);
  const [work, setWork] = useState<MyWork | null>(null);
  /** Bumping this remounts the page so it refetches for the new customer. */
  const [scopeKey, setScopeKey] = useState(0);
  const { path } = useLocation();

  useEffect(() => { api.getSession().then(setSession); }, []);
  useEffect(() => {
    if (!session) return;
    api.listBusinessDomains().then(setDomains).catch(() => setDomains([]));
  }, [session?.activeCustomerId, scopeKey]);
  // My Work drives the notification count; refreshed on every navigation.
  useEffect(() => {
    if (!session) return;
    api.getMyWork().then(setWork).catch(() => setWork(null));
  }, [session?.activeCustomerId, scopeKey, path]);

  async function switchCustomer(customerId: string) {
    const next = await api.setActiveCustomer(customerId);
    setSession(next);
    setScopeKey((k) => k + 1);
    // A story from the previous customer would not exist for this one.
    if (path.startsWith("/stories/")) navigate("/stories");
  }

  const info: SessionInfo | null = useMemo(() => {
    if (!session) return null;
    const active = session.customers.find((c) => c.id === session.activeCustomerId);
    const roles = (active?.roles ?? []) as CompanyRole[];
    const byId = new Map(domains.map((d) => [d.id, d]));
    return {
      session, roles, domains,
      has: (...r: CompanyRole[]) => r.some((x) => roles.includes(x)),
      technical: roles.some((r) => ["admin", "product_manager", "cnc_operator"].includes(r)),
      appManagement: roles.some((r) => ["admin", "product_manager", "cnc_operator"].includes(r)),
      admin: roles.includes("admin"),
      domainName: (id?: string | null) => (id ? byId.get(id)?.name : undefined),
    };
  }, [session, domains]);

  const section = sectionOf(path);

  return (
    <div className="app">
      <a className="skiplink" href="#main">Skip to content</a>
      <header className="appbar">
        <div className="appbar-row">
          <Link to="/work" className="brand" aria-label="Jade — My Work">
            <img src={`${import.meta.env.BASE_URL}jade-wordmark.png`} alt="Jade" className="brand-mark" />
          </Link>
          <nav className="primarynav" aria-label="Primary">
            {PRIMARY_NAV.filter((n) => !info || !n.show || n.show(info)).map((n) => (
              <Link key={n.to} to={n.to} className={section === n.section ? "on" : ""} aria-current={section === n.section ? "page" : undefined}
                    aria-label={n.short ? n.label : undefined} title={n.short ? n.label : undefined}>
                {n.short ? <><span className="navfull">{n.label}</span><span className="navshort" aria-hidden="true">{n.short}</span></> : n.label}
              </Link>
            ))}

          </nav>
          <div className="appbar-tools">
            <GlobalSearch />
            {info?.admin && (
              <Link to="/admin" className={`iconbtn${section === "admin" ? " on" : ""}`} aria-label="Administration" title="Administration"
                    aria-current={section === "admin" ? "page" : undefined}>
                <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94a7.07 7.07 0 0 0 .06-.94 7.07 7.07 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54a7 7 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.7 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.8a.5.5 0 0 0 .49-.42l.36-2.54a7 7 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64ZM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Z"/></svg>
              </Link>
            )}
            <Notifications work={work} />
            {session && <CustomerScope session={session} onSwitch={switchCustomer} />}
            {session && info && <UserMenu session={session} roles={info.roles} onSignedOut={onSignedOut} />}
          </div>
        </div>
      </header>

      <main className="page" id="main" key={scopeKey}>
        <SetupHandover onDone={onSetupFinished} />
        {!info ? <Loading what="Jade" /> : (
          <SessionContext.Provider value={info}>
            <Routes />
          </SessionContext.Provider>
        )}
      </main>

      <footer className="sitefoot">
        <div className="footer-brand">
          <span className="logo">consult<b>IQ</b></span>
          <span className="footer-tagline">Jade — an AI delivery team for enterprise change</span>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <BuildVersions />
        </span>
      </footer>
    </div>
  );
}

/** Which frontend and backend commits are actually running. */
function BuildVersions() {
  const [backend, setBackend] = useState<string>("…");
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/health`)
      .then((r) => r.json()).then((h) => setBackend(h.commit ?? "unknown")).catch(() => setBackend("unreachable"));
  }, []);
  return <span className="mono" style={{ fontSize: 12 }}>Jade · frontend {__BUILD_COMMIT__} · backend {backend}</span>;
}

/**
 * Top-level dispatcher. Password-reset and invitation-acceptance links
 * (query params) take priority over everything else, then a real
 * session check gates the rest of the app behind Login. The address the person opened is
 * kept, so a shared story link still lands on that story after sign-in.
 */
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("resetToken");
  const acceptToken = params.get("acceptInvitation");

  const [authState, setAuthState] = useState<"checking" | "signed-in" | "signed-out">("checking");
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  useEffect(() => {
    if (resetToken || acceptToken) return;
    authApi
      .me()
      .then(() => setAuthState("signed-in"))
      .catch(() => setAuthState("signed-out"));
    // Intentionally run once: resetToken/acceptToken don't change
    // during this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearAuthLinkParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete("resetToken");
    url.searchParams.delete("acceptInvitation");
    window.history.replaceState({}, "", url.toString());
  }

  if (resetToken) {
    return (
      <ResetPassword
        token={resetToken}
        onDone={() => {
          clearAuthLinkParams();
          setAuthState("signed-out");
        }}
      />
    );
  }

  if (acceptToken) {
    return (
      <AcceptInvitation
        token={acceptToken}
        onAccepted={() => {
          clearAuthLinkParams();
          setAuthState("signed-in");
        }}
        onGoToLogin={() => {
          clearAuthLinkParams();
          setAuthState("signed-out");
        }}
      />
    );
  }

  if (authState === "checking") return null;
  if (authState === "signed-out") return <Login notice={loginNotice} onSignedIn={() => { setLoginNotice(null); setAuthState("signed-in"); }} />;

  return <MainApp onSignedOut={() => setAuthState("signed-out")}
    onSetupFinished={(email) => {
      setLoginNotice(`Setup finished. The setup account is switched off. Sign in as ${email} with the password you just chose.`);
      setAuthState("signed-out");
    }} />;
}
