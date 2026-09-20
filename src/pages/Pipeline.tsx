import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Change, LifecycleState } from "../types/domain";
import type { NavTarget } from "../types/nav";
import { ChangeGrid, useChangeListControls, type GridColumn } from "../components/WorkQueue";
import { ApiNote, Loading, PriorityBadge, StateBadge, stateLabel } from "../components/ui";

/**
 * One reusable page for the post-Delivery-Queue stages of the
 * lifecycle (Increment: Continuous Delivery Flow) — Active Changes,
 * Validation and Ready for Release/CNC are the same component with a
 * different default state filter, not three bespoke pages.
 */
type StagePreset = "active" | "validation" | "release" | "completed" | "all";

const STAGE_STATES: Record<StagePreset, LifecycleState[]> = {
  active: ["APPROVED", "ARCHITECTING", "SPEC_READY", "CHANGE_APPROVED", "EXECUTING"],
  validation: ["TESTING", "VALIDATED"],
  release: ["CNC_HANDOFF"],
  completed: ["CLOSED", "VALIDATED", "CNC_HANDOFF", "RESOLVED_WITHOUT_CHANGE"],
  all: ["APPROVED", "ARCHITECTING", "SPEC_READY", "CHANGE_APPROVED", "EXECUTING", "TESTING", "VALIDATED", "CNC_HANDOFF", "CLOSED"],
};

const STAGE_COPY: Record<StagePreset, { title: string; sub: string }> = {
  active: { title: "Active Changes", sub: "Approved work currently in progress, from architecture analysis through execution." },
  validation: { title: "Validation", sub: "Changes that have been tested and are awaiting Business Validation." },
  release: { title: "Ready for Release / CNC", sub: "Validated changes handed to CNC for package build and promotion." },
  completed: { title: "Completed", sub: "Changes that have reached Closed, Validated, CNC hand-off, or were resolved without a change." },
  all: { title: "Active Changes", sub: "Approved changes, and exactly how far each one has actually got." },
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
      setChanges(all.filter((c) => STAGE_STATES.all.includes(c.state) || c.state === "RESOLVED_WITHOUT_CHANGE"))
    );
  }, []);

  useEffect(() => { setPreset(presetFrom(navFilter)); }, [navToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const states = STAGE_STATES[preset];
  const scoped = (changes ?? []).filter((c) => states.includes(c.state));
  const countIn = (s: LifecycleState) => changes?.filter((c) => c.state === s).length ?? 0;

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
    { key: "status", header: "Status", render: (c) => <StateBadge state={c.state} /> },
    { key: "priority", header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
  ];

  const { search, setSearch, sortKey, sortDir, onSortChange, filtered } = useChangeListControls(
    scoped, columns, (c) => `${c.id} ${c.title}`
  );

  const copy = STAGE_COPY[preset];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{copy.title}</h1>
          <div className="sub">{copy.sub}</div>
        </div>
        <div className="meta">{scoped.length} in this view</div>
      </div>

      {!changes ? <Loading what="the pipeline" /> : (
        <div className="stack">
          <section className="panel">
            <h2>Where everything sits</h2>
            <div style={{ display: "flex", gap: 0, flexWrap: "wrap", alignItems: "stretch" }}>
              {STAGE_STATES.all.map((s, i) => {
                const n = countIn(s);
                return (
                  <div key={s} style={{ display: "contents" }}>
                    <div style={{
                      border: "1px solid var(--line-strong)",
                      background: n > 0 ? "var(--brand)" : "var(--panel)",
                      padding: "10px 14px", minWidth: 104, textAlign: "center",
                    }}>
                      <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.1 }}>{n}</div>
                      <div style={{ fontSize: 11.5, color: n > 0 ? "var(--ink)" : "var(--muted)" }}>
                        {stateLabel(s)}
                      </div>
                    </div>
                    {i < STAGE_STATES.all.length - 1 && (
                      <div style={{ alignSelf: "center", padding: "0 6px", color: "var(--line-strong)" }}>→</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="panel filterbar">
            <div className="field">
              <label htmlFor="stagepreset">Stage</label>
              <select id="stagepreset" value={preset} onChange={(e) => setPreset(e.target.value as StagePreset)}>
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
              emptyMessage="Nothing in this view. Jade has no Phase 3 work at this stage yet."
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={onSortChange}
            />
            <ApiNote endpoint="GET /changes · GET /changes/{id}/implementation" />
          </section>
        </div>
      )}
    </>
  );
}
