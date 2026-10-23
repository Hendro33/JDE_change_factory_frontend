import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { Change } from "../../types/domain";
import { JadeWorking, Loading as DLoading } from "../../components/design";
import { ChangeGrid, FilterBar, useChangeListControls, type GridColumn } from "../../components/WorkQueue";
import { Loading, PriorityBadge } from "../../components/ui";
import type { Navigate, NavTarget } from "../../types/nav";
import { Link, setQueryParam } from "../../router";
import { inAmStage } from "./workflow";
import { SolutionView } from "./SolutionView";
import { changePath, useStory } from "../stories/useStory";

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
  const [openId, setOpenId] = useState<string | null>(null);

  const waitingOn = (c: Change) => {
    const lc = c.lifecycle;
    if (!lc || lc.phase !== "solution_review" || c.changeApproval?.status === "approved") return "";
    return lc.health === "blocked" ? lc.nextAction.ownerLabel || "an answer" : "";
  };
  const working = (c: Change) => c.lifecycle?.nextAction.owner === "jade";
  const yours = (c: Change) => ["approve_exact_change", "approve_design", "authorise_handoff"].includes(c.lifecycle?.nextAction.action ?? "");

  const load = () => api.listChanges().then((all) => {
    const queue = all.filter((c) => inAmStage(c, "architecture") || c.architectDecision || c.exactChange);
    setChanges(queue);
    setOpenId((cur) => (navFilter?.story && queue.some((c) => c.id === navFilter.story) ? navFilter.story
      : cur && queue.some((c) => c.id === cur) ? cur : queue.find(yours)?.id ?? queue[0]?.id ?? null));
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
      working(c) ? <JadeWorking>Architect at work</JadeWorking>
        : c.changeApproval?.status === "approved" || c.lifecycle?.handoffAuthorised ? <span className="tag ok">✓ Authorised</span>
        : c.changeApproval?.status === "rejected" ? <span className="tag stop">✕ Rejected</span>
        : waitingOn(c) ? <span className="tag stop">■ Waiting for {waitingOn(c)}</span>
        : yours(c) ? <span className="tag brand">◆ Your decision</span>
        : <span className="tag">{c.lifecycle?.phaseLabel ?? "—"}</span> },
    { key: "route", header: "Route", render: (c) => c.architectDecision?.recommendedRoute ?? <span className="notstated">not decided</span> },
    { key: "priority", header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
  ];
  const { search, setSearch, sortKey, sortDir, onSortChange, filtered } = useChangeListControls(changes ?? [], columns, (c) => `${c.id} ${c.title}`);
  const rank = (c: Change) => (yours(c) && !waitingOn(c) ? 0 : waitingOn(c) ? 1 : working(c) ? 2 : 3);
  const sorted = sortKey ? filtered : [...filtered].sort((a, b) => rank(a) - rank(b));
  const mine = (changes ?? []).filter((c) => yours(c) && !waitingOn(c)).length;
  const waiting = (changes ?? []).filter((c) => !!waitingOn(c)).length;

  return (
    <div className="vr-pilot">
      <div className="pagehead">
        <div>
          <h1 className="titlebar">Architecture Review</h1>
          <div className="sub">JADE's proposed solutions, and the decisions they need from you.</div>
        </div>
        <div className="meta">{mine} waiting for your authorisation{waiting ? ` · ${waiting} waiting for an answer` : ""}</div>
      </div>
      {changes && changes.length > 0 && <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search by ID or title" selects={[]} />}
      {!changes ? <Loading what="changes under architecture review" /> : (
        <section className="panel" style={{ marginBottom: 16 }}>
          <ChangeGrid changes={sorted} columns={columns} onRowClick={(id) => { setOpenId(id); setQueryParam("story", id); }} selectedId={openId}
            emptyMessage="Nothing here yet. A change arrives once Backlog Review has admitted it to architecture and the Architect has analysed it."
            sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange} />
        </section>
      )}
      {openId && <Selected id={openId} />}
    </div>
  );
}

function Selected({ id }: { id: string }) {
  const { change, ctx } = useStory(id);
  if (!change || !ctx) return <DLoading what="the solution" />;
  return (
    <div className="stack">
      <section className="panel vr-story-heading ar-heading">
        <div>
          <h2 style={{ marginBottom: 4 }}>{change.title}</h2>
          <div className="muted"><span className="mono">{change.id}</span> · {change.lifecycle?.phaseLabel}</div>
        </div>
        <div className="btnrow">
          <PriorityBadge priority={change.priority} />
          <Link className="btn" to={changePath(change.id)}>Open the change</Link>
        </div>
      </section>
      <SolutionView ctx={ctx} standalone />
    </div>
  );
}
