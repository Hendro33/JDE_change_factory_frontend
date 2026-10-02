import { INSIGHT_PERIODS, inInsightPeriod } from "../../services/insightPeriod";
import { useEffect, useMemo, useState } from "react";
import { DemandNav } from "../demand/DemandNav";
import { api } from "../../services/api";
import type { Change, Health, JiraConnectionStatus, JiraSyncResult, Phase } from "../../types/domain";
import { CHANGE_TYPES, PHASES, PRIORITIES } from "../../types/domain";
import {
  EmptyState, ErrorState, HealthIndicator, ImpactIndicator, Loading, NextActionLine, PageHeader, PhaseLabel,
  formatDate, sourceLabel, storyTitle, useAsync, useSessionInfo,
} from "../../components/design";
import { Link, navigate, setQueryParam, storyPath, useLocation } from "../../router";

const HEALTH_FILTERS: { key: Health | "attention" | "stuck"; label: string }[] = [
  { key: "attention", label: "Needs a person" },
  { key: "waiting_decision", label: "Waiting for a decision" },
  { key: "stuck", label: "Blocked or failed" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "failed", label: "Needs attention" },
];

/**
 * Stories: the one list of business stories, replacing the separate
 * queues per stage. Search, filter by what matters, or switch to a board
 * grouped by lifecycle phase. Filters live in the URL, so a filtered
 * view can be bookmarked or shared.
 */
