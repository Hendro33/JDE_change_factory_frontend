/**
 * Jade's design system: the reusable pieces every screen is built from.
 * One look, one vocabulary. Business meaning first; machine detail only
 * inside a Details / Technical drawer.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "../router";
import { HttpError } from "../services/httpApi";
import type {
  BusinessDomain, Change, CompanyRole, Health, Lifecycle, MyWork, Phase, Session,
} from "../types/domain";
import { PHASES } from "../types/domain";

/* ------------------------------------------------------------------ */
/* Session & roles                                                      */
/* ------------------------------------------------------------------ */

export interface SessionInfo {
  session: Session;
  roles: CompanyRole[];
  has: (...roles: CompanyRole[]) => boolean;
  /** People who may see the Technical view: builders, operators, admins. */
  technical: boolean;
  domains: BusinessDomain[];
  domainName: (id?: string | null) => string | undefined;
  isDemoCustomer: boolean;
}

export const SessionContext = createContext<SessionInfo | null>(null);

export function useSessionInfo(): SessionInfo {
  const s = useContext(SessionContext);
  if (!s) throw new Error("SessionContext missing");
  return s;
}

export const ROLE_LABEL: Record<string, string> = {
  domain_owner: "Domain Owner", product_manager: "Product Owner", admin: "Administrator",
  dashboard_viewer: "Viewer", cnc_operator: "CNC operator",
};

/* ------------------------------------------------------------------ */
/* Data loading                                                          */
/* ------------------------------------------------------------------ */

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): {
  data: T | undefined; error: unknown; loading: boolean; reload: () => void; setData: (t: T) => void;
} {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

/* ------------------------------------------------------------------ */
/* Page structure                                                        */
/* ------------------------------------------------------------------ */

export function PageHeader({ title, subtitle, actions, eyebrow }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode;
}) {
  return (
    <header className="pageheader">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="lede">{subtitle}</p>}
      </div>
      {actions && <div className="pageheader-actions">{actions}</div>}
    </header>
  );
}

export function Section({ title, children, actions, id, quiet, description }: {
  title?: ReactNode; children: ReactNode; actions?: ReactNode; id?: string; quiet?: boolean; description?: ReactNode;
}) {
  return (
    <section className={`section${quiet ? " quiet" : ""}`} id={id}>
      {(title || actions) && (
        <div className="section-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="section-actions">{actions}</div>}
        </div>
      )}
      {description && <p className="section-desc">{description}</p>}
      {children}
    </section>
  );
}

/** A labelled fact: small label, stronger value. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <div className="fact-label">{label}</div>
      <div className="fact-value">{children}</div>
    </div>
  );
}

/**
 * Progressive disclosure: summary first, detail on request. Used for
 * evidence, technical detail, history and anything a business reader
 * does not need to see by default.
 */
export function Details({ summary, children, open, tone = "default", id }: {
  summary: ReactNode; children: ReactNode; open?: boolean; tone?: "default" | "technical"; id?: string;
}) {
  return (
    <details className={`drawer ${tone}`} open={open} id={id}>
      <summary><span className="drawer-chevron" aria-hidden="true" />{summary}</summary>
      <div className="drawer-body">{children}</div>
    </details>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="emptystate">
      <div className="emptystate-title">{title}</div>
      {children && <div className="emptystate-body">{children}</div>}
      {action && <div className="emptystate-action">{action}</div>}
    </div>
  );
}

/** An error in plain language, with the server's own words one click away. */
export function ErrorState({ error, title = "Something did not work" }: { error: unknown; title?: string }) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const detail = error instanceof HttpError && error.detail !== message ? `${error.status}: ${error.detail}` : null;
  return (
    <div className="errorstate" role="alert">
      <div className="errorstate-title">{title}</div>
      <div>{message}</div>
      {detail && <Details summary="Technical details" tone="technical"><code className="mono">{detail}</code></Details>}
    </div>
  );
}

export function Loading({ what }: { what?: string }) {
  return <div className="loadingstate" aria-live="polite"><span className="spinner" aria-hidden="true" />Loading{what ? ` ${what}` : ""}…</div>;
}

