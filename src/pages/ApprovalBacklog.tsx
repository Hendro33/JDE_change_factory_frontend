import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { BusinessDomain, Change, DomainReview } from "../types/domain";
import {
  ApiNote,
  ConfirmDialog,
  DOMAIN_STAGE_LABEL,
  Loading,
  NotStated,
  PriorityBadge,
  Provenance,
} from "../components/ui";

type Decision = "approve" | "reject" | "sendback";

export function ApprovalBacklog() {
  const [backlog, setBacklog] = useState<Change[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);

  const [domains, setDomains] = useState<BusinessDomain[]>([]);
  const [reviews, setReviews] = useState<Map<string, DomainReview>>(new Map());
  const [filterDomainId, setFilterDomainId] = useState("");
  const [filterApqcCode, setFilterApqcCode] = useState("");
  const [filterStage, setFilterStage] = useState("");

  const reload = () => api.getBacklog().then(async (b) => {
    setBacklog(b);
    setOpenId((cur) => (cur && b.some((c) => c.id === cur) ? cur : b[0]?.id ?? null));
    api.listBusinessDomains().then(setDomains);
    const pairs = await Promise.all(b.map(async (c) => [c.id, await api.getDomainReview(c.id)] as const));
    setReviews(new Map(pairs.filter((p): p is [string, DomainReview] => !!p[1])));
  });

  useEffect(() => { reload(); }, []);

  const domainsById = new Map(domains.map((d) => [d.id, d]));
  const apqcCodes = Array.from(new Set(domains.map((d) => d.apqcCode))).sort();

  const filtered = (backlog ?? []).filter((c) => {
    const review = reviews.get(c.id);
    if (filterDomainId && review?.businessDomainId !== filterDomainId) return false;
    if (filterApqcCode) {
      const domain = review?.businessDomainId ? domainsById.get(review.businessDomainId) : undefined;
      if (domain?.apqcCode !== filterApqcCode) return false;
    }
    if (filterStage && review?.stage !== filterStage) return false;
    return true;
  });

  const open = filtered.find((c) => c.id === openId) ?? null;
  const openReview = open ? reviews.get(open.id) : undefined;
  const readyForSprint = openReview?.stage === "ready_for_application_manager";

  const COPY: Record<Decision, { title: string; next: string; label: string; tone: "primary" | "danger"; note: boolean }> = {
    approve: {
      title: "Approve this change for the sprint/build (Application Manager)?",
      next: "The application backlog is approved to proceed toward build. The Architect then analyses it and proposes an exact change, which you approve separately before anything is written to JD Edwards.",
      label: "Approve for sprint", tone: "primary", note: false,
    },
    reject: {
      title: "Reject this change?",
      next: "The change is closed with your reason recorded. If the need stands, it re-enters as a fresh request.",
      label: "Reject", tone: "danger", note: true,
    },
    sendback: {
      title: "Send back for refinement?",
      next: "It returns to story enhancement with your reason attached.",
      label: "Send back", tone: "danger", note: true,
    },
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Approval &amp; backlog</h1>
          <div className="sub">
            You decide what is worth doing. Nothing proceeds without this decision.
          </div>
        </div>
        <div className="meta">{filtered.length} awaiting your review</div>
      </div>

      {backlog && backlog.length > 0 && (
        <div className="panel" style={{ marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="fdomain">Business domain</label>
            <select id="fdomain" value={filterDomainId} onChange={(e) => setFilterDomainId(e.target.value)}>
              <option value="">All domains</option>
              {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="fapqc">APQC process/domain code</label>
            <select id="fapqc" value={filterApqcCode} onChange={(e) => setFilterApqcCode(e.target.value)}>
              <option value="">All codes</option>
              {apqcCodes.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="fstage">Governance stage</label>
            <select id="fstage" value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
              <option value="">All stages</option>
              {Object.entries(DOMAIN_STAGE_LABEL).map(([stage, label]) => <option key={stage} value={stage}>{label}</option>)}
            </select>
          </div>
          {(filterDomainId || filterApqcCode || filterStage) && (
            <button className="linkish" onClick={() => { setFilterDomainId(""); setFilterApqcCode(""); setFilterStage(""); }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {!backlog ? <Loading what="the backlog" /> : filtered.length === 0 ? (
        <div className="empty">
          {backlog.length === 0
            ? "Nothing waiting for review. Stories arrive here once they pass the quality gate."
            : "No changes match the current filters."}
        </div>
      ) : (
        <div className="detailgrid">
          <div className="stack">
            {open && (
              <>
                <section className="panel">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ marginBottom: 4 }}>{open.title}</h2>
                      <div className="mono" style={{ color: "var(--muted)" }}>
                        {open.id} · {open.source} · {open.sourceReference || "no reference"} ·
                        raised {new Date(open.createdAt).toLocaleDateString("en-GB")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <PriorityBadge priority={open.priority} />
                      <span className="badge grey">Complexity: {open.complexitySignal}</span>
                      {openReview && (
                        <span className="badge info">
                          {openReview.domainClassificationUncertain
                            ? "Domain: uncertain"
                            : domainsById.get(openReview.businessDomainId ?? "")?.name ?? "Domain: unclassified"}
                        </span>
                      )}
                    </div>
                  </div>
                  {openReview && (
                    <div style={{ marginTop: 10 }}>
                      <span className="badge warn">{DOMAIN_STAGE_LABEL[openReview.stage] ?? openReview.stage}</span>
                    </div>
                  )}
                </section>

                <section className="panel">
                  <h2>What you are approving</h2>
                  <Provenance kind="plain" label="Original request — as submitted">
                    <div style={{ fontSize: 13.5 }}>{open.originalRequest}</div>
                  </Provenance>
                  {open.userStory && (
                    <div style={{ marginTop: 12 }}>
                      <Provenance kind="ai" label="Story written by the factory from that request">
                        <p style={{ margin: "0 0 10px", fontSize: 14.5, fontWeight: 700 }}>
                          {open.userStory.statement}
                        </p>
                        <p style={{ margin: 0, fontSize: 13.5 }}>{open.userStory.businessContext}</p>
                      </Provenance>
                    </div>
                  )}
                </section>

                <section className="panel">
                  <h2>Why it matters</h2>
                  <dl className="facts">
                    <dt>Financial impact</dt><dd>{open.businessImpact.financialImpact || <NotStated />}</dd>
                    <dt>Operational reach</dt><dd>{open.businessImpact.operationalReach || <NotStated />}</dd>
                    <dt>Risk &amp; compliance</dt><dd>{open.businessImpact.riskCompliance || <NotStated />}</dd>
                    <dt>Strategic alignment</dt><dd>{open.businessImpact.strategicAlignment || <NotStated />}</dd>
                    <dt>Urgency</dt><dd>{open.businessImpact.urgency || <NotStated />}</dd>
                    <dt>Complexity signal</dt>
                    <dd>
                      {open.complexitySignal}
                      <span style={{ color: "var(--muted)" }}> — a rough estimate, not a commitment. The Architect's analysis is the real answer.</span>
                    </dd>
                  </dl>
                  <div className="apinote">
                    Blank means the requester did not say. That is recorded honestly rather than
                    guessed — weigh it as missing information, not as zero impact.
                  </div>
                </section>

                {open.userStory && open.userStory.acceptanceCriteria.length > 0 && (
                  <section className="panel">
                    <h2>How success will be judged</h2>
                    <table className="data">
                      <thead><tr><th>#</th><th>Acceptance criterion</th></tr></thead>
                      <tbody>
                        {open.userStory.acceptanceCriteria.map((ac) => (
                          <tr key={ac.id}><td className="mono">{ac.id}</td><td>{ac.text}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}

                <section className="panel">
                  <h2>Your decision <span className="qualifier">— Application Manager</span></h2>
                  <div className="callout" style={{ marginBottom: 16 }}>
                    <strong>What happens next if you approve</strong>
                    The application backlog / sprint is approved to proceed toward build. The
                    Architect then analyses the JD Edwards estate and proposes an exact change,
                    which comes back to you for a separate approval. Approving here does not
                    authorise any write to JD Edwards.
                  </div>
                  {openReview && !readyForSprint && (
                    <div className="callout" style={{ marginBottom: 16 }}>
                      <strong>Waiting on the Domain Owner</strong>
                      This story is not yet ready for Application Manager approval — the Domain
                      Owner has not approved the business requirement yet ({DOMAIN_STAGE_LABEL[openReview.stage] ?? openReview.stage}).
                      Complete that review on the User story enhancement page first.
                    </div>
                  )}
                  <div className="btnrow">
                    <button
                      className="btn primary"
                      onClick={() => setDialog("approve")}
                      disabled={busy || (!!openReview && !readyForSprint)}
                    >
                      Approve for sprint
                    </button>
                    <button className="btn" onClick={() => setDialog("sendback")} disabled={busy}>Send back for refinement</button>
                    <button className="btn danger" onClick={() => setDialog("reject")} disabled={busy}>Reject</button>
                  </div>
                  <ApiNote endpoint="POST /changes/{id}/domain-review/application-manager-approve" />
                </section>
              </>
            )}
          </div>

          <aside className="panel">
            <h2>Awaiting review</h2>
            <table className="data">
              <tbody>
                {filtered.map((c) => {
                  const review = reviews.get(c.id);
                  return (
                    <tr key={c.id} className="clickable"
                      style={c.id === openId ? { background: "var(--wash)" } : undefined}
                      onClick={() => setOpenId(c.id)}>
                      <td>
                        <div className="mono" style={{ color: "var(--muted)" }}>{c.id}</div>
                        <div>{c.title}</div>
                        <div style={{ marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <PriorityBadge priority={c.priority} />
                          <span className="badge grey">Complexity: {c.complexitySignal}</span>
                          {review && review.stage === "ready_for_application_manager" && (
                            <span className="badge ok">Ready for you</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ApiNote endpoint="GET /backlog" />
          </aside>
        </div>
      )}

      {dialog && open && (
        <ConfirmDialog
          title={COPY[dialog].title}
          intro={
            <>
              <p style={{ marginTop: 0 }}><strong>{open.title}</strong> ({open.id})</p>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{open.userStory?.statement ?? open.originalRequest}</p>
            </>
          }
          whatHappensNext={COPY[dialog].next}
          confirmLabel={COPY[dialog].label}
          tone={COPY[dialog].tone}
          requireNote={COPY[dialog].note}
          onCancel={() => setDialog(null)}
          onConfirm={async (decidedBy, note) => {
            setDialog(null); setBusy(true);
            if (dialog === "approve") await api.approveForSprint(open.id, { decidedBy, note });
            else if (dialog === "reject") await api.rejectChange(open.id, { decidedBy, note });
            else await api.sendStoryBack(open.id, { decidedBy, note });
            await reload(); setBusy(false);
          }}
        />
      )}
    </>
  );
}
