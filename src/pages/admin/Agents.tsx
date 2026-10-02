import { ReviewDetail } from "../../components/visualReview";
import { aiApi, type AiSpend, type RoleHealth } from "../../services/aiApi";
import { agentSettingsApi, type AgentSettings } from "../../services/agentSettingsApi";
import { saveErrorMessage } from "../../services/saveErrors";
import { Fragment, useEffect, useState } from "react";
import type { SVGProps } from "react";
import { api } from "../../services/api";
import type { AgentDefinition, AgentHealth, AgentInventoryEntry, Capability } from "../../types/domain";
import { CapabilityStatusBadge, Loading, NotStated } from "../../components/ui";
import { useSessionInfo } from "../../components/design";
import {
  ArchitectIcon,
  DevelopmentIcon,
  FunctionalIcon,
  ImproveIcon,
  ReceiveIcon,
  RequirementsIcon,
} from "../../components/agentIcons";

const STAGE_TONE: Record<string, string> = { started: "info", done: "ok", failed: "stop" };

type AgentGroup = "Requirements" | "Solution" | "Delivery" | "Validation";
type AgentStatus = "Active" | "Limited" | "Planned";

/**
 * The roster comes from the ONE canonical agent inventory
 * (GET /admin/agent-inventory), so this page, the on/off switches and the
 * AI configuration always list the same agents.
 */
interface RosterEntry {
  key: string;
  displayName: string;
  purpose: string;
  group: AgentGroup;
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  /** Its definition file in .claude/agents (GET /admin/agents), if it has one. */
  internalName: string | null;
  runsInJade: boolean;
  note: string;
}

const ICONS: Record<string, (props: SVGProps<SVGSVGElement>) => JSX.Element> = {
  "receive-agent": ReceiveIcon, "improve-agent": ImproveIcon, "check-agent": RequirementsIcon,
  "process-analyst": RequirementsIcon, architect: ArchitectIcon, "functional-agent": FunctionalIcon,
  "technical-agent": DevelopmentIcon,
};

function toRoster(inv: AgentInventoryEntry[]): RosterEntry[] {
  return inv.map((e) => ({
    key: e.key, displayName: e.label, purpose: e.purpose,
    group: (["Requirements", "Solution", "Delivery", "Validation"].includes(e.group) ? e.group : "Delivery") as AgentGroup,
    icon: ICONS[e.key] ?? RequirementsIcon, internalName: e.definition ?? null, runsInJade: e.runsInJade, note: e.note,
  }));
}

const GROUPS: AgentGroup[] = ["Requirements", "Solution", "Delivery", "Validation"];
const GROUP_TONE: Record<AgentGroup, string> = { Requirements: "info", Solution: "ai", Delivery: "ok", Validation: "info" };

const STATUS_BADGE: Record<AgentStatus, string> = { Active: "ok", Limited: "warn", Planned: "grey" };
const STATUS_NOTE: Record<AgentStatus, string> = {
  Active: "Built and orchestrated by Jade today.",
  Limited: "Built, but not yet orchestrated by any Jade driver — still run directly, not automated end to end.",
  Planned: "Not yet enabled. No .claude/agents definition exists for this role today.",
};

const capabilityName = (c: Capability) => String(c.identity["description"] ?? c.capabilityId);

function statusFor(entry: RosterEntry, byName: Map<string, AgentDefinition>): AgentStatus {
  if (entry.runsInJade) return "Active";
  if (entry.internalName && byName.get(entry.internalName)) return byName.get(entry.internalName)!.runtime ? "Active" : "Limited";
  return "Planned";
}

const DRIVER_LABEL: Record<string, string> = {
  orchestration_driver: "Requirement to user story",
  conversation_driver: "Story conversation",
  review_driver: "Story review",
  architecture_driver: "Solution design",
  process_analysis: "Process analysis",
  browser_executor: "Delivery in JDE",
  validation: "Validation",
};

