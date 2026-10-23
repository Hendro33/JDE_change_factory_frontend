import { validationRequest } from "../../services/validationApi";
import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { Change, IntegrationStatus, MyWork, QuestionItem } from "../../types/domain";
import { DomainLines, FigureStrip, QuestionRow, RequestLine, StuckList } from "../../components/home";
import {
  EmptyState, ErrorState, ImpactIndicator, JadeWorking, Loading, PageHeader,
  storyTitle, useAsync, useSessionInfo,
} from "../../components/design";
import { Link, storyPath } from "../../router";
import { workLink } from "../../services/workLink";
import { waitingLabel } from "../../services/metrics";
import { recentStories } from "../../services/recent";

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
    <li className={`qrow k-${na.kind}`}>
      <span className="kindtile" data-kind={na.kind === "decision" ? "decision" : "task"} aria-hidden="true">{na.kind === "decision" ? "◆" : "○"}</span>
      <span className="sr-only">{na.kind === "decision" ? "Decision" : "To do"}</span>
      <span className="qrow-main">
        <Link className="qrow-title" to={to}>{storyTitle(c)}</Link>
        <span className="qrow-sub">{na.summary}</span>
      </span>
      <span className="qrow-meta"><span>{c.lifecycle!.phaseLabel}{waitingLabel(c) ? ` · ${waitingLabel(c)}` : ""}</span><span className="muted qrow-domain">{info.domainName(c.businessDomainId) ?? "No domain"}</span><ImpactIndicator change={c} /></span>
      {/* Lists carry no yellow: the one yellow action is the decision itself, on its screen (register L3). */}
      <Link className="btn small" to={to}>{ACTION_VERB[na.action ?? ""] ?? "Open"}</Link>
    </li>
  );
}

/** The queue of one role area: decisions and tasks, then the questions owned there (register C3). */
function AreaQueue({ rows, questions, newRequests, onChanged }: { rows: Change[]; questions: QuestionItem[]; newRequests: Change[]; onChanged: () => void }) {
  if (!rows.length && !questions.length && !newRequests.length) return <EmptyState title="Nothing waiting on you">When something needs your decision or answer, it appears here and in the bell.</EmptyState>;
  return (
    <ul className="queue">
      {rows.map((c) => <QueueRow key={c.id} c={c} />)}
      {questions.map((q) => <QuestionRow key={q.issue.id} q={q} onAnswered={onChanged} />)}
      {newRequests.length > 0 && (
        <li className="qrow k-task">
          <span className="kindtile" data-kind="task" aria-hidden="true">○</span>
          <span className="qrow-main">
            <Link className="qrow-title" to="/stories?phase=understand">{newRequests.length} new request{newRequests.length === 1 ? "" : "s"} to analyse</Link>
            <span className="qrow-sub">{newRequests.slice(0, 3).map((c) => storyTitle(c)).join(" · ")}{newRequests.length > 3 ? " …" : ""}</span>
          </span>
          <span className="qrow-meta"><span>Understand</span></span>
          <Link className="btn small" to="/stories?phase=understand">Open requests</Link>
        </li>
      )}
    </ul>
  );
}

const BUSINESS_OWNERS = new Set(["domain_owner"]);

/** The Domain Owner's home (register C1): Needs you, and Your requests. Nothing else. */
export function DomainOwnerHome({ work, onChanged }: { work: MyWork; onChanged: () => void }) {
  const rows = work.needsYou.filter((c) => BUSINESS_OWNERS.has(c.lifecycle?.nextAction.owner ?? ""));
  const questions = work.questions.filter((q) => BUSINESS_OWNERS.has(q.issue.owner));
  return (
    <>
      <h2 className="qhead">Needs you <span className="qcount">{rows.length + questions.length}</span></h2>
      <AreaQueue rows={rows} questions={questions} newRequests={[]} onChanged={onChanged} />
      <h2 className="qhead">Your requests <span className="qcount">{work.yourRequests.length}</span></h2>
      {work.yourRequests.length === 0 ? <p className="muted">No open requests in your domains.</p>
        : <ul className="reqlist">{work.yourRequests.map((c) => <RequestLine key={c.id} c={c} />)}</ul>}
    </>
  );
}

