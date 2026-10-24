import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { Change } from "../../types/domain";
import { EmptyState, JadeWorking, PageHeader } from "../../components/design";
import { IconTile, iconFor } from "../../components/icons";
import { oneLine } from "../../components/home";
import { ChangeGrid, FilterBar, useChangeListControls, type GridColumn } from "../../components/WorkQueue";
import { Loading, PriorityBadge } from "../../components/ui";
import type { Navigate, NavTarget } from "../../types/nav";
import { navigate, setQueryParam, useLocation } from "../../router";
import { rememberReturn } from "../../services/workLink";
import { inAmStage } from "./workflow";
import { changePath } from "../stories/useStory";

/**
 * Architecture Review -- the Application Manager's design decisions. The list
 * is the queue: what waits for your authorisation first, then what waits for
 * someone else, then JADE's work in progress. Selecting a change opens its one
 * authoritative solution view (the same as the change record's Solution tab):
 * the decision, JADE's conclusion, the open points with owners, the process,
 * and "Why this solution" on demand.
 */
export function ArchitectureReview({ navFilter, navToken }: Partial<NavTarget> & { onNavigate?: Navigate } = {}) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const { query } = useLocation();
  // The list is the queue "waiting for my authorisation" (register K8); the rest is one chip away.
  const view = (query.get("view") as "mine" | "all" | "earlier" | null) ?? "mine";

  // Repair brief P2: one meaning per word, used by the chips, the counts and the status column alike.
  // "Waiting on me": the change's next action is the Application Manager's. "Ready to authorise": that
  // action is an approval, and the readiness rule allows it now (lifecycle.allowedActions).
  const APPROVALS = ["approve_exact_change", "approve_design", "authorise_handoff", "confirm_no_change"];
  const onMe = (c: Change) => c.lifecycle?.nextAction.owner === "product_manager";
  const ready = (c: Change) => onMe(c) && APPROVALS.includes(c.lifecycle?.nextAction.action ?? "")
    && (c.lifecycle?.allowedActions ?? []).includes(c.lifecycle!.nextAction.action!);
  const working = (c: Change) => c.lifecycle?.nextAction.owner === "jade";
  const waitingOn = (c: Change) => {
    const na = c.lifecycle?.nextAction;
    return na && !onMe(c) && na.owner !== "jade" && na.owner !== "none" ? (na.ownerLabel || "someone") : "";
  };

  const load = () => api.listChanges().then((all) => {
    const queue = all.filter((c) => inAmStage(c, "architecture") || c.architectDecision || c.exactChange);
    setChanges(queue);
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [navToken]);
  const anyWorking = (changes ?? []).some(working);
  useEffect(() => {
    if (!anyWorking) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyWorking]);

  const columns: GridColumn[] = [
    { key: "title", header: "Change", render: (c) => <><div>{c.title}</div><div className="mono muted">{c.id}</div></>, sortValue: (c) => c.title },
    { key: "status", header: "Status", render: (c) =>
      working(c) ? <JadeWorking>JADE at work</JadeWorking>
        : c.lifecycle?.authorisation?.renewable ? <span className="tag stop">■ {c.lifecycle.authorisation.label}</span>
        : c.changeApproval?.status === "approved" || c.lifecycle?.handoffAuthorised ? <span className="tag ok">✓ {c.lifecycle?.authorisation?.label ?? "Authorised"}</span>
        : c.changeApproval?.status === "rejected" ? <span className="tag stop">✕ Rejected</span>
        : ready(c) ? <span className="tag brand">◆ Ready to authorise</span>
        : onMe(c) && c.lifecycle?.health === "blocked" ? <span className="tag stop">■ Blocked: your action</span>
        : onMe(c) ? <span className="tag">Your action</span>
        : waitingOn(c) ? <span className="tag stop">■ Waiting for {waitingOn(c)}</span>
        : <span className="tag">{c.lifecycle?.phaseLabel ?? "—"}</span> },
    { key: "route", header: "Route", render: (c) => c.architectDecision?.recommendedRoute ?? <span className="notstated">not decided</span> },
    { key: "priority", header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
  ];
  const inArch = (c: Change) => ["solutioning", "solution_review"].includes(c.lifecycle?.phase ?? "");
  const views = {
    mine: (changes ?? []).filter((c) => inArch(c) && onMe(c)),
    all: (changes ?? []).filter(inArch),
    earlier: (changes ?? []).filter((c) => !inArch(c)),
  };
  const { search, setSearch, sortKey, sortDir, onSortChange, filtered } = useChangeListControls(views[view] ?? views.mine, columns, (c) => `${c.id} ${c.title}`, navFilter?.q ?? "");
  // The filter lives in the address, so returning from a change restores it.
  useEffect(() => { if ((navFilter?.q ?? "") !== search) setQueryParam("q", search); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  // A row opens the change's solution review directly (finding 1); its breadcrumb returns here.
  const open = (id: string) => {
    rememberReturn(id, "Architecture Review", `/am/architecture-review${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    navigate(changePath(id, "solution"));
  };
  const rank = (c: Change) => (ready(c) ? 0 : onMe(c) ? 1 : waitingOn(c) ? 2 : working(c) ? 3 : 4);
  const sorted = sortKey ? filtered : [...filtered].sort((a, b) => rank(a) - rank(b));
  const readyCount = views.mine.filter(ready).length;
  const waiting = views.all.filter((c) => !!waitingOn(c)).length;

  // The same pattern as the Application Management dashboard (Hendro, 24 Oct): title with the yellow
  // bar, one figure strip, the views as tabs, each change one card with its next step in one line.
  const statusLine = (c: Change) =>
    working(c) ? "JADE is at work on it"
      : c.lifecycle?.authorisation?.renewable ? c.lifecycle.authorisation.label
      : c.changeApproval?.status === "approved" || c.lifecycle?.handoffAuthorised ? (c.lifecycle?.authorisation?.label ?? "Authorised")
      : c.changeApproval?.status === "rejected" ? "Rejected"
      : ready(c) ? "Ready to authorise"
      : onMe(c) ? oneLine(c.lifecycle?.nextAction.summary)
      : waitingOn(c) ? `Waiting for ${waitingOn(c)}`
      : c.lifecycle?.phaseLabel ?? "";
  return (
    <div className="home archreview">
      <PageHeader title="Architecture Review" subtitle="JADE's proposed solutions, and the decisions they need from you." />
      <dl className="figstrip" aria-label="Architecture Review">
        <div className="fig"><dd className="fig-value">{views.mine.length}</dd><dt className="fig-label">Waiting on you</dt></div>
        <div className="fig"><dd className="fig-value">{readyCount}</dd><dt className="fig-label">Ready to authorise</dt></div>
        <div className="fig"><dd className="fig-value">{waiting}</dd><dt className="fig-label">Waiting on someone else</dt></div>
        <div className="fig"><dd className="fig-value">{views.all.filter(working).length}</dd><dt className="fig-label">JADE at work</dt></div>
      </dl>
      <div className="areaswitch" role="tablist" aria-label="Which changes">
        {([["mine", "Waiting on me"], ["all", "All in architecture"], ["earlier", "Authorised or finished"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setQueryParam("view", k === "mine" ? "" : k)}>
            {label} <span className="qcount">{views[k].length}</span></button>
        ))}
      </div>
      {changes && changes.length > 0 && (
        <div className="listsearch"><label className="sr-only" htmlFor="ar-search">Search</label>
          <input id="ar-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID or title" /></div>
      )}
      {!changes ? <Loading what="changes under architecture review" /> : sorted.length === 0 ? (
        <EmptyState title={view === "mine" ? "Nothing waits on you" : "Nothing here yet"}>
          {view === "mine" ? "When a solution needs your decision, it appears here." : "A change arrives once Backlog Review has admitted it to architecture."}
        </EmptyState>
      ) : (
        <ul className="queue">{sorted.map((c) => (
          <li key={c.id} className="qrow">
            <IconTile name={working(c) ? "run" : ready(c) ? "decision" : iconFor(c.lifecycle?.nextAction.action, c.lifecycle?.nextAction.kind)} />
            <span className="qrow-main">
              <button className="qrow-title linkish" onClick={() => open(c.id)}>{c.title}</button>
              <span className="qrow-sub">{statusLine(c)}</span>
            </span>
            <span className="qrow-meta">
              <span className="qrow-phase">{c.architectDecision?.recommendedRoute ?? "Route not decided"}</span>
              {["high", "urgent", "critical"].includes(String(c.priority ?? "").toLowerCase()) && <span className="chip hot">{String(c.priority)}</span>}
            </span>
            <button className="btn small" onClick={() => open(c.id)}>{ready(c) ? "Review and authorise" : "Open"}</button>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