const usd = (n: number | null | undefined, digits = 2) => (n == null ? "—" : `$${n.toFixed(digits)}`);
const duration = (ms: number | null | undefined) =>
  ms == null ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`;

/** Workspace key figures: estimated AI cost per day, week and month, runs and agent readiness. */
function KeyMetrics({ spend, spendError, roleHealth, available, total }: {
  spend: AiSpend | null; spendError: string; roleHealth: RoleHealth[]; available: string[]; total: number;
}) {
  const needsAttention = (h?: RoleHealth) => !!h && !h.disabled && (h.state === "failed" || h.state === "not configured");
  const attention = roleHealth.filter((h) => needsAttention(h)).length;
  if (spendError) return <div className="callout" role="alert">{spendError}</div>;
  if (!spend) return <Loading what="the agent key figures" />;
  const m = spend.month;
  const finished = m.completed + m.failed;
  const budgetShare = spend.monthlyBudgetUsd ? m.costUsd / spend.monthlyBudgetUsd : null;
  const peak = Math.max(...spend.daily.map((d) => d.costUsd), 0.0001);
  return (
    <>
      <div className="grid kpis agentkpis">
        <div className="kpi"><div className="value">{usd(spend.today.costUsd)}</div>
          <div className="label">Cost today</div><div className="delta"><span className="since">{spend.today.runs} run{spend.today.runs === 1 ? "" : "s"}</span></div></div>
        <div className="kpi"><div className="value">{usd(spend.week.costUsd)}</div>
          <div className="label">Cost last 7 days</div><div className="delta"><span className="since">{spend.week.runs} run{spend.week.runs === 1 ? "" : "s"}</span></div></div>
        <div className="kpi"><div className={`value${budgetShare != null && budgetShare >= 1 ? " stop" : budgetShare != null && budgetShare >= 0.8 ? " warn" : ""}`}>{usd(m.costUsd)}</div>
          <div className="label">Cost this month</div>
          <div className="delta"><span className="since">{spend.monthlyBudgetUsd != null ? `${Math.round((budgetShare ?? 0) * 100)}% of ${usd(spend.monthlyBudgetUsd, 0)} budget` : "No monthly budget set"}</span></div>
          {budgetShare != null && (
            <div className="budgetbar" aria-hidden="true"><span style={{ width: `${Math.min(100, budgetShare * 100)}%` }} /></div>
          )}
        </div>
        <div className="kpi"><div className="value">{m.runs}</div><div className="label">Runs this month</div>
          <div className="delta"><span className="since">{m.completed} completed · {m.failed} failed{m.blocked ? ` · ${m.blocked} blocked` : ""}</span></div></div>
        <div className="kpi"><div className={`value${finished && m.completed / finished < 0.8 ? " warn" : ""}`}>{finished ? `${Math.round((m.completed / finished) * 100)}%` : "—"}</div>
          <div className="label">Success rate this month</div><div className="delta"><span className="since">completed of finished runs</span></div></div>
        <div className="kpi"><div className="value">{duration(m.avgDurationMs)}</div><div className="label">Average run time</div>
          <div className="delta"><span className="since">this month</span></div></div>
        <div className="kpi"><div className={`value${attention ? " warn" : ""}`}>{available.filter((k) => !needsAttention(roleHealth.find((h) => h.role === k))).length}<span className="kpi-of">/{total}</span></div>
          <div className="label">Agents ready to run</div>
          <div className="delta"><span className="since">{attention ? `${attention} need${attention === 1 ? "s" : ""} attention` : "none need attention"}</span></div></div>
      </div>
      <div className="grid halves">
        <section className="panel">
          <h2>Daily cost <span className="qualifier">— last 14 days</span></h2>
          <div className="costbars" role="img" aria-label="Estimated cost per day over the last 14 days">
            {spend.daily.map((d) => (
              <div key={d.date} className="costbar" title={`${new Date(d.date).toLocaleDateString("en-GB")}: ${usd(d.costUsd)} · ${d.runs} run${d.runs === 1 ? "" : "s"}`}>
                <span style={{ height: `${Math.max(d.costUsd > 0 ? 4 : 0, (d.costUsd / peak) * 100)}%` }} />
                <small>{new Date(d.date).getDate()}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>This month by activity</h2>
          {spend.monthByDriver.length === 0 ? (
            <div className="empty" style={{ padding: 16 }}>No agent runs this month yet.</div>
          ) : (
            <table className="data">
              <thead><tr><th>Activity</th><th>Runs</th><th>Estimated cost</th></tr></thead>
              <tbody>
                {spend.monthByDriver.map((d) => (
                  <tr key={d.driver}><td>{DRIVER_LABEL[d.driver] ?? d.driver}</td><td>{d.runs}</td><td>{usd(d.costUsd)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        Costs are estimates in {spend.currency}, {spend.costBasis}; days run in UTC. Your Anthropic Console shows the invoiced amount.
      </p>
    </>
  );
}

export function Agents() {
  const [roleHealth, setRoleHealth] = useState<RoleHealth[]>([]);
  const [healthError, setHealthError] = useState("");
  const [spend, setSpend] = useState<AiSpend | null>(null);
  const [spendError, setSpendError] = useState("");
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const isAdmin = useSessionInfo().has("admin");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[] | null>(null);
  const [healthByAgent, setHealthByAgent] = useState<Record<string, AgentHealth>>({});
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    aiApi.health().then((h) => setRoleHealth(h.roles)).catch((e) => setHealthError(`Customer AI health could not be loaded: ${saveErrorMessage(e, "unknown error")}`));
    aiApi.spend().then(setSpend).catch((e) => setSpendError(`The cost figures could not be loaded: ${saveErrorMessage(e, "unknown error")}`));
    api.listAgentInventory().then((inv) => setRoster(toRoster(inv)))
      .catch((e) => setLoadError(`The agent team could not be loaded: ${saveErrorMessage(e, "unknown error")}`));
    api.listAgents().then(async (list) => {
      setAgents(list);
      // Every row needs its own real health snapshot, not just the
      // expanded agent's.
      const pairs = await Promise.all(list.map(async (a) => [a.name, await api.getAgentHealth(a.name)] as const));
      setHealthByAgent(Object.fromEntries(pairs));
    }).catch((e) => setLoadError(`The agent definitions could not be loaded: ${saveErrorMessage(e, "unknown error")}`));
    agentSettingsApi.get().then(setSettings).catch((e) => setSettingsError(saveErrorMessage(e, "Could not load the agent settings.")));
  }, []);

  async function toggle(name: string, enabled: boolean) {
    if (!settings) return;
    const disabled = settings.agents.filter((a) => (a.name === name ? !enabled : !a.enabled)).map((a) => a.name);
    setSettingsError(null);
    try { setSettings(await agentSettingsApi.save(disabled, settings.revision)); }
    catch (e) { setSettingsError(saveErrorMessage(e, "Could not save the agent settings.")); }
  }
  const enabledFor = (key: string | null) => settings?.agents.find((a) => a.name === key)?.enabled;
  const flip = (key: string) => setOpen((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const byName = new Map((agents ?? []).map((a) => [a.name, a]));
  if (!roster.length) return loadError ? <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{loadError}</div> : <Loading what="the agent team" />;
  const available = roster.filter((r) => statusFor(r, byName) === "Active" && enabledFor(r.key) !== false).map((r) => r.key);

  return (
    <>
      <div className="pagehead">
        <div>
          <h2 style={{ margin: 0 }}>Your JADE agents</h2>
          <div className="sub">{roster.length} agents · key figures, configuration, current health and recent activity.</div>
        </div>
      </div>

      <div className="stack">
        <KeyMetrics spend={spend} spendError={spendError} roleHealth={roleHealth} available={available} total={roster.length} />
        {healthError && <div className="callout" role="alert">{healthError}</div>}
        {settingsError && <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{settingsError}</div>}
        {!agents ? (
          loadError ? <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{loadError}</div> : <Loading what="the agent team" />
        ) : (
          <section className="panel" style={{ padding: 0, overflowX: "auto" }}>
            <table className="data agenttable">
              <thead>
                <tr>
                  <th aria-label="Expand" /><th>Agent</th><th>Status</th><th>Health</th><th>Model</th>
                  <th>Instructions</th><th>Runs</th><th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.filter((g) => roster.some((r) => r.group === g)).map((group) => (
                  <Fragment key={group}>
                    <tr className="agenttable-group"><td colSpan={8}>{group}</td></tr>
                    {roster.filter((r) => r.group === group).map((entry) => {
                      const customerHealth = roleHealth.find((h) => h.role === entry.key);
                      const h = entry.internalName ? healthByAgent[entry.internalName] : undefined;
                      const status = statusFor(entry, byName);
                      const lastRun = h?.recentRuns[0];
                      const Icon = entry.icon;
                      const tone = GROUP_TONE[entry.group];
                      const isOpen = open.has(entry.key);
                      return (
                        <Fragment key={entry.key}>
                          <tr className={`agenttable-row${isOpen ? " open" : ""}${status === "Planned" ? " planned" : ""}`}
                              onClick={() => flip(entry.key)}>
                            <td>
                              <button className="linkbtn" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} details for ${entry.displayName}`}
                                      onClick={(e) => { e.stopPropagation(); flip(entry.key); }}>
                                <span className="row-chevron" />
                              </button>
                            </td>
                            <td>
                              <div className="agenttable-name">
                                <span className="agenticon small" style={{ background: `var(--${tone}-bg)`, color: `var(--${tone})` }}><Icon /></span>
                                <div>
                                  <strong>{entry.displayName}</strong>
                                  <div className="hint">{entry.purpose}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${STATUS_BADGE[status]}`}>{status === "Active" ? "Available" : status}</span>
                              {enabledFor(entry.key) === false && <> <span className="badge stop">Off</span></>}
                            </td>
                            <td>
                              {customerHealth?.state ?? <span className="notstated">{status === "Planned" ? "Not available" : "Not reported"}</span>}
                              {customerHealth?.lastRun?.status === "failed" && <div><span className="badge stop">Last run failed</span></div>}
                            </td>
                            <td className="mono" style={{ fontSize: 12.5 }}>{customerHealth?.configuredModel ?? <span className="notstated">None</span>}</td>
                            <td>{customerHealth?.pack?.packName ?? <span className="notstated">None</span>}</td>
                            <td>
                              {status === "Planned" || !h ? <span className="notstated">—</span> : (
                                <>
                                  {h.runCounts.done ?? 0}
                                  {(h.runCounts.failed ?? 0) > 0 && <span className="badge stop" style={{ marginLeft: 6 }}>{h.runCounts.failed} failed</span>}
                                </>
                              )}
                            </td>
                            <td>{lastRun ? new Date(lastRun.startedAt).toLocaleDateString("en-GB") : <span className="notstated">None</span>}</td>
                          </tr>
                          {isOpen && (
                            <tr className="agenttable-detail">
                              <td colSpan={8}>
                                <AgentDetail entry={entry} status={status} agent={entry.internalName ? byName.get(entry.internalName) : undefined}
                                             health={h} customerHealth={customerHealth} settings={settings} isAdmin={isAdmin}
                                             enabled={enabledFor(entry.key)} onToggle={(v) => toggle(entry.key, v)} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </>
  );
}

function AgentDetail({ entry, status, agent, health, customerHealth, settings, isAdmin, enabled, onToggle }: {
  entry: RosterEntry; status: AgentStatus; agent?: AgentDefinition; health?: AgentHealth; customerHealth?: RoleHealth;
  settings: AgentSettings | null; isAdmin: boolean; enabled?: boolean; onToggle: (enabled: boolean) => void;
}) {
  const [skills, setSkills] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[] | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
  const pack = customerHealth?.pack;
  useEffect(() => {
    let active = true; setSkills([]);
    if (pack) aiApi.revision(pack.packId, pack.revision).then((p) => { if (active) setSkills(p.content.skills.map((s) => s.name)); })
      .catch(() => { if (active) setSkills(["Skills could not be loaded"]); });
    return () => { active = false; };
  }, [pack?.packId, pack?.revision]);
  useEffect(() => {
    if (entry.key !== "functional-agent") return;
    api.listCapabilities().then((c) => setCapabilities([...c.capabilities].sort((a, b) => a.priority - b.priority)))
      .catch((e) => setCapabilitiesError(saveErrorMessage(e, "The capability catalogue could not be loaded.")));
  }, [entry.key]);

  return (
    <div className="agentdetail">
      <div className="grid halves">
        <div>
          {settings && (
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" aria-label={`${entry.displayName} enabled for this customer`} disabled={!isAdmin}
                checked={enabled !== false} onChange={(e) => onToggle(e.target.checked)} />
              Runs for this customer{!isAdmin && <span className="hint"> (only an Admin can change this)</span>}
              {settings.updatedAt && <span className="hint"> · last changed by {settings.updatedBy}, {new Date(settings.updatedAt).toLocaleString("en-GB")}</span>}
            </label>
          )}
          <div className="callout" style={{ margin: "12px 0" }}>
            <strong><span className={`badge ${STATUS_BADGE[status]}`}>{status === "Active" ? "Available" : status}</span></strong>
            {STATUS_NOTE[status]}
          </div>
          {customerHealth?.blockedReason && <div className="callout" role="alert">{customerHealth.blockedReason}</div>}
          {entry.note && <p className="hint">{entry.note}</p>}

          <ReviewDetail title="Assigned skills & last run">
            <p>{skills.length ? skills.join(" · ") : "No skills recorded in the assigned pack."}</p>
            {customerHealth?.lastRun && <p>Last execution: {new Date(customerHealth.lastRun.started_at).toLocaleString("en-GB")} · {customerHealth.lastRun.status}</p>}
            {customerHealth?.lastRun?.error && <p role="alert">{customerHealth.lastRun.error}</p>}
          </ReviewDetail>
          <ReviewDetail title="Agent definition & runtime">
            {agent ? (
              <>
                <dl className="facts">
                  <dt>Internal name</dt><dd className="mono">{agent.name}</dd>
                  <dt>Version</dt><dd className="mono">{agent.version}</dd>
                  <dt>File updated</dt><dd>{new Date(agent.fileUpdatedAt).toLocaleString("en-GB")}</dd>
                  <dt>Declared tools</dt>
                  <dd>{agent.declaredTools.length ? agent.declaredTools.join(", ") : <span className="notstated">none — purely structural</span>}</dd>
                </dl>
                {agent.runtime ? (
                  <>
                    <h2 style={{ marginTop: 20 }}>Runtime configuration <span className="qualifier">— {agent.runtime.driver}</span></h2>
                    <dl className="facts">
                      <dt>Model</dt>
                      <dd>{agent.runtime.model ?? <span className="notstated">not set — falls to the SDK's own default</span>}</dd>
                      <dt>Permission mode</dt><dd className="mono">{agent.runtime.permissionMode}</dd>
                      <dt>Max turns</dt><dd>{agent.runtime.maxTurns}</dd>
                      <dt>Allowed tools (driver session)</dt><dd>{agent.runtime.allowedTools.join(", ")}</dd>
                    </dl>
                  </>
                ) : (
                  <div className="callout" style={{ marginTop: 16 }}>
                    <strong>No driver wiring today</strong>
                    No api_service driver invokes this agent yet — it is still run directly via Claude Code, not orchestrated from this service.
                  </div>
                )}
              </>
            ) : (
              <div className="callout">
                <strong>Not yet built</strong>
                There is no .claude/agents definition for this role today. The row shows the intended shape of Jade's delivery team,
                not just whichever agents happen to be implemented so far.
              </div>
            )}
          </ReviewDetail>
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>Activity &amp; quality <span className="qualifier">— last 20 runs</span></h3>
          {!entry.internalName ? (
            <div className="empty" style={{ padding: 16 }}>Nothing to show — this role has no runs yet.</div>
          ) : !health ? (
            <Loading what="agent activity" />
          ) : (
            <>
              {health.recentRuns.length > 0 && (
                <table className="data">
                  <thead><tr><th>Story</th><th>Stage</th><th>Started</th><th>Error</th></tr></thead>
                  <tbody>
                    {health.recentRuns.map((r) => (
                      <tr key={r.runId}>
                        <td className="mono">{r.storyId}</td>
                        <td><span className={`badge ${STAGE_TONE[r.stage] ?? "grey"}`}>{r.stage}</span></td>
                        <td>{new Date(r.startedAt).toLocaleString("en-GB")}</td>
                        <td>{r.error ?? <NotStated />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {health.feedback.length > 0 && (
                <>
                  <h3 style={{ marginTop: 20 }}>Feedback <span className="qualifier">— this customer only</span></h3>
                  {health.feedback.map((f) => (
                    <div key={f.kind} className="callout" style={{ marginBottom: 10 }}>
                      <strong>{f.kind.replace(/_/g, " ")} — {f.count}</strong>
                      {Object.keys(f.reasons).length > 0
                        ? Object.entries(f.reasons).map(([reason, n]) => `${reason.replace(/_/g, " ")}: ${n}`).join(", ")
                        : "No structured reason recorded"}
                    </div>
                  ))}
                </>
              )}
              {health.recentRuns.length === 0 && health.feedback.length === 0 && (
                <div className="empty" style={{ padding: 16 }}>No recorded activity yet for this agent.</div>
              )}
            </>
          )}
        </div>
      </div>

      {entry.key === "functional-agent" && (
        <div style={{ marginTop: 16 }}>
          <h3>Capability catalogue <span className="qualifier">— prioritised validation backlog</span></h3>
          <p className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
            The Functional Agent's broad remit (any standard JDE setup application) is not the same as what it may actually
            execute — that's capability-specific, and every capability here starts at Needs spike until a designated functional
            owner and technical validator promote it.
          </p>
          {!capabilities ? (
            capabilitiesError ? <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{capabilitiesError}</div> : <Loading what="the capability catalogue" />
          ) : (
            <table className="data">
              <thead><tr><th>#</th><th>Capability</th><th>Status</th><th>Technical validation</th><th>Policy restriction</th></tr></thead>
              <tbody>
                {capabilities.map((c) => (
                  <tr key={c.capabilityId}>
                    <td className="mono">{c.priority}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{capabilityName(c)}</div>
                      <div className="mono sub">{c.capabilityId} · rev {c.revision}</div>
                    </td>
                    <td><CapabilityStatusBadge status={c.validation.status} /></td>
                    <td style={{ fontSize: 13 }}>{c.validation.technicalValidation || <NotStated />}</td>
                    <td style={{ fontSize: 13 }}>{c.validation.policyRestriction || <NotStated />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