export function StoriesPage() {
  const info = useSessionInfo();
  const { query } = useLocation();
  const { data, error, reload } = useAsync(() => api.listChanges(), []);
  const [jira, setJira] = useState<JiraConnectionStatus | null>(null);
  const [retrieving, setRetrieving] = useState(false);
  const [retrieved, setRetrieved] = useState<JiraSyncResult | null>(null);
  const [retrieveError, setRetrieveError] = useState<unknown>(null);
  useEffect(() => { api.getJiraIntegrationStatus().then(setJira).catch(() => setJira(null)); }, []);
  const canEdit = info.roles.some((r) => r !== "dashboard_viewer");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<unknown>(null);

  const q = query.get("q") ?? "";
  const phase = query.get("phase") ?? "";
  const domain = query.get("domain") ?? "";
  const health = query.get("health") ?? "";
  const owner = query.get("owner") ?? "";
  const priority = query.get("priority") ?? "";
  const changeType = query.get("type") ?? "";
  const view = query.get("view") === "board" ? "board" : "list";
  const period = INSIGHT_PERIODS.find((p) => p.key === query.get("period"));
  const showDone = query.get("done") === "1";

  const rows = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((c) => {
      if (period && !inInsightPeriod(c.createdAt, period.key)) return false;
      const lc = c.lifecycle;
      if (!showDone && !phase && lc?.phase === "done") return false;
      if (needle && !`${c.id} ${c.title} ${c.userStory?.statement ?? ""} ${info.domainName(c.businessDomainId) ?? ""}`.toLowerCase().includes(needle)) return false;
      if (phase && lc?.phase !== phase) return false;
      if (domain && (domain === "none" ? c.businessDomainId : c.businessDomainId !== domain)) return false;
      if (priority && c.priority !== priority) return false;
      if (changeType && c.changeType !== changeType) return false;
      if (owner && lc?.nextAction.owner !== owner) return false;
      if (health === "attention" && !(lc && lc.nextAction.owner !== "jade" && lc.nextAction.kind !== "none")) return false;
      if (health === "stuck" && lc?.health !== "blocked" && lc?.health !== "failed") return false;
      if (health && health !== "attention" && health !== "stuck" && lc?.health !== health) return false;
      return true;
    });
  }, [data, q, phase, domain, health, owner, priority, changeType, showDone, info, period]);

  const doneCount = (data ?? []).filter((c) => c.lifecycle?.phase === "done").length;
  const filtered = !!(q || phase || domain || health || owner || priority || changeType);

  const selectable = canEdit && phase === "understand" && view === "list";
  const withdrawable = (c: Change) => c.lifecycle?.phase === "understand" && !c.userStory
    && !["receiving", "improving", "checking"].includes(c.processingStage ?? "");
  const toggle = (id: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const visibleSelected = rows.filter((c) => selected.has(c.id)).map((c) => c.id);

  async function withdraw() {
    setWithdrawing(true); setWithdrawError(null);
    try {
      const r = await api.withdrawRequests(visibleSelected, withdrawReason.trim());
      setWithdrawResult(`${r.withdrawn.length} request${r.withdrawn.length === 1 ? "" : "s"} withdrawn.`
        + (r.refused.length ? ` Not withdrawn: ${r.refused.map((x) => `${x.id} (${x.reason})`).join(", ")}.` : ""));
      setSelected(new Set()); setWithdrawOpen(false); setWithdrawReason(""); reload();
    } catch (e) { setWithdrawError(e); } finally { setWithdrawing(false); }
  }

  async function retrieve() {
    setRetrieving(true); setRetrieveError(null);
    try { setRetrieved(await api.syncJiraIntegration()); reload(); } catch (e) { setRetrieveError(e); } finally { setRetrieving(false); }
  }

  return (
    <div>
      <DemandNav />
      <PageHeader title={phase === "understand" ? "Requests" : "User Stories"}
        subtitle={phase === "understand" ? "New requests, before JADE has turned them into user stories." : "Every business need JADE is working on, from request to delivered outcome."}
        actions={<>
          {jira && jira.state !== "unavailable" && (
            <button className="btn" disabled={retrieving} onClick={retrieve}>{retrieving ? "Retrieving…" : "Retrieve from Jira"}</button>
          )}
          <Link className="btn primary" to="/stories/new">New request</Link>
        </>} />

      {period && <p className="muted">Insights cohort: {period.label} · stories created in this period, shown at their current status.</p>}
      {retrieveError !== null && <ErrorState error={retrieveError} title="Could not retrieve new requests" />}
      {retrieved && (
        <div className="noticebar ok">{retrieved.imported.length} new request{retrieved.imported.length === 1 ? "" : "s"} imported
          ({retrieved.considered} found in Jira).{retrieved.errors.length > 0 && ` ${retrieved.errors.length} had a problem — see Administration › Systems & Connections › Jira.`}</div>
      )}
      {withdrawResult && <div className="noticebar ok">{withdrawResult}</div>}
      {withdrawError !== null && <ErrorState error={withdrawError} title="Could not withdraw the requests" />}
      {selectable && visibleSelected.length > 0 && (
        <div className="selectionbar" role="region" aria-label="Selected requests">
          <strong>{visibleSelected.length} selected</strong>
          {!withdrawOpen ? (
            <>
              <button className="btn" onClick={() => setWithdrawOpen(true)}>Withdraw…</button>
              <button className="linkbutton" onClick={() => setSelected(new Set())}>Clear selection</button>
            </>
          ) : (
            <>
              <input type="text" aria-label="Reason for withdrawing" placeholder="Reason, e.g. test import, duplicate, not a change"
                     value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
              <button className="btn primary" disabled={withdrawing || !withdrawReason.trim()} onClick={withdraw}>
                {withdrawing ? "Withdrawing…" : `Withdraw ${visibleSelected.length}`}
              </button>
              <button className="linkbutton" onClick={() => setWithdrawOpen(false)}>Cancel</button>
            </>
          )}
          <span className="hint" style={{ flexBasis: "100%" }}>
            Withdrawn requests leave this list and are kept on record with your name and reason. A Jira ticket stays as it
            is in Jira and is not imported again.
          </span>
        </div>
      )}

      <div className="toolbar" role="search">
        <input type="search" className="searchbox" aria-label="Search stories" placeholder="Search by title, story or ID"
               value={q} onChange={(e) => setQueryParam("q", e.target.value)} />
        <select aria-label="Phase" value={phase} onChange={(e) => setQueryParam("phase", e.target.value)}>
          <option value="">All phases</option>
          {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select aria-label="Business domain" value={domain} onChange={(e) => setQueryParam("domain", e.target.value)}>
          <option value="">All domains</option>
          {info.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="none">Not placed yet</option>
        </select>
        <select aria-label="Health" value={health} onChange={(e) => setQueryParam("health", e.target.value)}>
          <option value="">Any health</option>
          {HEALTH_FILTERS.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
        </select>
        <select aria-label="Next action owner" value={owner} onChange={(e) => setQueryParam("owner", e.target.value)}>
          <option value="">Anyone</option>
          <option value="domain_owner">Domain Owner</option>
          <option value="product_manager">Application Manager</option>
          <option value="cnc_operator">CNC</option>
          <option value="admin">Administrator</option>
          <option value="jade">JADE</option>
        </select>
        <select aria-label="Priority" value={priority} onChange={(e) => setQueryParam("priority", e.target.value)}>
          <option value="">Any priority</option>
          {[...PRIORITIES].reverse().map((p) => <option key={p}>{p}</option>)}
        </select>
        <select aria-label="Change type" value={changeType} onChange={(e) => setQueryParam("type", e.target.value)}>
          <option value="">Any type</option>
          {CHANGE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {filtered && <button className="linkbutton" onClick={() => navigate(`/stories${view === "board" ? "?view=board" : ""}`, { replace: true })}>Clear filters</button>}
        <div className="viewswitch" role="group" aria-label="View">
          <button className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setQueryParam("view", null)}>List</button>
          <button className={view === "board" ? "on" : ""} aria-pressed={view === "board"} onClick={() => setQueryParam("view", "board")}>Board</button>
        </div>
      </div>

      {error ? <ErrorState error={error} title="Stories could not be loaded" /> : !data ? <Loading what="stories" /> : rows.length === 0 ? (
        <EmptyState title={filtered ? "No stories match these filters" : "No stories yet"}
          action={filtered ? <button className="btn" onClick={() => navigate("/stories", { replace: true })}>Clear filters</button> : <Link className="btn primary" to="/stories/new">New request</Link>}>
          {filtered ? "Try fewer filters." : "Stories appear here as requests come in from Jira or are entered by a person."}
        </EmptyState>
      ) : view === "board" ? <Board rows={rows} /> : (
        <StoryTable rows={rows} select={selectable ? { selected, toggle, can: withdrawable,
          setAll: (on) => setSelected(on ? new Set(rows.filter(withdrawable).map((c) => c.id)) : new Set()) } : undefined} />
      )}

      {doneCount > 0 && !phase && (
        <p className="muted" style={{ marginTop: 12 }}>
          {showDone ? <button className="linkbutton" onClick={() => setQueryParam("done", null)}>Hide {doneCount} done</button>
            : <button className="linkbutton" onClick={() => setQueryParam("done", "1")}>Show {doneCount} done</button>}
        </p>
      )}
    </div>
  );
}

interface RowSelection {
  selected: Set<string>;
  toggle: (id: string) => void;
  can: (c: Change) => boolean;
  setAll: (on: boolean) => void;
}

export function StoryTable({ rows, compact, select }: { rows: Change[]; compact?: boolean; select?: RowSelection }) {
  const info = useSessionInfo();
  const eligible = select ? rows.filter(select.can) : [];
  const allOn = !!select && eligible.length > 0 && eligible.every((c) => select.selected.has(c.id));
  return (
    <div className="tablewrap">
      <table className="data stories">
        <thead>
          <tr>{select && (
            <th style={{ width: 36 }}>
              <input type="checkbox" aria-label="Select all requests that can be withdrawn" checked={allOn}
                     disabled={!eligible.length} onChange={(e) => select.setAll(e.target.checked)} />
            </th>
          )}<th>Story</th>{!compact && <th>Business domain</th>}<th>Priority</th><th>Phase</th><th>Health</th><th>Next action</th></tr>
        </thead>
        <tbody>{rows.map((c) => (
          <tr key={c.id} className="clickable" onClick={(e) => { if ((e.target as HTMLElement).closest("a, input")) return; navigate(storyPath(c.id)); }}>
            {select && (
              <td>
                <input type="checkbox" aria-label={`Select ${c.id}`} checked={select.selected.has(c.id)}
                       disabled={!select.can(c)} title={select.can(c) ? undefined : "Only requests JADE is not working on can be withdrawn"}
                       onChange={() => select.toggle(c.id)} />
              </td>
            )}
            <td className="storycell">
              <Link to={storyPath(c.id)} className="storylink">{storyTitle(c)}</Link>
              <div className="muted small"><span className="mono">{c.id}</span> · {sourceLabel(c)} · {formatDate(c.updatedAt)}</div>
            </td>
            {!compact && <td>{info.domainName(c.businessDomainId) ?? <span className="muted">—</span>}</td>}
            <td><ImpactIndicator change={c} /></td>
            <td><PhaseLabel lifecycle={c.lifecycle} /></td>
            <td><HealthIndicator lifecycle={c.lifecycle} /></td>
            <td className="nextcell"><NextActionLine lifecycle={c.lifecycle} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Board({ rows }: { rows: Change[] }) {
  const info = useSessionInfo();
  const byPhase = new Map<Phase, Change[]>();
  rows.forEach((c) => { const p = c.lifecycle?.phase ?? "understand"; byPhase.set(p, [...(byPhase.get(p) ?? []), c]); });
  return (
    <div className="board" role="list">
      {PHASES.map((p) => (
        <section key={p.key} className="board-col" role="listitem" aria-label={p.label}>
          <h3>{p.label} <span className="muted">{byPhase.get(p.key)?.length ?? 0}</span></h3>
          {(byPhase.get(p.key) ?? []).map((c) => (
            <Link key={c.id} to={storyPath(c.id)} className={`board-card h-${c.lifecycle?.health}`}>
              <span className="board-title">{storyTitle(c)}</span>
              <span className="muted small">{info.domainName(c.businessDomainId) ?? c.id}</span>
              <HealthIndicator lifecycle={c.lifecycle} />
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
