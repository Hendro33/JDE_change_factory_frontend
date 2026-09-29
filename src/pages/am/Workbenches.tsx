import { ReviewDetail } from "../../components/visualReview";
import { inAmStage } from "./workflow";
import { KnowledgePage } from "../knowledge/Knowledge";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../services/api";
import type { Change } from "../../types/domain";
import { ErrorState, Loading, storyTitle, useSessionInfo } from "../../components/design";
import { Link, setQueryParam, storyPath, useLocation } from "../../router";
import { StoryProcessPanel } from "../StoryProcess";
import { TechnicalWorkPanel } from "../TechnicalPanel";
import { AsBuiltPanel } from "../AsBuiltPanel";
import { ExecutionPanel } from "../../components/ExecutionPanel";
import { JourneyBar } from "./JourneyBar";
import { changePath } from "./legacyNav";

const TECHNICAL_ROUTES = new Set(["Technical Agent", "Mixed"]);

/**
 * The Application Manager's per-story workbenches (restored from main's
 * Process & Maps, Technical Work and As-built Records): pick a story from
 * the ones this workbench applies to, follow the Journey bar between
 * workbenches, and work in the same governed panels the story itself uses.
 */
function Workbench({ title, intro, at, filter, empty, render }: {
  title: string; intro: ReactNode; at: string; filter: (c: Change) => boolean; empty: string;
  render: (storyId: string, change: Change, reload: () => void) => ReactNode;
}) {
  const { query } = useLocation();
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    api.listChanges().then((all) => { setChanges(all.filter(filter).filter((c) => query.get("queue") !== "asbuilt" || inAmStage(c, "asbuilt"))); setLoadError(null); })
      .catch((e) => { setLoadError(e); setChanges((prev) => prev ?? []); }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.get("queue"), tick]);
  if (!changes) return <Loading what={title.toLowerCase()} />;
  const wanted = query.get("story");
  const openId = wanted && changes.some((c) => c.id === wanted) ? wanted : changes[0]?.id ?? null;
  const open = changes.find((c) => c.id === openId);

  return (
    <div className="stack vr-pilot">
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>{title}</h1>
        <ReviewDetail title="About this workspace"><p className="hint">{intro}</p></ReviewDetail>
        {loadError !== null && <ErrorState error={loadError} title="The stories could not be loaded" />}
        {changes.length === 0 ? <p className="notstated">{empty}</p> : (
          <div className="btnrow" role="tablist" aria-label="Stories">{changes.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === openId} title={storyTitle(c)}
                    className={`btn small${c.id === openId ? " primary" : ""}`} onClick={() => setQueryParam("story", c.id)}>{c.id}</button>
          ))}</div>
        )}
      </section>
      {open && (
        <>
          <section className="panel">
            <JourneyBar storyId={open.id} at={at} />
            <h2 style={{ marginBottom: 4 }}>{storyTitle(open)}</h2>
            <div className="hint">
              <span className="mono">{open.id}</span> · <Link to={changePath(open.id)}>Change record</Link> · <Link to={storyPath(open.id)}>Story</Link>
            </div>
          </section>
          <div key={open.id}>{render(open.id, open, reload)}</div>
        </>
      )}
    </div>
  );
}

export function ProcessWorkbench() {
  return (
    <Workbench title="Process & Maps" at="process"
      intro="Finalise a story against the company's process framework, keep as-is and to-be maps beside it, and follow it through design and implementation to its as-built record."
      filter={(c) => !!c.userStory && !["RECEIVED", "REFINING", "REJECTED"].includes(c.state)}
      empty="No user stories yet."
      render={(id) => <section className="panel"><StoryProcessPanel storyId={id} /></section>} />
  );
}

export function TechnicalWorkbench({ design = false }: { design?: boolean }) {
  const info = useSessionInfo();
  return (
    <Workbench title={design ? "Technical design" : "Technical Work"} at={design ? "design" : "implementation"}
      intro={<>From an approved solution to a verified change in the DEV environment. For a configuration change, JADE's agents apply
        each approved item in DEV (through AIS or the web client) and read it back live; the Application Manager applies only what JD Edwards
        cannot accommodate that way, and the test is run or recorded.
        For custom objects, the Technical Agent prepares the package; people approve it, check it in through OMW, build it, a CNC activates it and
        the test plan is recorded -- JADE re-checks the approval before recording each step.</>}
      filter={(c) => TECHNICAL_ROUTES.has(c.architectDecision?.recommendedRoute ?? "")
        || (!design && !!c.exactChange && c.changeApproval?.status === "approved")}
      empty={design ? "No story has a design routed to the Technical Agent." : "No story has an approved solution to deliver yet."}
      render={(id, c, reload) => TECHNICAL_ROUTES.has(c.architectDecision?.recommendedRoute ?? "")
        ? <TechnicalWorkPanel storyId={id} roles={info.roles} designOnly={design} onChanged={reload} />
        : <section className="panel"><ExecutionPanel showItems changeId={id} exactChange={c.exactChange} approvalStatus={c.changeApproval?.status} onChanged={reload} /></section>} />
  );
}

export function AsBuiltWorkbench() {
  return (
    <><Workbench title="As-Built" at="asbuilt"
      intro="What was actually delivered: generated from the story, its confirmed processes and maps, the approved design, the applied implementation and its verification evidence -- with deviations and open limitations. Finalised only when every required checkpoint is complete."
      filter={(c) => !!c.architectDecision || !!c.exactChange}
      empty="No story has a design yet."
      render={(id) => <section className="panel"><AsBuiltPanel storyId={id} /></section>} /><KnowledgePage part="solutions" /></>
  );
}
