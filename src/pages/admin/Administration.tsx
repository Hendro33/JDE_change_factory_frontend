import { ValidationAdmin } from "../validation/ValidationAdmin";
import { AgentExecutionSwitches } from "../../components/AgentExecution";
import { ConnectionHealthCard } from "../../components/visualReview";
import { KnowledgePage } from "../knowledge/Knowledge";
import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { aiApi, type AiConnection } from "../../services/aiApi";
import type { IntegrationStatus } from "../../types/domain";
import { Link, navigate } from "../../router";
import { PageHeader, Tabs, useSessionInfo } from "../../components/design";
import { saveErrorMessage } from "../../services/saveErrors";
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
  { key: "validation", label: "Validation", what: "Test environments, accounts and assurance policy.", tabs: [{ key: "settings", label: "Settings", render: () => <ValidationAdmin /> }] },
  { key: "organisation", label: "Organisation", what: "The customer, its people and their roles.", tabs: [
    { key: "customer", label: "Customer", render: () => <CustomerSetup /> },
    { key: "users", label: "Users & roles", render: () => <Users /> },
  ] },
  { key: "connections", label: "Systems & Connections", what: "JD Edwards, Jira and the AI provider JADE works with.", tabs: [
    { key: "overview", label: "Overview", render: () => <ConnectionOverview /> },
    { key: "jde", label: "JD Edwards", render: () => <Integrations part="jde" /> },
    { key: "references", label: "ERP documentation & references", render: () => <KnowledgePage part="references" /> },
    { key: "jira", label: "Jira", render: () => <Integrations part="jira" /> },
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
    { key: "agent-execution", label: "Agent execution", render: () => <AgentExecutionSwitches /> },
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
      <div className="admin-main vr-pilot">
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
  const [integrationsError, setIntegrationsError] = useState("");
  const [aiError, setAiError] = useState("");
  useEffect(() => {
    api.listIntegrations().then(setIntegrations)
      .catch((e) => setIntegrationsError(`Connection status could not be loaded: ${saveErrorMessage(e, "unknown error")}`));
    aiApi.connection().then(setAi)
      .catch((e) => setAiError(`AI connection status could not be loaded: ${saveErrorMessage(e, "unknown error")}`));
  }, []);
  const aiState = !ai ? null : !ai.configured ? "Not set up" : !ai.enabled ? "Switched off" : ai.tested ? "Connected" : "Set up, not tested";
  const connected = (integrations ?? []).filter((i) => i.connected).length + (aiState === "Connected" ? 1 : 0);
  return <div className="vr-pilot">
    <div className="vr-connections-head"><span className="vr-connections-number">{integrations ? connected : "—"}</span><div><h2>Connections reported ready</h2><p>Configuration status from JADE. This overview does not run a live health check.</p></div></div>
    {integrationsError && <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{integrationsError}</div>}
    {aiError && <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{aiError}</div>}
    <div className="vr-connections-grid">
      {ai && <ConnectionHealthCard name="AI provider" status={aiState ?? "Unknown"} connected={aiState === "Connected"} detail={ai.providerLabel} model={ai.model} checkedAt={ai.lastTest?.at} to="/admin/agents/ai" />}
      {(integrations ?? []).map((i) => <ConnectionHealthCard key={i.name} name={i.name} status={i.connected ? "Connected (reported)" : "Not connected"} connected={i.connected} detail={i.detail} to={i.name.toLowerCase().includes("jira") ? "/admin/connections/jira" : /jd edwards|jde/i.test(i.name) ? "/admin/connections/jde" : undefined} />)}
    </div>
  </div>;
}
