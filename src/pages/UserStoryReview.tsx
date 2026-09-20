import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { BusinessDomain, Change, DomainReview, DomainReviewStage, UserStory } from "../types/domain";
import { ChangeGrid, FilterBar, useChangeListControls, type GridColumn } from "../components/WorkQueue";
import { ConfirmDialog, Loading, NotStated, PriorityBadge } from "../components/ui";

const PRE_DOMAIN_OWNER_APPROVAL = new Set<DomainReviewStage>([
  "ready_for_domain_owner", "domain_owner_reviewing", "domain_owner_requested_revision", "reviewer_agent_refining",
]);

/**
 * User Story Review — the Domain Owner's own screen, and only that
 * decision: is this business requirement, as Jade has written it,
 * correct and worth doing? Everything else (agent provenance, version
 * history, endpoint plumbing) is here for someone who wants it, not in
 * the way of someone who doesn't.
 */
export function UserStoryReview() {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [domains, setDomains] = useState<BusinessDomain[]>([]);

  const [domainReview, setDomainReview] = useState<DomainReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewerName, setReviewerName] = useState(() => localStorage.getItem("ciq_approver") ?? "");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<UserStory | null>(null);
  const [editNote, setEditNote] = useState("");
  const [approveDialog, setApproveDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const reload = () => {
    api.listChanges().then((all) => {
      const queue = all.filter(
        (c) => c.state === "BACKLOG_READY" && (!c.domainReviewStage || PRE_DOMAIN_OWNER_APPROVAL.has(c.domainReviewStage))
      );
      setChanges(queue);
      setSelectedId((cur) => (cur && queue.some((c) => c.id === cur) ? cur : queue[0]?.id ?? null));
    });
    api.listBusinessDomains().then(setDomains);
  };
  useEffect(reload, []);

  const domainsById = new Map(domains.map((d) => [d.id, d]));

  const columns: GridColumn[] = [
    { key: "id", header: "ID", render: (c) => <span className="mono">{c.id}</span>, sortValue: (c) => c.id },
    { key: "title", header: "User Story", render: (c) => c.title, sortValue: (c) => c.title },
    { key: "priority", header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
    { key: "source", header: "Source", render: (c) => `${c.source}${c.sourceReference ? " · " + c.sourceReference : ""}` },
    { key: "updated", header: "Updated", render: (c) => new Date(c.updatedAt).toLocaleDateString("en-GB"), sortValue: (c) => c.updatedAt },
  ];

  const { search, setSearch, sortKey, sortDir, onSortChange, filtered: rows } = useChangeListControls(
    changes ?? [], columns, (c) => `${c.id} ${c.title}`
  );

  const selected = changes?.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    setEditing(false);
    setEditForm(null);
    setShowHistory(false);
    if (!selected) { setDomainReview(null); return; }
    api.getDomainReview(selected.id).then((r) => setDomainReview(r ?? null));
  }, [selected?.id]);

  // The review "starting" is bookkeeping (ready_for_domain_owner ->
  // domain_owner_reviewing), not a decision — do it the moment a named
  // Domain Owner opens the story, rather than making them click an
  // extra button before they can actually do anything.
  useEffect(() => {
    if (!selected || !domainReview || !reviewerName.trim()) return;
    if (domainReview.stage !== "ready_for_domain_owner") return;
    api.startDomainOwnerReview(selected.id, { decidedBy: reviewerName, note: "" }).then(setDomainReview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, domainReview?.stage, reviewerName]);

  const latestStory = domainReview?.history[domainReview.history.length - 1]?.userStory ?? selected?.userStory;
  const canDecide = domainReview?.stage === "domain_owner_reviewing";

  function beginEdit() {
    if (latestStory) {
      setEditForm(JSON.parse(JSON.stringify(latestStory)));
      setEditing(true);
    }
  }

  async function submitEdit() {
    if (!selected || !editForm) return;
    setBusy(true);
    try {
      const updated = await api.submitDomainOwnerEdit(selected.id, {
        editedBy: reviewerName, note: editNote, userStory: editForm,
      });
      setDomainReview(updated);
      setEditing(false);
      setEditForm(null);
      setEditNote("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>User Story Review</h1>
          <div className="sub">The Domain Owner's decision: is this the right business requirement?</div>
        </div>
        <div className="meta">{changes?.length ?? 0} awaiting review</div>
      </div>

      <div className="field" style={{ maxWidth: 260, marginBottom: 16 }}>
        <label htmlFor="reviewername">Reviewing as</label>
        <input
          id="reviewername" type="text" value={reviewerName}
          onChange={(e) => { setReviewerName(e.target.value); localStorage.setItem("ciq_approver", e.target.value.trim()); }}
          placeholder="Your name (Domain Owner)"
        />
      </div>

      {!changes ? <Loading what="stories awaiting review" /> : (
        <section className="panel" style={{ marginBottom: 16 }}>
          <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search by ID or title" selects={[]} />
          <ChangeGrid
            changes={rows}
            columns={columns}
            onRowClick={setSelectedId}
            selectedId={selectedId}
            emptyMessage="Nothing is currently awaiting Domain Owner review."
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </section>
      )}

      {selected && latestStory && (
        <div className="stack">
          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{selected.title}</h2>
                <div className="mono" style={{ color: "var(--muted)" }}>
                  {selected.id} · {selected.source} · {selected.sourceReference || "no reference"}
                  {domainReview?.businessDomainId && domainsById.get(domainReview.businessDomainId) && (
                    <> · {domainsById.get(domainReview.businessDomainId)!.name}</>
                  )}
                </div>
              </div>
              <PriorityBadge priority={selected.priority} />
            </div>
          </section>

          <section className="panel">
            <h2>Original request</h2>
            <p style={{ fontSize: 14, margin: 0 }}>{selected.originalRequest}</p>
          </section>

          <section className="panel">
            <h2>Proposed user story</h2>
            <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>{latestStory.statement}</p>
            <p style={{ margin: 0, fontSize: 14 }}>{latestStory.businessContext}</p>
          </section>

          <section className="panel">
            <h2>Acceptance criteria</h2>
            {latestStory.acceptanceCriteria.length === 0 ? (
              <div className="empty" style={{ padding: 16 }}>None recorded.</div>
            ) : (
              <table className="data">
                <thead><tr><th>#</th><th>Criterion</th></tr></thead>
                <tbody>
                  {latestStory.acceptanceCriteria.map((ac) => (
                    <tr key={ac.id}><td className="mono">{ac.id}</td><td>{ac.text}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel">
            <h2>Business test</h2>
            {latestStory.testScript.length === 0 ? (
              <div className="empty" style={{ padding: 16 }}>No test steps recorded.</div>
            ) : (
              <table className="data">
                <thead><tr><th>#</th><th>Action</th><th>Expected result</th></tr></thead>
                <tbody>
                  {latestStory.testScript.map((t) => (
                    <tr key={t.id}><td className="mono">{t.id}</td><td>{t.action}</td><td>{t.expected}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {latestStory.openQuestions.length > 0 && (
            <section className="panel">
              <h2>Questions &amp; assumptions</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {latestStory.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </section>
          )}

          <section className="panel">
            <h2>Business impact</h2>
            <dl className="facts">
              <dt>Financial impact</dt><dd>{selected.businessImpact.financialImpact || <NotStated />}</dd>
              <dt>Operational reach</dt><dd>{selected.businessImpact.operationalReach || <NotStated />}</dd>
              <dt>Risk &amp; compliance</dt><dd>{selected.businessImpact.riskCompliance || <NotStated />}</dd>
              <dt>Strategic alignment</dt><dd>{selected.businessImpact.strategicAlignment || <NotStated />}</dd>
              <dt>Urgency</dt><dd>{selected.businessImpact.urgency || <NotStated />}</dd>
            </dl>
          </section>

          <section className="panel">
            <h2>Your decision</h2>
            {!reviewerName.trim() ? (
              <div className="callout">Enter your name above to review this story.</div>
            ) : !canDecide ? (
              <div className="callout">
                <strong>{domainReview?.stage === "reviewer_agent_refining" ? "Reviewer Agent refining…" : "Not ready for a decision"}</strong>
                {domainReview?.stage === "reviewer_agent_refining"
                  ? "Your requested revision is being processed. This usually takes a few seconds."
                  : "This story has already moved past Domain Owner review."}
              </div>
            ) : editing ? (
              <div style={{ background: "var(--wash)", padding: 16, borderRadius: 8 }}>
                <h3 style={{ fontSize: 14, marginTop: 0 }}>Edit the story before requesting revision</h3>
                <div className="field">
                  <label htmlFor="editstatement">Statement</label>
                  <textarea id="editstatement" value={editForm!.statement}
                    onChange={(e) => setEditForm({ ...editForm!, statement: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="editcontext">Business context</label>
                  <textarea id="editcontext" value={editForm!.businessContext}
                    onChange={(e) => setEditForm({ ...editForm!, businessContext: e.target.value })} />
                </div>
                <div className="field">
                  <label>Acceptance criteria</label>
                  {editForm!.acceptanceCriteria.map((ac, i) => (
                    <div key={ac.id} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                      <span className="mono" style={{ minWidth: 32 }}>{ac.id}</span>
                      <input
                        type="text" value={ac.text} style={{ flex: 1 }}
                        onChange={(e) => {
                          const next = [...editForm!.acceptanceCriteria];
                          next[i] = { ...ac, text: e.target.value };
                          setEditForm({ ...editForm!, acceptanceCriteria: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="editnote">What should change?</label>
                  <textarea id="editnote" value={editNote} onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Tell the Reviewer Agent what to tighten or correct" />
                </div>
                <div className="btnrow">
                  <button className="btn primary" disabled={busy} onClick={submitEdit}>
                    {busy ? "Reviewer Agent refining…" : "Submit revision request"}
                  </button>
                  <button className="btn" disabled={busy} onClick={() => { setEditing(false); setEditForm(null); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="btnrow">
                <button className="btn primary" onClick={() => setApproveDialog(true)}>Approve</button>
                <button className="btn" onClick={beginEdit}>Request revision</button>
              </div>
            )}
          </section>

          <section className="panel">
            <button className="linkish" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "Hide" : "Show"} story history &amp; provenance
            </button>
            {showHistory && domainReview && (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {domainReview.history.map((v, i) => (
                  <div key={i} style={{ fontSize: 13, borderLeft: "3px solid var(--line-strong)", paddingLeft: 10 }}>
                    <div style={{ fontWeight: 700 }}>
                      {v.label === "ai_generated" ? "AI-generated — original enhanced story"
                        : v.label === "domain_owner_edit" ? `Domain Owner edit by ${v.actor}`
                        : "Reviewer Agent — revised version"}
                    </div>
                    <div>{v.userStory.statement}</div>
                    {v.note && <div style={{ color: "var(--muted)" }}>{v.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {approveDialog && selected && domainReview && (
        <ConfirmDialog
          title="Approve this story as Domain Owner?"
          intro={
            <>
              <p style={{ marginTop: 0 }}><strong>{selected.title}</strong> ({selected.id})</p>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{latestStory?.statement}</p>
            </>
          }
          whatHappensNext="The business requirement is approved. This does not authorise implementation — it becomes ready for the Application Manager to approve for delivery on Backlog Review, a separate decision."
          confirmLabel="Approve as Domain Owner"
          tone="primary"
          requireNote={false}
          onCancel={() => setApproveDialog(false)}
          onConfirm={async (decidedBy, note) => {
            setApproveDialog(false); setBusy(true);
            await api.approveDomainOwnerStory(selected.id, { decidedBy, note });
            reload();
            setBusy(false);
          }}
        />
      )}
    </>
  );
}
