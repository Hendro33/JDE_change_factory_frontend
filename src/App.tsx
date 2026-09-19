import { useEffect, useState } from "react";
import { api } from "./services/api";
import type { Session } from "./types/domain";
import { CustomerScope, PersonaSwitch } from "./components/CustomerScope";
import { Dashboard } from "./pages/Dashboard";
import { StoryEnhancement } from "./pages/StoryEnhancement";
import { ApprovalBacklog } from "./pages/ApprovalBacklog";
import { BuildStatus } from "./pages/BuildStatus";
import { ChangeDetail } from "./pages/ChangeDetail";

type Page = "home" | "story" | "backlog" | "build";

const NAV: { key: Page; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "story", label: "User story enhancement" },
  { key: "backlog", label: "Approval & backlog" },
  { key: "build", label: "Build status" },
];

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  /** Bumping this remounts the page so it refetches for the new customer. */
  const [scopeKey, setScopeKey] = useState(0);

  useEffect(() => { api.getSession().then(setSession); }, []);

  const go = (p: Page) => { setDetailId(null); setPage(p); };

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

  return (
    <div className="app">
      <header className="masthead">
        <div className="brandmark">
          <span className="logo">consult<b>IQ</b></span>
          <span className="product">
            <strong>JDE Change Factory</strong>
            <span>Smarter change. Greater value.</span>
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
        {NAV.map((n) => (
          <button key={n.key} className={page === n.key && !detailId ? "on" : ""} onClick={() => go(n.key)}>
            {n.label}
          </button>
        ))}
        <span className="spacer" />
        <span className="settings">Settings</span>
      </nav>

      <main className="page" key={scopeKey}>
        {detailId ? (
          <ChangeDetail changeId={detailId} onBack={() => setDetailId(null)} />
        ) : page === "home" ? (
          <Dashboard onOpenChange={setDetailId} onGoTo={(p) => go(p)} />
        ) : page === "story" ? (
          <StoryEnhancement onOpenChange={setDetailId} />
        ) : page === "backlog" ? (
          <ApprovalBacklog />
        ) : (
          <BuildStatus onOpenChange={setDetailId} />
        )}
      </main>

      <footer className="sitefoot">
        <span className="logo">consult<b>IQ</b></span>
        <span>Smarter change. Greater value.</span>
        <span style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <PersonaSwitch onChange={reloadSession} />
          <span>JDE Change Factory · v0.1 prototype · front-end only, mock data</span>
        </span>
      </footer>
    </div>
  );
}
