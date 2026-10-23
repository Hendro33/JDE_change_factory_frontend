import { validationRequest } from "../../services/validationApi";
import { useEffect, useState } from "react";
import { recentStories } from "../../services/recent";
import { api } from "../../services/api";
import type { Change, IntegrationStatus } from "../../types/domain";
import {
  EmptyState, ErrorState, ImpactIndicator, JadeWorking, Loading, PageHeader, Section,
  attentionOf, storyTitle, useAsync, useSessionInfo, ROLE_LABEL,
} from "../../components/design";
import { Link, storyPath } from "../../router";
import { workLink } from "../../services/workLink";
import { oldestWaiting, waitingLabel } from "../../services/metrics";
import { MetricStrip } from "../../components/work";

/** The verb on each item's button: what the person will actually do. */
export const ACTION_VERB: Record<string, string> = {
  review_story: "Review story", authorise_delivery: "Review and authorise", approve_design: "Review solution",
  approve_exact_change: "Review solution", approve_package: "Review implementation", record_cnc: "Record activation",
  finalise_asbuilt: "Review release", start_analysis: "Start analysis", rerun_solutioning: "Run solutioning",
  start_technical_prepare: "Continue delivery", start_technical_repair: "Start repair",
  provide_technical_evidence: "Provide what is missing",
  record_technical_apply: "Record check-in", record_technical_build: "Record build", record_technical_verify: "Record verification",
  record_applied: "Record applied in DEV", run_or_record_test: "Test and record",
  run_agents_or_record: "Run the agents or apply it", agents_running: "Follow the agents", reconcile_item: "Reconcile",
  reconcile_technical: "Resolve", reconcile_functional: "Resolve", assign_domain: "Place in a domain", clarify: "Answer question",
  confirm_no_change: "Review and confirm", authorise_handoff: "Review solution", accept_outcome: "Check and accept", answer_issue: "Answer question", decide_issue: "Decide",
};

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}


/** One row of the queue: what, where it is, how long it has waited, and the one button. */
export function QueueRow({ c }: { c: Change }) {
  const info = useSessionInfo();
  const na = c.lifecycle!.nextAction;
  // Straight into the screen where this person acts (finding 1).
  const to = workLink(c, info);
  return (
    <li className={`qrow ${na.kind}`}>
      <span className="qrow-kind">{na.kind === "decision" ? <><span aria-hidden="true">◆</span> Decision</> : <><span aria-hidden="true">○</span> To do</>}</span>
      <span className="qrow-main">
        <Link className="qrow-title" to={to}>{storyTitle(c)}</Link>
        <span className="qrow-sub">{na.summary}</span>
      </span>
      <span className="qrow-meta"><span>{c.lifecycle!.phaseLabel}{waitingLabel(c) ? ` · ${waitingLabel(c)}` : ""}</span><span className="muted qrow-domain">{info.domainName(c.businessDomainId) ?? "No domain"}</span></span>
      <span className="qrow-prio"><ImpactIndicator change={c} /></span>
      <Link className={`btn small ${na.kind === "decision" ? "primary" : ""}`} to={to}>{ACTION_VERB[na.action ?? ""] ?? "Open"}</Link>
    </li>
  );
}

/**
 * My Work: the first page after sign-in answers one question -- what
 * needs my attention? Decisions first, then tasks, each one click from the
 * exact control on the story. What others and JADE are doing sits below,
 * quietly. Role-aware: the list comes from the canonical lifecycle and
 * this person's roles on this customer.
 */
