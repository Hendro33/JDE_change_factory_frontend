import { EmptyState, HealthIndicator, PageHeader, PhaseLabel } from "../../components/design";
import { IconTile, iconFor } from "../../components/icons";
import { oneLine } from "../../components/home";
import { navigate, setQueryParam } from "../../router";
import { inAmStage, type AmStage } from "./workflow";
import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { Change } from "../../types/domain";
import type { NavTarget } from "../../types/nav";
import { ChangeGrid, useChangeListControls, type GridColumn } from "../../components/WorkQueue";
import { Loading, PriorityBadge } from "../../components/ui";

/**
 * One reusable page for the post-Delivery-Queue stages of the
 * lifecycle (Increment: Continuous Delivery Flow) — Active Changes,
 * Validation and Ready for Release/CNC are the same component with a
 * different default state filter, not three bespoke pages.
 */
type StagePreset = "active" | "validation" | "release" | "completed" | "all";

/** One delivery queue (step 3): the former Delivery, Delivery Queue and Technical Work lists, as stage filters of one list. */
const CHIPS: { key: StagePreset; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "In delivery" },
  { key: "validation", label: "Validation" },
  { key: "release", label: "Ready for release" },
  { key: "completed", label: "Completed" },
];

function presetFrom(navFilter: Record<string, string> | undefined): StagePreset {
  const s = navFilter?.stage;
  return s === "active" || s === "validation" || s === "release" || s === "completed" ? s : "all";
}

function inPreset(c: Change, preset: StagePreset): boolean {
  if (preset === "active") return inAmStage(c, "approved") || inAmStage(c, "delivery");
  if (preset === "all") return ["approved", "delivery", "validation", "asbuilt"].some((s) => inAmStage(c, s as AmStage));
  return inAmStage(c, preset);
}

export function Pipeline({ onOpenChange: _open, navFilter, navToken }: { onOpenChange: (id: string) => void } & NavTarget) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [queue, setQueue] = useState<Map<string, number>>(new Map());
  const [preset, setPreset] = useState<StagePreset>(() => presetFrom(navFilter));

  useEffect(() => {
    api.listChanges().then(setChanges);
    api.listDeliveryQueue().then((q) => setQueue(new Map(q.map((e) => [e.changeId, e.position])))).catch(() => undefined);
  }, []);

  useEffect(() => { setPreset(presetFrom(navFilter)); }, [navToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoped = (changes ?? []).filter((c) => !navFilter?.story || c.id === navFilter.story).filter((c) => {
    if (navFilter?.queue === "approved" || navFilter?.queue === "delivery") return inAmStage(c, navFilter.queue);
    return inPreset(c, preset);
  });

  const columns: GridColumn[] = [
    { key: "pos", header: "#", render: (c) => <span className="mono muted">{queue.get(c.id) ?? "—"}</span>, sortValue: (c) => queue.get(c.id) ?? 9999 },
    { key: "title", header: "Change", render: (c) => <><div className="qrow-title">{c.title}</div><div className="mono muted small">{c.id}</div></>, sortValue: (c) => c.title },
    { key: "route", header: "Route", render: (c) => c.architectDecision?.recommendedRoute ?? <span className="notstated">not decided</span> },
    { key: "status", header: "Phase", render: (c) => <><PhaseLabel lifecycle={c.lifecycle} /> <HealthIndicator lifecycle={c.lifecycle} /></> },
    { key: "next", header: "Next", render: (c) => <>{c.lifecycle?.nextAction.summary ?? "—"}{c.lifecycle?.nextAction.ownerLabel
      ? <div className="muted small">{c.lifecycle.nextAction.ownerLabel}</div> : null}</> },
    { key: "priority", header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
  ];

  const { search, setSearch, sortKey, sortDir, onSortChange, filtered } = useChangeListControls(
    scoped, columns, (c) => `${c.id} ${c.title}`
  );

  // The same pattern as the Application Management dashboard (Hendro, 24 Oct): title with the yellow bar,
  // the stages as tabs, one card per change with its next step in one line. Queue order is kept.
  const ordered = sortKey ? filtered : [...filtered].sort((a, b) => (queue.get(a.id) ?? 9999) - (queue.get(b.id) ?? 9999));
  const go = (id: string) => navigate(`/am/changes/${encodeURIComponent(id)}/delivery`);
  return (
    <div className="home delivery">
      <PageHeader title="Delivery" subtitle="Approved work, from the change in DEV to the release hand-over." />
      {!changes ? <Loading what="the delivery queue" /> : (
        <>
          <div className="areaswitch" role="tablist" aria-label="Stage">
            {CHIPS.map((ch) => {
              const on = !navFilter?.queue && preset === ch.key;
              return (
                <button key={ch.key} role="tab" aria-selected={on} className={on ? "on" : ""}
                  onClick={() => navigate(ch.key === "all" ? "/am/delivery" : `/am/delivery?stage=${ch.key}`)}>
                  {ch.label} <span className="qcount">{changes.filter((c) => inPreset(c, ch.key)).length}</span>
                </button>
              );
            })}
          </div>
          <div className="listsearch"><label className="sr-only" htmlFor="pipelinesearch">Search</label>
            <input id="pipelinesearch" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID or title" />
            {navFilter?.queue && <button className="linkbtn" onClick={() => setQueryParam("queue", "")}>Clear filter</button>}
          </div>
          {ordered.length === 0 ? (
            <EmptyState title="Nothing here">Stories appear once the Application Manager approves them on Backlog Review.</EmptyState>
          ) : (
            <ul className="queue">{ordered.map((c) => {
              const na = c.lifecycle?.nextAction;
              return (
                <li key={c.id} className="qrow" data-id={c.id}>
                  <IconTile name={iconFor(na?.action, na?.kind)} />
                  <span className="qrow-main">
                    <button className="qrow-title linkish" onClick={() => go(c.id)}>{c.title}</button>
                    <span className="qrow-sub" title={na?.summary}>{oneLine(na?.summary) || c.lifecycle?.phaseLabel}</span>
                  </span>
                  <span className="qrow-meta">
                    {queue.get(c.id) != null && <span className="chip">#{queue.get(c.id)}</span>}
                    <span className="qrow-phase">{c.lifecycle?.phaseLabel}{c.lifecycle?.health === "blocked" ? " · Blocked" : ""}</span>
                    {["high", "urgent", "critical"].includes(String(c.priority ?? "").toLowerCase()) && <span className="chip hot">{String(c.priority)}</span>}
                  </span>
                  <button className="btn small" onClick={() => go(c.id)}>Open</button>
                </li>
              );
            })}</ul>
          )}
        </>
      )}
    </div>
  );
}
