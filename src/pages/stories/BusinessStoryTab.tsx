import { Fragment, useEffect, useState } from "react";
import { api } from "../../services/api";
import type { UserStory } from "../../types/domain";
import { AskJadePanel } from "../../components/AskJade";
import { ClassificationFacts } from "../../components/Classification";
import { DocumentCitations, RequestDocuments } from "../../components/RequestDocuments";
import { Details, ErrorState, Fact, Section, businessNeed, formatDateTime, useSessionInfo } from "../../components/design";
import { Link, useLocation } from "../../router";
import { StoryProcessPanel } from "../StoryProcess";
import type { StoryCtx } from "./storyContext";
import { IssueList } from "../../components/work";

const IMPACT_FIELDS: [keyof import("../../types/domain").BusinessImpact, string][] = [
  ["financialImpact", "Financial"], ["operationalReach", "Operational"], ["riskCompliance", "Risk & compliance"],
  ["strategicAlignment", "Strategic"], ["urgency", "Urgency"],
];

/**
 * The business story: where the need sits, what the business wants,
 * the impact and benefit, and how success is judged. The source request
 * is available, but secondary -- JADE's analysis is the point.
 */
export function BusinessStoryTab({ ctx }: { ctx: StoryCtx }) {
  const { change, domainReview } = ctx;
  const info = useSessionInfo();
  const { hash } = useLocation();
  // During story review the review's latest version is the one being decided; afterwards the story as
  // approved and refined (change.userStory) is authoritative.
  const reviewing = change.lifecycle?.phase === "story_review" || change.lifecycle?.phase === "understand";
  const latestReviewed = domainReview?.history[domainReview.history.length - 1]?.userStory;
  const us: UserStory | undefined = (reviewing ? latestReviewed : undefined) ?? change.userStory ?? latestReviewed;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UserStory | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const canRevise = domainReview?.stage === "domain_owner_reviewing" && info.has("domain_owner");

  useEffect(() => {
    if (hash === "revise" && canRevise && us && !editing) { setForm(JSON.parse(JSON.stringify(us))); setEditing(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, canRevise]);

  async function submitRevision() {
    if (!form) return;
    setBusy(true); setError(null);
    try {
      ctx.setDomainReview(await api.submitDomainOwnerEdit(change.id, { note, userStory: form }));
      setEditing(false); setForm(null); setNote(""); ctx.reload();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  const impacts = IMPACT_FIELDS.filter(([k]) => (change.businessImpact[k] ?? "").trim());
  const processes = ctx.process?.mapping?.status === "confirmed" ? ctx.process.mapping.refs : [];
  const benefit = businessNeed(change);

  return (
    <div className="storytab">
      {!us ? (
        <Section title="The request">
          <p className="lead">{change.originalRequest}</p>
          <p className="muted">JADE turns this into a structured user story once the analysis runs.</p>
          {change.processingError && <ErrorState error={new Error("JADE could not finish the analysis.")} title="Analysis did not finish" />}
        </Section>
      ) : (
        <div className="storygrid">
          <div className="storygrid-facts">
            <Fact label="Business domain">
              {info.domainName(change.businessDomainId) ?? <span className="muted">Not placed yet</span>}
              {domainReview?.domainClassificationUncertain && <div className="muted">Classification uncertain{domainReview.domainClassificationNote ? `: ${domainReview.domainClassificationNote}` : ""}</div>}
              {!domainReview?.domainClassificationUncertain && domainReview?.domainClassificationNote && <div className="muted">{domainReview.domainClassificationNote}</div>}
              <MoveDomain ctx={ctx} />
            </Fact>
            <Fact label="Process">
              {processes.length ? processes.map((r) => <div key={r.node_key}>{r.path.map((p) => p.name).join(" › ")}</div>)
                : <a href="#process">{ctx.process?.framework ? "Not confirmed yet — confirm below" : "No process framework active"}</a>}
            </Fact>
            <ClassificationFacts change={change} onSaved={ctx.reload} />
          </div>

          <IssueList change={change} onChange={() => ctx.reload()} kinds={["business"]} title="Questions for the business" />

          <Section title="User story">
            <p className="userstory">{us.statement}</p>
            {us.businessContext && <p>{us.businessContext}</p>}
            <DocumentCitations citations={us.documentCitations} />
          </Section>

          {benefit && <Section title="Expected benefit"><p>{benefit}</p></Section>}

          <Section title="Business impact">
            {impacts.length === 0 ? <p className="muted">The requester did not state the business impact. That is missing information, not zero impact.</p> : (
              <dl className="facts">{impacts.map(([k, label]) => <Fragment key={k}><dt>{label}</dt><dd>{change.businessImpact[k]}</dd></Fragment>)}</dl>
            )}
          </Section>

          <Section title="Acceptance criteria">
            {us.acceptanceCriteria.length === 0 ? <p className="muted">None yet. The story cannot pass JADE's quality check without testable criteria.</p> : (
              <ul className="checklist">{us.acceptanceCriteria.map((ac) => <li key={ac.id}><span className="mono muted">{ac.id}</span> {ac.text}</li>)}</ul>
            )}
          </Section>

          {us.businessRules.length > 0 && <Section title="Business rules"><ul className="compactlist">{us.businessRules.map((r, i) => <li key={i}>{r}</li>)}</ul></Section>}
          <Section title="Assumptions">
            {us.assumptions.length ? <ul className="compactlist">{us.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p className="muted">None.</p>}
          </Section>
          <Section title="Open questions">
            {us.openQuestions.length ? <ul className="compactlist">{us.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul> : <p className="muted">None.</p>}
          </Section>

          {us.testScript.length > 0 && (
            <Details summary={`Business test script (${us.testScript.length} steps)`}>
              <table className="data"><thead><tr><th>#</th><th>Action</th><th>Expected result</th></tr></thead>
                <tbody>{us.testScript.map((t) => <tr key={t.id}><td className="mono">{t.id}</td><td>{t.action}</td><td>{t.expected}</td></tr>)}</tbody></table>
            </Details>
          )}
        </div>
      )}

      {canRevise && (
        <Section id="revise" title="Request changes to the story" description="Edit what should change; JADE revises the story and it comes back to you.">
          {!editing ? (
            <button className="btn" onClick={() => { setForm(JSON.parse(JSON.stringify(us))); setEditing(true); }}>Edit the story</button>
          ) : form && (
            <div className="editform">
              <div className="field"><label htmlFor="ed-st">User story</label>
                <textarea id="ed-st" value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} /></div>
              <div className="field"><label htmlFor="ed-ctx">Business context</label>
                <textarea id="ed-ctx" value={form.businessContext} onChange={(e) => setForm({ ...form, businessContext: e.target.value })} /></div>
              <div className="field"><label>Acceptance criteria</label>
                {form.acceptanceCriteria.map((ac, i) => (
                  <div key={ac.id} className="acrow"><span className="mono">{ac.id}</span>
                    <input type="text" aria-label={`Acceptance criterion ${ac.id}`} value={ac.text} onChange={(e) => {
                      const next = [...form.acceptanceCriteria]; next[i] = { ...ac, text: e.target.value }; setForm({ ...form, acceptanceCriteria: next });
                    }} /></div>
                ))}</div>
              <div className="field"><label htmlFor="ed-note">What should change?</label>
                <textarea id="ed-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell JADE what to tighten or correct" /></div>
              <div className="btnrow">
                <button className="btn primary" disabled={busy} onClick={submitRevision}>{busy ? "Sending…" : "Send for revision"}</button>
                <button className="btn" disabled={busy} onClick={() => { setEditing(false); setForm(null); }}>Cancel</button>
              </div>
              {error !== null && <ErrorState error={error} title="Not sent" />}
            </div>
          )}
        </Section>
      )}

      {domainReview && (
        <div id="ask">
          <AskJadePanel
            currentStory={us}
            title="Ask JADE about this story"
            turns={domainReview.conversation}
            onAsk={async (question) => { ctx.setDomainReview(await api.askAboutRequirement(change.id, { question })); }}
            renderAmendmentActions={(turn) => canRevise ? (
              <button className="btn primary" onClick={() => {
                setForm(JSON.parse(JSON.stringify(turn.proposedUserStory)));
                setNote(`From Ask JADE: "${turn.question}"`); setEditing(true);
                document.getElementById("revise")?.scrollIntoView();
              }}>Review as a story change</button>
            ) : (
              <button className="btn" onClick={async () => {
                ctx.setDomainReview(await api.requestRequirementReconsideration(change.id, { note: `Flagged from Ask JADE: "${turn.question}"` }));
              }}>Ask the Domain Owner to reconsider</button>
            )}
          />
        </div>
      )}

      {us && (
        <Section id="process" title="Business process"
          description="Where this story sits in the business: the confirmed processes and the as-is and to-be maps. Maps support the story; the story stays the anchor.">
          <StoryProcessPanel storyId={change.id} onChanged={ctx.reload} />
        </Section>
      )}

      <Section title="Source">
        <p>{change.source}{change.sourceReference ? ` · ${change.sourceReference}` : ""} · received {formatDateTime(change.createdAt)}</p>
        <Details summary="View the original request" open={!us}>
          <blockquote className="original">{change.originalRequest}</blockquote>
          {change.sourceMetadata && Object.keys(change.sourceMetadata).length > 0 && (
            <dl className="facts">{Object.entries(change.sourceMetadata).map(([k, v]) => (
              <Fragment key={k}><dt>{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt><dd>{v}</dd></Fragment>))}</dl>
          )}
          <RequestDocuments requestId={change.id} />
        </Details>
      </Section>

      {domainReview && domainReview.history.length > 0 && (
        <Details summary={`Story versions (${domainReview.history.length})`}>
          <ol className="versions">{domainReview.history.map((v, i) => (
            <li key={i}><strong>{v.label === "ai_generated" ? "Written by JADE" : v.label === "domain_owner_edit" ? `Edited by ${v.actor}` : "Revised by JADE"}</strong>
              <div>{v.userStory.statement}</div>{v.note && <div className="muted">{v.note}</div>}</li>
          ))}</ol>
          <p className="muted">Decisions and approvals are under <Link to={`/stories/${encodeURIComponent(change.id)}/evidence`}>Evidence &amp; History</Link>.</p>
        </Details>
      )}
    </div>
  );
}


/**
 * The Domain Owner a story landed with (or the Application Manager, before
 * review starts) moves it to the domain it really belongs to; that domain's
 * owner then reviews it.
 */
function MoveDomain({ ctx }: { ctx: StoryCtx }) {
  const { change, domainReview } = ctx;
  const info = useSessionInfo();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const stage = domainReview?.stage;
  const manager = info.has("product_manager", "admin") && stage === "ready_for_domain_owner";
  const owner = info.has("domain_owner") && !!change.businessDomainId
    && (stage === "ready_for_domain_owner" || stage === "domain_owner_reviewing");
  if (!domainReview || !(manager || owner)) return null;
  const choices = info.domains.filter((d) => d.status === "active" && d.id !== change.businessDomainId);
  if (!open) return <button className="btn small" style={{ marginTop: 4 }} onClick={() => setOpen(true)}>{change.businessDomainId ? "Move to another domain" : "Place in a domain"}</button>;
  return (
    <div className="stack" style={{ marginTop: 6, gap: 6 }}>
      <select aria-label="New business domain" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">Choose a business domain…</option>
        {choices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <input aria-label="Why it belongs there" placeholder="Why it belongs there (optional)" value={why} onChange={(e) => setWhy(e.target.value)} />
      <div className="btnrow">
        <button className="btn small primary" disabled={busy || !target} onClick={async () => {
          setBusy(true); setError(null);
          try {
            ctx.setDomainReview(await api.assignBusinessDomain(change.id, { businessDomainId: target, note: why }));
            setOpen(false); ctx.reload();
          } catch (e) { setError(e); } finally { setBusy(false); }
        }}>{busy ? "Moving…" : "Move"}</button>
        <button className="btn small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {owner && <span className="hint">The story goes to that domain's owner and starts its review again.</span>}
      {error !== null && <ErrorState error={error} title="Not moved" />}
    </div>
  );
}
