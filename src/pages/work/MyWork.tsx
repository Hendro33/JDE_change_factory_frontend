import { useEffect, useState } from "react";
import { recentStories } from "../../services/recent";
import { api } from "../../services/api";
import type { Change, IntegrationStatus } from "../../types/domain";
import {
  EmptyState, ErrorState, ImpactIndicator, JadeWorking, Loading, PageHeader, Section,
  attentionOf, storyTitle, useAsync, useSessionInfo, ROLE_LABEL,
} from "../../components/design";
import { Link, storyPath } from "../../router";
import { gateFor } from "../stories/NextActionCard";

/** The verb on each item's button: what the person will actually do. */
export const ACTION_VERB: Record<string, string> = {
  review_story: "Review story", authorise_delivery: "Review and authorise", approve_design: "Review solution",
  approve_exact_change: "Review solution", approve_package: "Review implementation", record_cnc: "Record activation",
  finalise_asbuilt: "Review release", start_analysis: "Start analysis", rerun_solutioning: "Run solutioning",
  start_technical_prepare: "Continue delivery", start_technical_repair: "Start repair",
  record_technical_apply: "Record check-in", record_technical_build: "Record build", record_technical_verify: "Record verification",
  record_applied: "Record applied in DEV", run_or_record_test: "Test and record",
  reconcile_technical: "Resolve", reconcile_functional: "Resolve", assign_domain: "Place in a domain", clarify: "Answer question",
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function WorkItem({ c }: { c: Change }) {
  const info = useSessionInfo();
  const na = c.lifecycle!.nextAction;
  // Gate decisions open on their own screen (User Story Review, Backlog Review, ...).
  const gate = na.action ? gateFor(na.action, c.id) : undefined;
  const to = gate?.to ?? storyPath(c.id, na.tab, "next-action");
  return (
    <li className={`workitem ${na.kind}`}>
      <div className="workitem-main">
        <div className="workitem-kicker">{na.kind === "decision" ? "Decision" : "To do"} · {c.lifecycle!.phaseLabel}{gate ? ` · ${gate.screen}` : ""}</div>
        <Link className="workitem-title" to={storyPath(c.id)}>{storyTitle(c)}</Link>
        <div className="workitem-summary">{na.summary}</div>
        <div className="workitem-meta"><ImpactIndicator change={c} /> · {info.domainName(c.businessDomainId) ?? "No domain yet"} · <span className="mono">{c.id}</span></div>
      </div>
      <Link className={`btn ${na.kind === "decision" ? "primary" : ""}`} to={to}>
        {ACTION_VERB[na.action ?? ""] ?? "Open"}
      </Link>
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
  const { data: work, error } = useAsync(() => api.getMyWork(), []);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  useEffect(() => {
    if (info.has("admin")) api.listIntegrations().then(setIntegrations).catch(() => setIntegrations([]));
  }, [info]);

  if (error) return <ErrorState error={error} title="Your work could not be loaded" />;
  if (!work) return <Loading what="your work" />;

  // New requests that only need "Start analysis" are grouped, not listed one by one.
  const { decisions, otherTasks, newRequests, count } = attentionOf(work);
  const firstName = info.session.displayName.split(/\s+/)[0];
  const problems = integrations.filter((i) => !i.connected);
  const recent = recentStories(info.session.activeCustomerId);
  // A Domain Owner's workspace ends at an approved story; JADE's solutioning and delivery work belongs to Application Management.
  const jadeWorking = info.appManagement ? work.jadeWorking
    : work.jadeWorking.filter((c) => c.lifecycle?.phase === "understand" || c.lifecycle?.phase === "story_review");

  return (
    <div className="mywork">
      <PageHeader eyebrow={`${greeting()}, ${firstName}`}
        title={count === 0 ? "Nothing needs you right now" : `${count} thing${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} your attention`}
        subtitle={work.roles.length ? `As ${work.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")} on this customer.` : "You have no role on this customer yet; ask an administrator."} />

      <div className="mywork-grid">
        <div>
          {count === 0 ? (
            <EmptyState title="You're up to date">When a story needs your decision or action, it appears here and in the bell at the top.</EmptyState>
          ) : (
            <ul className="worklist">
              {decisions.map((c) => <WorkItem key={c.id} c={c} />)}
              {otherTasks.map((c) => <WorkItem key={c.id} c={c} />)}
              {newRequests.length > 0 && (
                <li className="workitem task">
                  <div className="workitem-main">
                    <div className="workitem-kicker">To do · Understand</div>
                    <Link className="workitem-title" to="/stories?phase=understand">{newRequests.length} new request{newRequests.length === 1 ? "" : "s"} to analyse</Link>
                    <div className="workitem-summary">Start JADE's analysis to turn {newRequests.length === 1 ? "it" : "them"} into user stories.</div>
                    <div className="workitem-meta">{newRequests.slice(0, 3).map((c) => storyTitle(c)).join(" · ")}{newRequests.length > 3 ? " …" : ""}</div>
                  </div>
                  <Link className="btn" to="/stories?phase=understand">Open requests</Link>
                </li>
              )}
            </ul>
          )}

          {jadeWorking.length > 0 && (
            <Section title="JADE is working on" quiet>
              <ul className="quietlist">{jadeWorking.map((c) => (
                <li key={c.id}><Link to={storyPath(c.id)}>{storyTitle(c)}</Link><JadeWorking>{c.lifecycle?.nextAction.summary}</JadeWorking></li>
              ))}</ul>
            </Section>
          )}

          {work.waitingOnOthers.length > 0 && (
            <Section title="Waiting on others" quiet>
              <ul className="quietlist">{work.waitingOnOthers.slice(0, 8).map((c) => (
                <li key={c.id}><Link to={storyPath(c.id)}>{storyTitle(c)}</Link>
                  <span className="muted"> — {!info.appManagement && ["product_manager", "cnc_operator", "admin"].includes(c.lifecycle?.nextAction.owner ?? "")
                    ? `with Application Management (${c.lifecycle?.phaseLabel})`
                    : `${c.lifecycle?.nextAction.ownerLabel}: ${c.lifecycle?.nextAction.summary}`}</span></li>
              ))}</ul>
              {work.waitingOnOthers.length > 8 && <Link to="/stories?health=attention">All {work.waitingOnOthers.length}</Link>}
            </Section>
          )}
        </div>

        <aside className="mywork-side">
          <Link className="statcard" to="/stories">
            <span className="stat-value">{work.inProgressCount}</span>
            <span className="stat-label">stories in progress</span>
          </Link>
          <Link className="statcard" to="/stories?phase=done">
            <span className="stat-value">{work.completedThisMonth.length}</span>
            <span className="stat-label">delivered in the last month</span>
          </Link>
          <Link className="btn wide" to="/stories/new">New request</Link>
          {recent.length > 0 && (
            <Section title="Recently viewed" quiet>
              <ul className="quietlist">{recent.map((r) => <li key={r.id}><Link to={storyPath(r.id)}>{r.title}</Link></li>)}</ul>
            </Section>
          )}
          {info.has("admin") && problems.length > 0 && (
            <Section title="For administrators" quiet>
              <ul className="quietlist">{problems.map((i) => (
                <li key={i.name}><Link to="/admin/connections">{i.name}</Link><span className="muted"> — not connected</span></li>
              ))}</ul>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
