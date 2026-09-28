import { ReviewDetail } from "../../components/visualReview";
import { aiApi, type RoleHealth } from "../../services/aiApi";
import { agentSettingsApi, type AgentSettings } from "../../services/agentSettingsApi";
import { saveErrorMessage } from "../../services/saveErrors";
import { useEffect, useState } from "react";
import type { SVGProps } from "react";
import { api } from "../../services/api";
import type { AgentDefinition, AgentHealth, AgentInventoryEntry, Capability } from "../../types/domain";
import { CapabilityStatusBadge, Loading, NotStated } from "../../components/ui";
import {
  ArchitectIcon,
  DevelopmentIcon,
  FunctionalIcon,
  ImproveIcon,
  ReceiveIcon,
  RequirementsIcon,
} from "../../components/agentIcons";

const STAGE_TONE: Record<string, string> = { started: "info", done: "ok", failed: "stop" };

type AgentGroup = "Requirements" | "Solution" | "Delivery";
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
    group: (["Requirements", "Solution", "Delivery"].includes(e.group) ? e.group : "Delivery") as AgentGroup,
    icon: ICONS[e.key] ?? RequirementsIcon, internalName: e.definition ?? null, runsInJade: e.runsInJade, note: e.note,
  }));
}

const GROUPS: AgentGroup[] = ["Requirements", "Solution", "Delivery"];
const GROUP_TONE: Record<AgentGroup, string> = { Requirements: "info", Solution: "ai", Delivery: "ok" };

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

