import { useEffect, useState } from "react";
import { api, IS_MOCK_MODE } from "../../services/api";
import { aiApi, type AiConnection } from "../../services/aiApi";
import type { IntegrationStatus } from "../../types/domain";
import { Link, navigate } from "../../router";
import { PageHeader, Tabs, useSessionInfo } from "../../components/design";
import { CustomerSetup } from "./CustomerSetup";
import { Users } from "./Users";
import { Integrations } from "./Integrations";
import { Agents } from "./Agents";
import { AiConnections } from "./AiConnections";
import { AgentConfiguration } from "./AgentConfiguration";
import { BusinessDomains } from "../BusinessDomains";
import { ProcessFramework } from "./ProcessFramework";
import { ErpLandscape } from "./ErpLandscape";

interface AdminSection {
  key: string;
  label: string;
  what: string;
  tabs: { key: string; label: string; render: () => JSX.Element }[];
}

/**
 * Administration, grouped by the responsibility being administered rather
 * than by the screen that happens to implement it. Technical enough to do
 * the job; the engine itself is visible under Operations.
 */
const SECTIONS: AdminSection[] = [
  { key: "organisation", label: "Organisation", what: "The customer, its people and their roles.", tabs: [
    { key: "customer", label: "Customer", render: () => <CustomerSetup /> },
    { key: "users", label: "Users & roles", render: () => <Users /> },
  ] },
  { key: "connections", label: "Systems & Connections", what: "JD Edwards, Jira and the AI provider JADE works with.", tabs: [
    { key: "overview", label: "Overview", render: () => <ConnectionOverview /> },
    { key: "settings", label: "Connection settings", render: () => <Integrations /> },
  ] },
  { key: "agents", label: "Agents & AI", what: "JADE's agents, the AI connection and what each agent works with.", tabs: [
    { key: "team", label: "Agents", render: () => <Agents /> },
    { key: "ai", label: "AI connection", render: () => <AiConnections /> },
    { key: "configuration", label: "Instructions & knowledge", render: () => <AgentConfiguration part="config" /> },
  ] },
  { key: "business-model", label: "Business Model", what: "Business domains, their owners and the process framework.", tabs: [
    { key: "domains", label: "Business domains", render: () => <BusinessDomains /> },
    { key: "processes", label: "Process framework", render: () => <ProcessFramework /> },
  ] },
  { key: "governance", label: "Governance", what: "What JADE may change, where, and who approves.", tabs: [
    { key: "scope", label: "Scope, approvals & environments", render: () => <ErpLandscape /> },
  ] },
  { key: "operations", label: "Operations", what: "Agent health, runs and cost -- the engine at work.", tabs: [
    { key: "agents", label: "Agent health & runs", render: () => <AgentConfiguration part="operations" /> },
  ] },
];

export function AdministrationPage({ section, sub }: { section?: string; sub?: string }) {
  const info = useSessionInfo();
  const active = SECTIONS.find((s) => s.key === section);
  useEffect(() => { if (section && !active) navigate("/admin", { replace: true }); }, [section, active]);

  return (
    <div className="admin">
      <aside className="adminnav" aria-label="Administration">
        <Link to="/admin" className={!active ? "on" : ""}>Overview</Link>
        {SECTIONS.map((s) => (
          <Link key={s.key} to={`/admin/${s.key}`} className={active?.key === s.key ? "on" : ""} aria-current={active?.key === s.key ? "page" : undefined}>{s.label}</Link>
        ))}
      </aside>
      <div className="admin-main">
        {!info.has("admin") && (
          <div className="noticebar">You can view these settings; only an administrator of this customer can change them.</div>
        )}
        {!active ? (
          <>
            <PageHeader title="Administration" subtitle="Set up and operate JADE for this customer." />
            <div className="admingrid">
              {SECTIONS.map((s) => (
                <Link key={s.key} to={`/admin/${s.key}`} className="admincard">
                  <span className="admincard-title">{s.label}</span>
                  <span className="admincard-what">{s.what}</span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <>
            <PageHeader title={active.label} subtitle={active.what} />
            {active.tabs.length > 1 && (
              <Tabs label={`${active.label} sections`} active={(active.tabs.find((t) => t.key === sub) ?? active.tabs[0]).key}
                    hrefFor={(k) => `/admin/${active.key}${k === active.tabs[0].key ? "" : `/${k}`}`}
                    tabs={active.tabs.map((t) => ({ key: t.key, label: t.label }))} />
            )}
            <div className="admin-content">{(active.tabs.find((t) => t.key === sub) ?? active.tabs[0]).render()}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** Connection cards: is each system connected, and where to fix it. Details stay under Connection settings. */
function ConnectionOverview() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[] | null>(null);
  const [ai, setAi] = useState<AiConnection | null>(null);
  useEffect(() => {
    api.listIntegrations().then(setIntegrations).catch(() => setIntegrations([]));
    if (!IS_MOCK_MODE) aiApi.connection().then(setAi).catch(() => setAi(null));
  }, []);
  const aiState = !ai ? null : !ai.configured ? "Not set up" : !ai.enabled ? "Switched off" : ai.tested ? "Connected" : "Set up, not tested";
  return (
    <div className="conngrid">
      {ai !== null && (
        <div className={`conncard ${aiState === "Connected" ? "ok" : "warn"}`}>
          <div className="conncard-name">AI provider</div>
          <div className="conncard-state">{aiState === "Connected" ? "✓ " : "○ "}{aiState}</div>
          <div className="conncard-detail">{ai.providerLabel}{ai.model ? ` · ${ai.model}` : ""}{ai.lastTest ? ` · last tested ${new Date(ai.lastTest.at).toLocaleDateString("en-GB")}` : ""}</div>
          <Link className="btn small" to="/admin/agents/ai">Configure</Link>
        </div>
      )}
      {(integrations ?? []).map((i) => (
        <div key={i.name} className={`conncard ${i.connected ? "ok" : "warn"}`}>
          <div className="conncard-name">{i.name}</div>
          <div className="conncard-state">{i.connected ? "✓ Connected" : "○ Not connected"}</div>
          <div className="conncard-detail">{i.detail}</div>
          <Link className="btn small" to="/admin/connections/settings">Configure</Link>
        </div>
      ))}
    </div>
  );
}