/** The Application Manager's home (register K7, K15, decision X1): one figure strip, the queue, stuck work and domains. */
export function AppManagerHome({ work, onChanged, figures = true }: { work: MyWork; onChanged: () => void; figures?: boolean }) {
  const ours = (owner: string) => !BUSINESS_OWNERS.has(owner);
  const all = work.needsYou.filter((c) => ours(c.lifecycle?.nextAction.owner ?? ""));
  const newRequests = all.filter((c) => c.lifecycle?.nextAction.action === "start_analysis");
  const rows = all.filter((c) => !newRequests.includes(c));
  const questions = work.questions.filter((q) => ours(q.issue.owner));
  return (
    <>
      {figures && <FigureStrip figures={work.figures} label="Today" />}
      <h2 className="qhead">Your queue <span className="qcount">{rows.length + questions.length + (newRequests.length ? 1 : 0)}</span></h2>
      <AreaQueue rows={rows} questions={questions} newRequests={newRequests} onChanged={onChanged} />
      <h2 className="qhead">Stuck <span className="qcount">{work.stuck.length}</span></h2>
      <StuckList items={work.stuck} />
      {work.perDomain.length > 0 && <>
        <h2 className="qhead">By business domain</h2>
        <DomainLines lines={work.perDomain} />
      </>}
      {work.jadeWorking.length > 0 && (
        <details className="qmore">
          <summary>JADE is working on {work.jadeWorking.length}</summary>
          <ul className="quietlist">{work.jadeWorking.map((c) => (
            <li key={c.id}><Link to={storyPath(c.id)}>{storyTitle(c)}</Link><JadeWorking>{c.lifecycle?.nextAction.summary}</JadeWorking></li>
          ))}</ul>
        </details>
      )}
    </>
  );
}

/**
 * My Work: the role home. A Domain Owner sees Needs you and Your requests;
 * an Application Manager the figure strip, the queue, stuck work and the
 * domains; someone with both roles sees the two areas apart (register A1).
 */
export function MyWorkPage() {
  const info = useSessionInfo();
  const { data: validationTasks, error: validationError } = useAsync(() => validationRequest<any[]>("/tasks"), [info.session.activeCustomerId]);
  const openTests = (validationTasks ?? []).flatMap((r) => r.attempts
    .filter((a: any) => a.assignee_id === info.session.userId && !a.submitted_at && a.selected && a.body.route === "manual"
      && ["awaiting_input", "queued", "preflight", "running"].includes(r.status))
    .map(() => r.status));
  const readyTests = openTests.filter((status) => status === "awaiting_input").length;
  const preparingTests = openTests.length - readyTests;
  const [tick, setTick] = useState(0);
  const { data: work, error } = useAsync(() => api.getMyWork(), [tick]);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  useEffect(() => {
    if (info.has("admin")) api.listIntegrations().then(setIntegrations).catch(() => setIntegrations([]));
  }, [info]);

  if (error) return <ErrorState error={error} title="Your work could not be loaded" />;
  if (!work) return <Loading what="your work" />;

  const reload = () => setTick((t) => t + 1);
  const count = work.attentionCount + readyTests;
  const firstName = info.session.displayName.split(/\s+/)[0];
  const problems = integrations.filter((i) => !i.connected);
  const isBusiness = info.has("domain_owner");
  const isApp = info.appManagement;
  const recent = recentStories(info.session.activeCustomerId);

  return (
    <div className="mywork home">
      <PageHeader eyebrow={`${greeting()}, ${firstName}`}
        title={count === 0 ? "Nothing needs you right now" : `${count} thing${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} you`}
      />
      {!work.roles.length && <p className="callout">You have no role on this customer yet; ask an administrator.</p>}
      {openTests.length > 0 && (
        <p className="home-tests">
          {readyTests > 0 && `${readyTests} acceptance test${readyTests === 1 ? " awaits" : "s await"} your observations. `}
          {preparingTests > 0 && `${preparingTests} ${preparingTests === 1 ? "is" : "are"} still being prepared. `}
          <Link to="/validation/tasks">Open my acceptance tests</Link>
        </p>
      )}
      {!!validationError && <p role="alert">Assigned acceptance tests could not be loaded.</p>}
      {info.has("admin") && problems.length > 0 && (
        <p className="home-tests"><Link to="/admin/connections">{problems.length} connection{problems.length === 1 ? "" : "s"} not set up</Link></p>
      )}
      {isBusiness && isApp ? (
        <div className="home-areas">
          <section aria-label="Business"><h2 className="area-title">Business</h2><DomainOwnerHome work={work} onChanged={reload} /></section>
          <section aria-label="Application Management"><h2 className="area-title">Application Management</h2><AppManagerHome work={work} onChanged={reload} /></section>
        </div>
      ) : isApp ? <AppManagerHome work={work} onChanged={reload} />
        : isBusiness ? <DomainOwnerHome work={work} onChanged={reload} />
        : <AreaQueue rows={work.needsYou} questions={work.questions} newRequests={[]} onChanged={reload} />}
      {/* Kept from the former side panel (register P1): a new request and the stories opened lately. */}
      <footer className="home-foot">
        <Link to="/stories/new">New request</Link>
        {recent.length > 0 && <><span className="muted"> · Recently opened: </span>
          {recent.slice(0, 5).map((r, i) => <span key={r.id}>{i > 0 && ", "}<Link to={storyPath(r.id)}>{r.title}</Link></span>)}</>}
      </footer>
    </div>
  );
}
