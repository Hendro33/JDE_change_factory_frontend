import { ReviewDetail } from "../../components/visualReview";
import { HealthIndicator, PhaseLabel } from "../../components/design";
import { Link, navigate, setQueryParam } from "../../router";
import { AM_STAGES, inAmStage } from "./workflow";
import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { Change } from "../../types/domain";
import type { NavTarget } from "../../types/nav";
import { ChangeGrid, useChangeListControls, type GridColumn } from "../../components/WorkQueue";
import { ApiNote, Loading, PriorityBadge } from "../../components/ui";

/**
 * One reusable page for the post-Delivery-Queue stages of the
 * lifecycle (Increment: Continuous Delivery Flow) — Active Changes,
 * Validation and Ready for Release/CNC are the same component with a
 * different default state filter, not three bespoke pages.
 */
type StagePreset = "active" | "validation" | "release" | "completed" | "all";

const STAGE_COPY: Record<StagePreset, { title: string; sub: string }> = {
  active: { title: "Delivery", sub: "Architecture-approved work, from implementation preparation through execution." },
  validation: { title: "Validation", sub: "Changes in canonical validation, including tests in progress or needing attention." },
  release: { title: "Ready for Release / CNC", sub: "Delivered stories with completed JADE records, ready for external release / CNC handover. Production promotion remains outside JADE." },
  completed: { title: "Completed", sub: "Stories the canonical lifecycle records as delivered or resolved without a change." },
  all: { title: "Delivery", sub: "Approved changes, and exactly how far each one has actually got." },
};

function presetFrom(navFilter: Record<string, string> | undefined): StagePreset {
  const s = navFilter?.stage;
  return s === "active" || s === "validation" || s === "release" || s === "completed" ? s : "all";
}

export function Pipeline({ onOpenChange, navFilter, navToken }: { onOpenChange: (id: string) => void } & NavTarget) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [preset, setPreset] = useState<StagePreset>(() => presetFrom(navFilter));

  useEffect(() => {
    api.listChanges().then((all) =>
      setChanges(all)
    );
  }, []);

  useEffect(() => { setPreset(presetFrom(navFilter)); }, [navToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoped = (changes ?? []).filter((c) => !navFilter?.story || c.id === navFilter.story).filter((c) => {
    if (navFilter?.queue === "approved" || navFilter?.queue === "delivery") return inAmStage(c, navFilter.queue);
    if (preset === "active") return inAmStage(c, "approved") || inAmStage(c, "delivery");
    if (preset === "all") return ["architecture", "approved", "delivery", "validation", "asbuilt", "completed"].some((s) => inAmStage(c, s as Parameters<typeof inAmStage>[1]));
    return inAmStage(c, preset);
  });


  const columns: GridColumn[] = [
    { key: "id", header: "Change", render: (c) => <span className="mono">{c.id}</span>, sortValue: (c) => c.id },
    { key: "title", header: "Description", render: (c) => c.title, sortValue: (c) => c.title },
    { key: "route", header: "Route", render: (c) => c.architectDecision?.recommendedRoute ?? <span className="notstated">not decided</span> },
    { key: "changeApproved", header: "Exact change approved", render: (c) =>
      c.changeApproval?.status === "approved" ? <span className="badge ok">Approved</span>
        : c.exactChange ? <span className="badge warn">Waiting on you</span>
        : <span className="badge grey">Not proposed</span> },
    { key: "test", header: "Test", render: (c) =>
      c.testResult?.outcome === "pass" ? <span className="badge ok">Passed</span>
        : c.testResult?.outcome === "fail" ? <span className="badge stop">Failed</span>
        : <span className="badge grey">Not run</span> },
    { key: "status", header: "Phase / health", render: (c) => <><PhaseLabel lifecycle={c.lifecycle} /><HealthIndicator lifecycle={c.lifecycle} /></> },
    { key: "next", header: "Next action", render: (c) => c.lifecycle?.nextAction.summary ?? "—" },
    { key: "priority", header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
  ];

  const { search, setSearch, sortKey, sortDir, onSortChange, filtered } = useChangeListControls(
    scoped, columns, (c) => `${c.id} ${c.title}`
  );

  const copy = STAGE_COPY[preset];

  return (
    <div className="vr-pilot">
      <div className="pagehead">
        <div>
          <h1>{copy.title}</h1>
          <div className="sub">{copy.sub}</div>
        </div>
        <div className="meta">{scoped.length} in this view</div>
      </div>

      {!changes ? <Loading what="the pipeline" /> : (
        <div className="stack">
          <ReviewDetail title="All Application Management queues">
            <div className="btnrow">{AM_STAGES.map((s) => <Link className="btn small" key={s.key} to={s.to}>{s.label} · {(changes ?? []).filter((c) => inAmStage(c, s.key)).length}</Link>)}</div>
          </ReviewDetail>

          <div className="panel filterbar">
            <div className="field">
              {navFilter?.queue && <p>{navFilter.queue === "approved" ? "Approved for Delivery" : "In Delivery"} · <button className="linkish" onClick={() => setQueryParam("queue", "")}>Show all delivery</button></p>}
              <label htmlFor="stagepreset">Stage</label>
              <select id="stagepreset" value={preset} onChange={(e) => navigate(`/am/changes?stage=${e.target.value}`)}>
                <option value="all">All active + completed</option>
                <option value="active">Active Changes</option>
                <option value="validation">Validation</option>
                <option value="release">Ready for Release / CNC</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pipelinesearch">Search</label>
              <input id="pipelinesearch" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID or title" />
            </div>
          </div>

          <section className="panel">
            <h2>Changes in this view</h2>
            <ChangeGrid
              changes={filtered}
              columns={columns}
              onRowClick={onOpenChange}
              emptyMessage="No changes in this queue."
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={onSortChange}
            />
            <ApiNote endpoint="GET /changes · GET /changes/{id}/implementation" />
          </section>
        </div>
      )}
    </div>
  );
}