export function MyWorkPage() {
  const info = useSessionInfo();
  const { data: validationTasks, error: validationError } = useAsync(() => validationRequest<any[]>("/tasks"), [info.session.activeCustomerId]);
  // A manual acceptance test is ready once its run waits for input; earlier it is still being prepared.
  const openTests = (validationTasks ?? []).flatMap((r) => r.attempts
    .filter((a: any) => a.assignee_id === info.session.userId && !a.submitted_at && a.selected && a.body.route === "manual"
      && ["awaiting_input", "queued", "preflight", "running"].includes(r.status))
    .map(() => r.status));
  const readyTests = openTests.filter((status) => status === "awaiting_input").length;
  const preparingTests = openTests.length - readyTests;
  const { data: work, error } = useAsync(() => api.getMyWork(), []);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  useEffect(() => {
    if (info.has("admin")) api.listIntegrations().then(setIntegrations).catch(() => setIntegrations([]));
  }, [info]);

  if (error) return <ErrorState error={error} title="Your work could not be loaded" />;
  if (!work) return <Loading what="your work" />;

  // New requests that only need "Start analysis" are grouped, not listed one by one.
  const { decisions, otherTasks, newRequests, count: storyCount } = attentionOf(work);
  const count = storyCount + readyTests;
  const firstName = info.session.displayName.split(/\s+/)[0];
  const problems = integrations.filter((i) => !i.connected);
  const recent = recentStories(info.session.activeCustomerId);
  // A Domain Owner's workspace ends at an approved story; JADE's solutioning and delivery work belongs to Application Management.
  const jadeWorking = info.appManagement ? work.jadeWorking
    : work.jadeWorking.filter((c) => c.lifecycle?.phase === "understand" || c.lifecycle?.phase === "story_review");

  return (
    <div className="mywork">
      <PageHeader eyebrow={`${greeting()}, ${firstName}`}
        title={count === 0 ? "Nothing needs you right now" : `${count} thing${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} you`}
      />
      {!work.roles.length && <p className="callout">You have no role on this customer yet; ask an administrator.</p>}
      {/* The role overview (finding 7): a few measures with their definitions, from recorded events only. */}
      {(() => {
        const mineAll = [...decisions, ...otherTasks];
        const oldest = oldestWaiting(mineAll);
        const blocked = mineAll.filter((c) => c.lifecycle?.health === "blocked" || c.lifecycle?.health === "failed" || c.lifecycle?.authorisation?.renewable).length;
        return <MetricStrip label="Your overview" items={[
          { label: "Decisions for you", value: decisions.length, definition: "Stories whose next step is a decision owned by one of your roles." },
          { label: "Oldest waiting", value: oldest === null ? "—" : `${oldest} day${oldest === 1 ? "" : "s"}`,
            definition: "Days since the current step of your longest-waiting item began (its latest recorded lifecycle event)." },
          { label: "Blocked", value: blocked, definition: "Your items that are blocked, need attention, or whose authorisation expired." },
          { label: "Stories in progress", value: work.inProgressCount, to: "/stories", definition: "Open user stories for this customer. Requests that are not a story yet are counted apart." },
          { label: "Incoming requests", value: work.requestsCount ?? 0, to: "/stories?phase=understand", definition: "Requests JADE has not turned into a user story yet." },
          { label: "Delivered, last 31 days", value: work.completedThisMonth.filter((c) => c.lifecycle?.outcome === "delivered").length, to: "/stories?phase=done",
            definition: "Stories delivered whose recorded finish falls in the last 31 days." },
        ]} />;
      })()}

      {openTests.length > 0 && (
        <Section title="Assigned acceptance tests">
          <p>
            {readyTests > 0 && `${readyTests} test${readyTests === 1 ? " awaits" : "s await"} your observations.`}
            {readyTests > 0 && preparingTests > 0 && " "}
            {preparingTests > 0 && `${preparingTests} ${preparingTests === 1 ? "is" : "are"} still being prepared and will open once setup scenarios finish.`}
          </p>
          <Link className="btn" to="/validation/tasks">Open my acceptance tests</Link>
        </Section>
      )}
      {!!validationError && <p role="alert">Assigned acceptance tests could not be loaded.</p>}
      <div className="mywork-grid">
        <div>
          {storyCount === 0 ? (
            <EmptyState title="You're up to date">When a story needs your decision or action, it appears here and in the bell at the top.</EmptyState>
          ) : (
            <>
              {decisions.length > 0 && <>
                <h2 className="qhead">Your decisions <span className="qcount">{decisions.length}</span></h2>
                <ul className="queue">{decisions.map((c) => <QueueRow key={c.id} c={c} />)}</ul>
              </>}
              {(otherTasks.length > 0 || newRequests.length > 0) && <>
                <h2 className="qhead">Your tasks <span className="qcount">{otherTasks.length + (newRequests.length ? 1 : 0)}</span></h2>
                <ul className="queue">
                  {otherTasks.map((c) => <QueueRow key={c.id} c={c} />)}
                  {newRequests.length > 0 && (
                    <li className="qrow task">
                      <span className="qrow-kind"><span aria-hidden="true">○</span> To do</span>
                      <span className="qrow-main">
                        <Link className="qrow-title" to="/stories?phase=understand">{newRequests.length} new request{newRequests.length === 1 ? "" : "s"} to analyse</Link>
                        <span className="qrow-sub">{newRequests.slice(0, 3).map((c) => storyTitle(c)).join(" · ")}{newRequests.length > 3 ? " …" : ""}</span>
                      </span>
                      <span className="qrow-meta"><span>Understand</span></span>
                      <span className="qrow-prio" />
                      <Link className="btn small" to="/stories?phase=understand">Open requests</Link>
                    </li>
                  )}
                </ul>
              </>}
            </>
          )}

          {jadeWorking.length > 0 && (
            <details className="qmore">
              <summary>JADE is working on {jadeWorking.length}</summary>
              <ul className="quietlist">{jadeWorking.map((c) => (
                <li key={c.id}><Link to={storyPath(c.id)}>{storyTitle(c)}</Link><JadeWorking>{c.lifecycle?.nextAction.summary}</JadeWorking></li>
              ))}</ul>
            </details>
          )}

          {work.waitingOnOthers.length > 0 && (
            <details className="qmore">
              <summary>Waiting on others {work.waitingOnOthers.length}</summary>
              <ul className="quietlist">{work.waitingOnOthers.slice(0, 8).map((c) => (
                <li key={c.id}><Link to={storyPath(c.id)}>{storyTitle(c)}</Link>
                  <span className="muted"> — {!info.appManagement && ["product_manager", "cnc_operator", "admin"].includes(c.lifecycle?.nextAction.owner ?? "")
                    ? `with Application Management (${c.lifecycle?.phaseLabel})`
                    : `${c.lifecycle?.nextAction.ownerLabel}: ${c.lifecycle?.nextAction.summary}`}</span></li>
              ))}</ul>
              {work.waitingOnOthers.length > 8 && <Link to="/stories?health=attention">All {work.waitingOnOthers.length}</Link>}
            </details>
          )}
        </div>

        <aside className="mywork-side">
          {/* Counts are Insights' job; one line links there (step 3: no card stacks). */}
          <Link className="btn wide" to="/stories/new">New request</Link>
          {recent.length > 0 && (
            <Section title="Recently viewed" quiet>
              <ul className="quietlist">{recent.map((r) => <li key={r.id}><Link to={storyPath(r.id)}>{r.title}</Link></li>)}</ul>
            </Section>
          )}
          {info.has("admin") && problems.length > 0 && (
            <p className="muted side-counts"><Link to="/admin/connections">{problems.length} connection{problems.length === 1 ? "" : "s"} not set up</Link>
              <span className="explain"> ({problems.map((i) => i.name).join(", ")})</span></p>
          )}
        </aside>
      </div>
    </div>
  );
}
