import { EmptyState, HealthIndicator, Section, useSessionInfo } from "../../components/design";
import { OutcomeCardView, WorkItemsList } from "../../components/journey";
import { Link } from "../../router";
import type { StoryCtx } from "./storyContext";
import { changePath } from "./useStory";

/**
 * Progress and outcome, for the business: where the change is, who is doing
 * what (by kind of work, without technical detail), and at the end the
 * outcome -- verified in DEV, accepted by the business, handed over for
 * release -- which the Domain Owner accepts here.
 */
export function ProgressTab({ ctx }: { ctx: StoryCtx }) {
  const { change } = ctx;
  const info = useSessionInfo();
  const lc = change.lifecycle;
  if (!lc) return <EmptyState title="Progress is not available">The story's lifecycle could not be read.</EmptyState>;
  const steps = lc.deliverySteps;

  return (
    <div className="progress">
      {/* The phase and the next step are on the card above; only the link to the delivery detail stays here. */}
      {info.appManagement && (lc.phaseIndex ?? 0) >= 2 && (
        <p><Link to={changePath(change.id, "delivery")}>Delivery detail in Application Management</Link></p>
      )}

      {lc.outcomeCard && <OutcomeCardView change={change} lifecycle={lc} onChanged={() => ctx.reload()} />}

      <WorkItemsList items={lc.workItems} business title="Who is doing what" />

      {steps.length === 0 && !lc.outcomeCard && (
        <p className="muted">Delivery starts once the solution is authorised. You can follow every step here.</p>
      )}
    </div>
  );
}