/** Quiet "JADE is working" feedback -- no agent army, one calm line. */
export function JadeWorking({ children }: { children: ReactNode }) {
  return <div className="jadeworking"><span className="pulse" aria-hidden="true" />{children}</div>;
}

export function SimulationBadge({ title }: { title?: string }) {
  return <span className="tag sim" title={title ?? "Simulated JD Edwards environment -- no customer system is changed"}>Simulation</span>;
}

export function Tag({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "stop" | "info" | "ai" | "brand"; title?: string }) {
  return <span className={`tag ${tone}`} title={title}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                  */
/* ------------------------------------------------------------------ */

export function Tabs({ tabs, active, hrefFor, label }: {
  tabs: { key: string; label: ReactNode; hidden?: boolean }[];
  active: string;
  hrefFor: (key: string) => string;
  label: string;
}) {
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.filter((t) => !t.hidden).map((t) => (
        <Link key={t.key} to={hrefFor(t.key)} className={`tab${t.key === active ? " on" : ""}`}
              aria-current={t.key === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Lifecycle: stepper, phase, health                                     */
/* ------------------------------------------------------------------ */

export function LifecycleStepper({ lifecycle, compact }: { lifecycle?: Lifecycle | null; compact?: boolean }) {
  const current = lifecycle?.phaseIndex ?? 0;
  const failed = lifecycle && (lifecycle.health === "failed" || lifecycle.health === "blocked");
  const rejected = lifecycle?.outcome === "rejected";
  return (
    <ol className={`stepper${compact ? " compact" : ""}`} aria-label="Lifecycle">
      {PHASES.map((p, i) => {
        const done = i < current || (i === current && lifecycle?.phase === "done" && !rejected);
        const isCurrent = i === current && !done;
        const state = done ? "done" : isCurrent ? (failed ? "attention" : rejected ? "closed" : "current") : "todo";
        return (
          <li key={p.key} className={`step ${state}`} aria-current={isCurrent ? "step" : undefined}>
            <span className="step-dot" aria-hidden="true">{done ? "✓" : isCurrent ? (failed ? "!" : "●") : ""}</span>
            <span className="step-label">{p.label}</span>
            <span className="sr-only">{done ? "(complete)" : isCurrent ? "(current)" : "(not started)"}</span>
          </li>
        );
      })}
    </ol>
  );
}

const HEALTH_ICON: Record<Health, string> = {
  in_progress: "◐", waiting_decision: "◆", waiting: "○", blocked: "■", failed: "!", done: "✓", closed: "–",
};
const HEALTH_TONE: Record<Health, string> = {
  in_progress: "info", waiting_decision: "brand", waiting: "neutral", blocked: "stop", failed: "stop", done: "ok", closed: "neutral",
};

/** Health: icon + words, never colour alone. */
export function HealthIndicator({ lifecycle }: { lifecycle?: Lifecycle | null }) {
  if (!lifecycle) return <span className="health neutral">—</span>;
  const label = lifecycle.outcome === "rejected" ? "Not proceeding"
    : lifecycle.outcome === "resolved_without_change" ? "Resolved without change" : lifecycle.healthLabel;
  return (
    <span className={`health ${HEALTH_TONE[lifecycle.health]}`}>
      <span className="health-icon" aria-hidden="true">{HEALTH_ICON[lifecycle.health]}</span>{label}
    </span>
  );
}

export function PhaseLabel({ lifecycle }: { lifecycle?: Lifecycle | null }) {
  if (!lifecycle) return <span className="phase">—</span>;
  return <span className={`phase p-${lifecycle.phase}`}>{lifecycle.phaseLabel}</span>;
}

export function phaseLabel(p: Phase): string {
  return PHASES.find((x) => x.key === p)?.label ?? p;
}

/** "Next: Product Owner — approve the solution" in one line (lists, My Work). */
export function NextActionLine({ lifecycle }: { lifecycle?: Lifecycle | null }) {
  if (!lifecycle) return null;
  const na = lifecycle.nextAction;
  if (lifecycle.phase === "done") return <span className="nextline muted">{na.summary}</span>;
  return (
    <span className="nextline">
      {na.owner !== "none" && <strong>{na.owner === "jade" ? "JADE" : na.ownerLabel}: </strong>}
      {na.summary}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Business context                                                      */
/* ------------------------------------------------------------------ */

/** Priority as Jade's agents assessed it from the stated business impact. */
export function ImpactIndicator({ change, showAreas }: { change: Change; showAreas?: boolean }) {
  const bi = change.businessImpact;
  const areas = [
    ["Financial", bi.financialImpact], ["Operational", bi.operationalReach], ["Compliance", bi.riskCompliance],
    ["Strategic", bi.strategicAlignment], ["Time-critical", bi.urgency],
  ].filter(([, v]) => v && String(v).trim()).map(([k]) => k as string);
  return (
    <span className={`impact i-${change.priority.toLowerCase()}`}>
      <span className="impact-bars" aria-hidden="true"><i /><i /><i /></span>
      {change.priority} priority
      {showAreas && areas.length > 0 && <span className="impact-areas"> · {areas.join(", ")}</span>}
    </span>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const DEMO_PREFIX = /^\s*(SYNTHETIC|SCRIPTED STAND-IN)\s*:\s*/i;

/** "As a <role>, I want <want>, so that <benefit>" -> its parts (any may be missing). */
export function parseStory(statement?: string | null): { role?: string; want?: string; benefit?: string } {
  const st = (statement ?? "").replace(DEMO_PREFIX, "").trim();
  const m = st.match(/^as (?:an? |the )?(.+?),\s*i (?:want|need)(?: to)?\s+(.+?)(?:,?\s+so that\s+(.+?))?\.?$/i);
  if (!m) return {};
  return { role: m[1], want: m[2], benefit: m[3] };
}

/**
 * The story's title in business words. A title that is just the start of
 * the user-story sentence ("As the returns coordinator, I want ...") reads
 * better as what is wanted: "Every dealer return carries ...".
 */
export function storyTitle(c: Change): string {
  const title = cap((c.title ?? "").replace(DEMO_PREFIX, "").trim());
  if (title && !/^as (an? |the )?.+?, ?i (want|need)/i.test(title)) return title;
  const want = parseStory(c.userStory?.statement ?? title).want;
  if (want) return cap(want);
  return title || c.userStory?.statement || c.id;
}

/** The expected benefit: the user story's "so that". */
export function businessNeed(c: Change): string | undefined {
  const b = parseStory(c.userStory?.statement).benefit;
  return b ? cap(b) + "." : undefined;
}

/** The business need in plain words: the story's business context, or what is wanted and by whom. */
export function needText(c: Change): string {
  const ctx = c.userStory?.businessContext?.trim();
  if (ctx) return ctx;
  const p = parseStory(c.userStory?.statement);
  if (p.want) return `${p.role ? `The ${p.role} needs ` : ""}${p.role ? p.want : cap(p.want)}.`;
  return (c.userStory?.statement ?? c.originalRequest).replace(DEMO_PREFIX, "");
}

export function sourceLabel(c: Change): string {
  const src = c.source === "Support / Topdesk" ? "Topdesk" : c.source;
  const ref = c.sourceReference?.trim();
  if (!ref) return src;
  return ref.toLowerCase().startsWith(src.toLowerCase()) ? ref : `${src} ${ref}`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * What needs a person, grouped the way My Work shows it: decisions, other
 * tasks, and new requests (grouped as one item). The bell counts the same.
 */
export function attentionOf(work: MyWork | null | undefined) {
  const items = work?.needsYou ?? [];
  const decisions = items.filter((c) => c.lifecycle?.nextAction.kind === "decision");
  const tasks = items.filter((c) => c.lifecycle?.nextAction.kind !== "decision");
  const newRequests = tasks.filter((c) => c.lifecycle?.nextAction.action === "start_analysis");
  const otherTasks = tasks.filter((c) => !newRequests.includes(c));
  return { decisions, otherTasks, newRequests, count: decisions.length + otherTasks.length + (newRequests.length ? 1 : 0) };
}
