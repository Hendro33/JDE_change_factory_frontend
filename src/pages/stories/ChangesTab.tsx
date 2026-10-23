import { Details, EmptyState, Section, useSessionInfo } from "../../components/design";
import { ProcessSwimlane } from "../../components/journey";
import { AcceptanceList, IssueList, ResultSummary } from "../../components/work";
import { Link } from "../../router";
import { ROUTE_LABEL, type StoryCtx } from "./storyContext";
import { changePath } from "./useStory";

/**
 * What changes for the business: what JADE proposes in plain words, the
 * process before and after (the steps this change touches highlighted), how
 * the business will know it works, and the questions only the business can
 * answer. No technical workbench here; the application view has it.
 */
export function ChangesTab({ ctx }: { ctx: StoryCtx }) {
  const { change } = ctx;
  const info = useSessionInfo();
  const lc = change.lifecycle;
  const d = change.architectDecision;
  const us = change.userStory;
  const route = d ? ROUTE_LABEL[d.recommendedRoute] : undefined;
  const conclusion = d?.result?.conclusion || "";

  return (
    <div className="changes">
      <Section title="What JADE proposes">
        {!d ? (
          <EmptyState title={(lc?.phaseIndex ?? 0) < 2 ? "After the story is approved" : "JADE is preparing the solution"}>
            {(lc?.phaseIndex ?? 0) < 2
              ? "Once the story is approved and the Application Manager sends it to architecture, JADE researches your JD Edwards environment and proposes how to meet the need. It appears here in plain words."
              : lc?.nextAction.summary}
          </EmptyState>
        ) : (
          <>
            {route && <p className="lead-strong">{route.title}</p>}
            {conclusion ? <p className="lead">{conclusion}</p> : route && <p className="muted">{route.summary}</p>}
            {d.result?.uncertainty && d.result.uncertainty.length > 0 && (
              <p className="hint">JADE could not yet verify everything; the Application Manager follows this up.</p>
            )}
          </>
        )}
      </Section>

      <IssueList change={change} onChange={() => ctx.reload()} kinds={["business"]} title="Questions for the business" />

      <ProcessSwimlane process={ctx.process} storyId={change.id} criteria={us?.acceptanceCriteria ?? []} business
        empty={<>No process map has been recorded for this change yet. The current and proposed process can be added on the{" "}
          <Link to={`/stories/${encodeURIComponent(change.id)}#process`}>Story</Link> tab.</>} />

      {us && us.acceptanceCriteria.length > 0 && !(ctx.process?.maps.to_be.versions.length || ctx.process?.maps.as_is.versions.length) && (
        <Section title="How you will know it works">
          <AcceptanceList change={change} />
        </Section>
      )}

      {d && (d.result?.changes.length ?? 0) > 0 && (
        <Details summary="The settings that change (for reference)">
          <ResultSummary change={change} title="Settings that change" />
          {info.appManagement && <p><Link to={changePath(change.id)}>The full solution in Application Management</Link></p>}
        </Details>
      )}
    </div>
  );
}