export function Agents() {
  const [roleHealth, setRoleHealth] = useState<RoleHealth[]>([]);
  const [healthError, setHealthError] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [agents, setAgents] = useState<AgentDefinition[] | null>(null);
  const [healthByAgent, setHealthByAgent] = useState<Record<string, AgentHealth>>({});
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [selected, setSelected] = useState<string>("receive-agent");
  const [capabilities, setCapabilities] = useState<Capability[] | null>(null);

  useEffect(() => {
    aiApi.health().then((h) => setRoleHealth(h.roles)).catch(() => setHealthError("Customer AI health could not be loaded."));
    api.listAgentInventory().then((inv) => setRoster(toRoster(inv))).catch(() => setRoster([]));
    api.listAgents().then(async (list) => {
      setAgents(list);
      // Every card needs its own real health snapshot, not just the
      // selected agent's — this is the "team dashboard" the roster
      // itself has to show, not a byproduct of clicking through.
      const pairs = await Promise.all(list.map(async (a) => [a.name, await api.getAgentHealth(a.name)] as const));
      setHealthByAgent(Object.fromEntries(pairs));
    });
    api.listCapabilities().then((c) => setCapabilities([...c.capabilities].sort((a, b) => a.priority - b.priority)));
    agentSettingsApi.get().then(setSettings).catch((e) => setSettingsError(saveErrorMessage(e, "Could not load the agent settings.")));
    api.getSession().then((s) => setIsAdmin(!!s.customers.find((c) => c.id === s.activeCustomerId)?.roles?.includes("admin")));
  }, []);

  async function toggle(name: string, enabled: boolean) {
    if (!settings) return;
    const disabled = settings.agents.filter((a) => (a.name === name ? !enabled : !a.enabled)).map((a) => a.name);
    setSettingsError(null);
    try { setSettings(await agentSettingsApi.save(disabled, settings.revision)); }
    catch (e) { setSettingsError(saveErrorMessage(e, "Could not save the agent settings.")); }
  }
  const enabledFor = (key: string | null) => settings?.agents.find((a) => a.name === key)?.enabled;

  const selectedHealth = roleHealth.find((h) => h.role === selected);
  useEffect(() => {
    let active = true; setSkills([]);
    if (selectedHealth?.pack) aiApi.revision(selectedHealth.pack.packId,selectedHealth.pack.revision).then((p) => { if (active) setSkills(p.content.skills.map((s) => s.name)); }).catch(() => { if(active) setSkills(["Skills could not be loaded"]); });
    return () => { active = false; };
  }, [selectedHealth?.pack?.packId, selectedHealth?.pack?.revision]);
  const byName = new Map((agents ?? []).map((a) => [a.name, a]));
  const openEntry = roster.find((r) => r.key === selected) ?? roster[0];
  if (!openEntry) return <Loading what="the agent team" />;
  const openAgent = openEntry.internalName ? byName.get(openEntry.internalName) : undefined;
  const openHealth = openEntry.internalName ? healthByAgent[openEntry.internalName] : undefined;
  const openStatus = statusFor(openEntry, byName);

  return (
    <>
      <div className="pagehead">
        <div>
          <h2 style={{ margin: 0 }}>Your JADE agents</h2>
          <div className="sub">
            {roster.length} agents · configuration, current health and recent activity.
          </div>
        </div>
      </div>

      {healthError && <div className="callout" role="alert">{healthError}</div>}
      {!agents ? (
        <Loading what="the agent team" />
      ) : (
        <div className="stack">
          <div className="agentteam">
            {GROUPS.map((group) => (
              <div key={group}>
                <div className="agentgroup-label">{group}</div>
                <div className="agentgrid">
                  {roster.filter((r) => r.group === group).map((entry) => {
                    const customerHealth = roleHealth.find((h) => h.role === entry.key);
                    const h = entry.internalName ? healthByAgent[entry.internalName] : undefined;
                    const status = statusFor(entry, byName);
                    const totalRuns = h ? Object.values(h.runCounts).reduce((n, c) => n + c, 0) : undefined;
                    const lastRun = h?.recentRuns[0];
                    const feedbackTotal = h?.feedback.reduce((n, f) => n + f.count, 0) ?? 0;
                    const Icon = entry.icon;
                    const tone = GROUP_TONE[entry.group];
                    return (
                      <button
                        key={entry.key}
                        className={`agentcard${entry.key === selected ? " selected" : ""}${status === "Planned" ? " planned" : ""}`}
                        onClick={() => setSelected(entry.key)}
                      >
                        <div className="agentcard-head">
                          <span className="agenticon" style={{ background: `var(--${tone}-bg)`, color: `var(--${tone})` }}>
                            <Icon />
                          </span>
                          <div>
                            <div className="agentcard-name">{entry.displayName}</div>
                            <span className={`badge ${STATUS_BADGE[status]}`}>{status === "Active" ? "Available" : status}</span>{" "}
                            {enabledFor(entry.key) === false && <span className="badge stop">Off for this customer</span>}
                          </div>
                        </div>
                        <div className="agentcard-role">{entry.purpose}</div>
                        <div className="vr-agent-health">
                          <span><strong>{customerHealth?.state ?? (status === "Planned" ? "Not available" : "Health not reported")}</strong></span>
                          <span>Model: {customerHealth?.configuredModel ?? "No AI model assigned"}</span>
                          <span>Instructions: {customerHealth?.pack?.packName ?? "No pack assigned"}</span>
                          {customerHealth?.lastRun?.status === "failed" && <span className="badge stop">Last run failed</span>}
                          {customerHealth?.blockedReason && <span>{customerHealth.blockedReason}</span>}
                        </div>
                        <div className="agentcard-stats">
                          {status === "Planned" ? (
                            <span className="notstated">Not enabled</span>
                          ) : h === undefined ? (
                            <span className="notstated">No run history reported</span>
                          ) : totalRuns === 0 ? (
                            <span className="notstated">No recorded runs yet</span>
                          ) : (
                            Object.entries(h.runCounts).map(([stage, count]) => (
                              <span key={stage} className={`badge ${STAGE_TONE[stage] ?? "grey"}`}>{stage}: {count}</span>
                            ))
                          )}
                        </div>
                        <div className="agentcard-meta">
                          {status === "Planned"
                            ? "No activity — not built yet"
                            : lastRun
                              ? `Last activity ${new Date(lastRun.startedAt).toLocaleDateString("en-GB")}`
                              : "No activity yet"}
                          {feedbackTotal > 0 && ` · ${feedbackTotal} feedback record${feedbackTotal === 1 ? "" : "s"}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="grid halves">
            <section className="panel">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className="agenticon"
                  style={{ background: `var(--${GROUP_TONE[openEntry.group]}-bg)`, color: `var(--${GROUP_TONE[openEntry.group]})` }}
                >
                  <openEntry.icon />
                </span>
                <h2 style={{ margin: 0 }}>{openEntry.displayName}</h2>
              </div>
              <p style={{ marginTop: 10 }}>{openEntry.purpose}</p>
              {settings && (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                  <input type="checkbox" aria-label={`${openEntry.displayName} enabled for this customer`} disabled={!isAdmin}
                    checked={enabledFor(openEntry.key) !== false}
                    onChange={(e) => toggle(openEntry.key, e.target.checked)} />
                  Runs for this customer{!isAdmin && <span className="hint"> (only an Admin can change this)</span>}
                  {settings.updatedAt && <span className="hint"> · last changed by {settings.updatedBy}, {new Date(settings.updatedAt).toLocaleString("en-GB")}</span>}
                </label>
              )}
              {settingsError && <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{settingsError}</div>}
              <div className="callout" style={{ marginBottom: 16 }}>
                <strong><span className={`badge ${STATUS_BADGE[openStatus]}`}>{openStatus === "Active" ? "Available" : openStatus}</span></strong>
                {STATUS_NOTE[openStatus]}
              </div>

              <ReviewDetail title="Assigned skills & recent run details">
                <p>{skills.length ? skills.join(" · ") : "No skills recorded in the assigned pack."}</p>
                {selectedHealth?.lastRun && <p>Last execution: {new Date(selectedHealth.lastRun.started_at).toLocaleString("en-GB")} · {selectedHealth.lastRun.status}</p>}
                {selectedHealth?.lastRun?.error && <p role="alert">{selectedHealth.lastRun.error}</p>}
              </ReviewDetail>
              <ReviewDetail title="Agent definition & runtime">
              {openAgent ? (
                <>
                  <dl className="facts">
                    <dt>Internal name</dt><dd className="mono">{openAgent.name}</dd>
                    <dt>Version</dt><dd className="mono">{openAgent.version}</dd>
                    <dt>File updated</dt><dd>{new Date(openAgent.fileUpdatedAt).toLocaleString("en-GB")}</dd>
                    <dt>Declared tools</dt>
                    <dd>{openAgent.declaredTools.length ? openAgent.declaredTools.join(", ") : <span className="notstated">none — purely structural</span>}</dd>
                  </dl>

                  {openAgent.runtime ? (
                    <>
                      <h2 style={{ marginTop: 20 }}>Runtime configuration <span className="qualifier">— {openAgent.runtime.driver}</span></h2>
                      <dl className="facts">
                        <dt>Model</dt>
                        <dd>{openAgent.runtime.model ?? <span className="notstated">not set — falls to the SDK's own default</span>}</dd>
                        <dt>Permission mode</dt><dd className="mono">{openAgent.runtime.permissionMode}</dd>
                        <dt>Max turns</dt><dd>{openAgent.runtime.maxTurns}</dd>
                        <dt>Allowed tools (driver session)</dt><dd>{openAgent.runtime.allowedTools.join(", ")}</dd>
                      </dl>
                    </>
                  ) : (
                    <div className="callout" style={{ marginTop: 16 }}>
                      <strong>No driver wiring today</strong>
                      No api_service driver invokes this agent yet — it is still run directly via Claude
                      Code, not orchestrated from this service.
                    </div>
                  )}
                </>
              ) : (
                <div className="callout">
                  <strong>Not yet built</strong>
                  There is no .claude/agents definition for this role today. This card exists so the team
                  page shows the real, intended shape of Jade's delivery team, not just whichever agents
                  happen to be implemented so far.
                </div>
              )}
              </ReviewDetail>
            </section>

            <section className="panel">
              <h2>Activity &amp; quality <span className="qualifier">— last 20 runs, across all customers</span></h2>
              {!openEntry.internalName ? (
                <div className="empty" style={{ padding: 16 }}>Nothing to show — this role has no runs yet.</div>
              ) : !openHealth ? (
                <Loading what="agent activity" />
              ) : (
                <>
                  {openHealth.recentRuns.length > 0 && (
                    <table className="data">
                      <thead><tr><th>Story</th><th>Stage</th><th>Started</th><th>Error</th></tr></thead>
                      <tbody>
                        {openHealth.recentRuns.map((r) => (
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
                  {openHealth.feedback.length > 0 && (
                    <>
                      <h2 style={{ marginTop: 20 }}>Feedback <span className="qualifier">— this customer only</span></h2>
                      {openHealth.feedback.map((f) => (
                        <div key={f.kind} className="callout" style={{ marginBottom: 10 }}>
                          <strong>{f.kind.replace(/_/g, " ")} — {f.count}</strong>
                          {Object.keys(f.reasons).length > 0
                            ? Object.entries(f.reasons).map(([reason, n]) => `${reason.replace(/_/g, " ")}: ${n}`).join(", ")
                            : "No structured reason recorded"}
                        </div>
                      ))}
                    </>
                  )}
                  {openHealth.recentRuns.length === 0 && openHealth.feedback.length === 0 && (
                    <div className="empty" style={{ padding: 16 }}>No recorded activity yet for this agent.</div>
                  )}
                </>
              )}
            </section>
          </div>

          {openEntry.key === "functional" && (
            <section className="panel">
              <h2>Capability catalogue <span className="qualifier">— prioritised validation backlog</span></h2>
              <p className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
                The Functional Agent's broad remit (any standard JDE setup application) is not the same as
                what it may actually execute — that's capability-specific, and every capability here starts
                at Needs spike until a designated functional owner and technical validator promote it.
                Additional approval on a single change never does that on its own.
              </p>
              {!capabilities ? (
                <Loading what="the capability catalogue" />
              ) : (
                <table className="data">
                  <thead>
                    <tr><th>#</th><th>Capability</th><th>Status</th><th>Technical validation</th><th>Policy restriction</th></tr>
                  </thead>
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
            </section>
          )}
        </div>
      )}
    </>
  );
}
