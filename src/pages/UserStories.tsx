import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import type { BusinessDomain, Change, ChangeSource, DomainReview, DomainReviewStage, UserStory } from "../types/domain";
import type { NavTarget } from "../types/nav";
import {
  ChangeGrid,
  FilterBar,
  useChangeListControls,
  type GridColumn,
} from "../components/WorkQueue";
import {
  ApiNote,
  ConfirmDialog,
  DOMAIN_STAGE_LABEL,
  FlowSteps,
  Loading,
  NotStated,
  Provenance,
  StateBadge,
  stateLabel,
} from "../components/ui";

const SOURCES: ChangeSource[] = ["Business", "Support / Topdesk", "Optimisation", "DevOps"];
const STEPS = ["Received", "Refining", "Backlog ready"];

const RUNNING_STAGES = ["receiving", "improving", "checking"] as const;
const STAGE_LABEL: Record<string, string> = {
  receiving: "Receive Agent running…",
  improving: "Improve Agent running…",
  checking: "Check Agent running…",
};

const PRE_DOMAIN_OWNER_APPROVAL = new Set<DomainReviewStage>([
  "ready_for_domain_owner", "domain_owner_reviewing", "domain_owner_requested_revision", "reviewer_agent_refining",
]);

type View = "all" | "requests" | "review";

const VIEW_COPY: Record<View, { title: string; sub: string; empty: string }> = {
  all: {
    title: "User Stories",
    sub: "Every request and the story Jade has written for it, at any stage.",
    empty: "No user stories yet. Create a change request to start.",
  },
  requests: {
    title: "Requests",
    sub: "Incoming requests that haven't been turned into a User Story yet.",
    empty: "No incoming requests waiting.",
  },
  review: {
    title: "User Story Review",
    sub: "Backlog-ready stories still awaiting Domain Owner approval.",
    empty: "Nothing is currently awaiting Domain Owner approval.",
  },
};

function baseListFor(view: View, all: Change[]): Change[] {
  if (view === "requests") return all.filter((c) => c.state === "RECEIVED");
  if (view === "review") {
    return all.filter(
      (c) => c.state === "BACKLOG_READY" && (!c.domainReviewStage || PRE_DOMAIN_OWNER_APPROVAL.has(c.domainReviewStage))
    );
  }
  return all;
}

export function UserStories({ onOpenChange, navFilter, navToken }: { onOpenChange: (id: string) => void } & NavTarget) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"approve" | "sendback" | null>(null);

  const [title, setTitle] = useState("");
  const [source, setSource] = useState<ChangeSource>("Support / Topdesk");
  const [ref, setRef] = useState("");
  const [request, setRequest] = useState("");

  const [view, setView] = useState<View>("all");
  const [domainFilter, setDomainFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [allDomains, setAllDomains] = useState<BusinessDomain[]>([]);

  // Business domain governance (Increment: domain-aware governance).
  const [domainReview, setDomainReview] = useState<DomainReview | null>(null);
  const [domainBusy, setDomainBusy] = useState(false);
  const [reviewerName, setReviewerName] = useState(() => localStorage.getItem("ciq_approver") ?? "");
  const [editForm, setEditForm] = useState<UserStory | null>(null);
  const [editNote, setEditNote] = useState("");
  const [domainDialog, setDomainDialog] = useState(false);

  const reload = () => api.listChanges().then(setChanges);
  useEffect(() => { reload(); api.listBusinessDomains().then(setAllDomains); }, []);

  // Dashboard / other pages navigate here with a preset view (and
  // optionally a business domain to pre-filter to).
  useEffect(() => {
    if (!navFilter) return;
    if (navFilter.view === "all" || navFilter.view === "requests" || navFilter.view === "review") {
      setView(navFilter.view);
    }
    setDomainFilter(navFilter.domainId ?? "");
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navToken]);

  const domainsById = useMemo(() => new Map(allDomains.map((d) => [d.id, d])), [allDomains]);
  const domainFor = (c: Change) => (c.businessDomainId ? domainsById.get(c.businessDomainId) : undefined);

  const scoped = useMemo(() => baseListFor(view, changes ?? []), [view, changes]);
  const statusOptions = useMemo(
    () => Array.from(new Set(scoped.map((c) => c.state))).map((s) => ({ value: s, label: stateLabel(s) })),
    [scoped]
  );

  const columns: GridColumn[] = [
    { key: "id", header: "ID", render: (c) => <span className="mono">{c.id}</span>, sortValue: (c) => c.id },
    { key: "title", header: "Title", render: (c) => c.title, sortValue: (c) => c.title },
    { key: "domain", header: "Business Domain", render: (c) => domainFor(c)?.name ?? <NotStated />, sortValue: (c) => domainFor(c)?.name ?? "" },
    { key: "apqc", header: "APQC code", render: (c) => domainFor(c)?.apqcCode ? <span className="mono">{domainFor(c)!.apqcCode}</span> : "—" },
    { key: "status", header: "Status", render: (c) => <StateBadge state={c.state} /> },
    { key: "owner", header: "Domain Owner", render: (c) => domainFor(c)?.domainOwner || <NotStated /> },
    { key: "source", header: "Request source", render: (c) => `${c.source}${c.sourceReference ? " · " + c.sourceReference : ""}` },
    { key: "updated", header: "Updated", render: (c) => new Date(c.updatedAt).toLocaleDateString("en-GB"), sortValue: (c) => c.updatedAt },
  ];

  const { search, setSearch, sortKey, sortDir, onSortChange, filtered } = useChangeListControls(
    scoped, columns, (c) => `${c.id} ${c.title}`
  );
  const gridRows = filtered.filter(
    (c) => (!domainFilter || c.businessDomainId === domainFilter) && (!statusFilter || c.state === statusFilter)
  );

  useEffect(() => {
    setSelectedId((cur) => (cur && gridRows.some((c) => c.id === cur) ? cur : gridRows[0]?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRows.length, view]);

  const selected = changes?.find((c) => c.id === selectedId) ?? null;
  const stepIndex = selected
    ? selected.state === "RECEIVED" ? 0 : selected.state === "REFINING" ? 1 : 2
    : 0;

  // Real Receive/Improve/Check runs happen on the backend and can take
  // minutes (they're real model calls) -- enhanceStory() below only
  // starts the run. While it's active, poll for progress rather than
  // block the UI on one long request.
  const runningStage = selected?.processingStage;
  useEffect(() => {
    if (!selected || !runningStage || !(RUNNING_STAGES as readonly string[]).includes(runningStage)) return;
    const id = selected.id;
    const timer = setInterval(async () => {
      const updated = await api.getChange(id);
      if (!updated) return;
      setChanges((cur) => cur?.map((c) => (c.id === id ? updated : c)) ?? cur);
    }, 2000);
    return () => clearInterval(timer);
  }, [selected?.id, runningStage]);

  async function createStory() {
    if (!title.trim() || !request.trim()) return;
    setBusy(true);
    const created = await api.createChange({
      title: title.trim(), source, sourceReference: ref.trim(), originalRequest: request.trim(),
    });
    setTitle(""); setRef(""); setRequest(""); setCreating(false);
    await reload();
    setView("all");
    setSelectedId(created.id);
    setBusy(false);
  }

  async function enhance() {
    if (!selected) return;
    setBusy(true);
    await api.enhanceStory(selected.id);
    await reload();
    setBusy(false);
  }

  // Domain governance starts once a story has reached the backlog —
  // reviewing something still mid-Receive/Improve/Check would be
  // reviewing a moving target.
  const governable = selected && selected.userStory && selected.state !== "RECEIVED" && selected.state !== "REFINING";
  useEffect(() => {
    if (!governable) { setDomainReview(null); setEditForm(null); return; }
    api.getDomainReview(selected!.id).then((r) => setDomainReview(r ?? null));
    setEditForm(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.state]);

  const latestStory = domainReview?.history[domainReview.history.length - 1]?.userStory;

  async function assignDomain(value: string) {
    if (!selected) return;
    setDomainBusy(true);
    const updated =
      value === "uncertain"
        ? await api.assignBusinessDomain(selected.id, { uncertain: true, note: "Marked uncertain by reviewer." })
        : await api.assignBusinessDomain(selected.id, { businessDomainId: value || undefined });
    setDomainReview(updated);
    setChanges((cur) => cur?.map((c) => (c.id === selected.id ? { ...c, businessDomainId: updated.businessDomainId, domainReviewStage: updated.stage } : c)) ?? cur);
    setDomainBusy(false);
  }

  async function startDomainReview() {
    if (!selected) return;
    setDomainBusy(true);
    const updated = await api.startDomainOwnerReview(selected.id, { decidedBy: reviewerName, note: "" });
    setDomainReview(updated);
    setDomainBusy(false);
  }

  function beginEdit() {
    if (latestStory) setEditForm(JSON.parse(JSON.stringify(latestStory)));
  }

  async function submitEdit() {
    if (!selected || !editForm) return;
    setDomainBusy(true);
    try {
      const updated = await api.submitDomainOwnerEdit(selected.id, {
        editedBy: reviewerName, note: editNote, userStory: editForm,
      });
      setDomainReview(updated);
      setEditForm(null);
      setEditNote("");
    } finally {
      setDomainBusy(false);
    }
  }

  const copy = VIEW_COPY[view];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{copy.title}</h1>
          <div className="sub">{copy.sub}</div>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>New change request</button>
      </div>

      {creating && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>New change request</h2>
          <div className="grid halves">
            <div>
              <div className="field">
                <label htmlFor="t">Short title</label>
                <input id="t" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Update SO default document type" />
              </div>
              <div className="field">
                <label htmlFor="s">Where did this come from?</label>
                <select id="s" value={source} onChange={(e) => setSource(e.target.value as ChangeSource)}>
                  {SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="r">Reference <span className="hint">(ticket number, email, meeting)</span></label>
                <input id="r" type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. Topdesk #4521" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="req">The request, in the requester's own words</label>
              <textarea id="req" value={request} onChange={(e) => setRequest(e.target.value)}
                placeholder="Paste the ticket text or note exactly as it was written. Don't tidy it up — Jade works better with the original wording." />
            </div>
          </div>
          <div className="btnrow">
            <button className="btn primary" disabled={!title.trim() || !request.trim() || busy} onClick={createStory}>
              Create story
            </button>
            <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
          </div>
          <ApiNote endpoint="POST /changes" />
        </section>
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by ID or title"
        selects={[
          { key: "view", label: "View", value: view, onChange: (v) => setView(v as View), options: [
            { value: "all", label: "All User Stories" },
            { value: "requests", label: "Requests (not yet refined)" },
            { value: "review", label: "Awaiting Domain Owner Approval" },
          ] },
          { key: "domain", label: "Business Domain", value: domainFilter, onChange: setDomainFilter, options: [
            { value: "", label: "All domains" },
            ...allDomains.map((d) => ({ value: d.id, label: d.name })),
          ] },
          { key: "status", label: "Status", value: statusFilter, onChange: setStatusFilter, options: [
            { value: "", label: "All statuses" },
            ...statusOptions,
          ] },
        ]}
        onClear={() => { setSearch(""); setDomainFilter(""); setStatusFilter(""); }}
      />

      {!changes ? <Loading what="stories" /> : (
        <section className="panel" style={{ marginBottom: 16 }}>
          <ChangeGrid
            changes={gridRows}
            columns={columns}
            onRowClick={setSelectedId}
            selectedId={selectedId}
            emptyMessage={copy.empty}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
          <ApiNote endpoint="GET /changes" />
        </section>
      )}

      {selected && (
        <div className="stack">
          <section className="panel">
            <FlowSteps steps={STEPS} currentIndex={stepIndex} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{selected.title}</h2>
                <div className="mono" style={{ color: "var(--muted)" }}>
                  {selected.id} · {selected.source} · {selected.sourceReference || "no reference"}
                </div>
              </div>
              <StateBadge state={selected.state} />
            </div>

            <div style={{ marginTop: 16 }}>
              <Provenance kind="plain" label="Original request — as submitted">
                <div style={{ fontSize: 13.5 }}>{selected.originalRequest}</div>
              </Provenance>
            </div>

            {!selected.userStory && (
              <div className="btnrow" style={{ marginTop: 16, alignItems: "center" }}>
                {runningStage && (RUNNING_STAGES as readonly string[]).includes(runningStage) ? (
                  <>
                    <span className="badge warn">{STAGE_LABEL[runningStage]}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      Real agents are running — this can take a few minutes.
                    </span>
                  </>
                ) : (
                  <>
                    <button className="btn primary" onClick={enhance} disabled={busy}>
                      {busy ? "Starting…" : "Enhance story"}
                    </button>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      Runs Receive → Improve → Check on the request above.
                    </span>
                  </>
                )}
              </div>
            )}
            {selected.processingStage === "failed" && (
              <div className="callout" style={{ marginTop: 14 }}>
                <strong>Enhancement failed</strong>
                {selected.processingError || "Something went wrong running the agents."}
              </div>
            )}
            <ApiNote endpoint="POST /changes/{id}/enhance" />
          </section>

          {selected.userStory && (
            <section className="panel">
              <h2>Enhanced story</h2>
              <Provenance kind="ai">
                <p style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 700 }}>
                  {selected.userStory.statement}
                </p>
                <p style={{ margin: 0, fontSize: 13.5 }}>{selected.userStory.businessContext}</p>
              </Provenance>

              <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Acceptance criteria</h3>
              {selected.userStory.acceptanceCriteria.length === 0 ? (
                <div className="empty" style={{ padding: 20 }}>
                  None yet — the story cannot pass the quality gate without testable criteria.
                </div>
              ) : (
                <table className="data">
                  <thead><tr><th>#</th><th>Criterion</th><th>Verified by</th></tr></thead>
                  <tbody>
                    {selected.userStory.acceptanceCriteria.map((ac) => (
                      <tr key={ac.id}>
                        <td className="mono">{ac.id}</td>
                        <td>{ac.text}</td>
                        <td className="mono">{ac.verifiedBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Test script</h3>
              {selected.userStory.testScript.length === 0 ? (
                <div className="empty" style={{ padding: 20 }}>No test steps yet.</div>
              ) : (
                <table className="data">
                  <thead><tr><th>#</th><th>Action</th><th>Expected result</th></tr></thead>
                  <tbody>
                    {selected.userStory.testScript.map((t) => (
                      <tr key={t.id}>
                        <td className="mono">{t.id}</td><td>{t.action}</td><td>{t.expected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selected.userStory.openQuestions.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Still missing</h3>
                  <Provenance kind="ai" label="Jade could not answer these from the request">
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                      {selected.userStory.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                  </Provenance>
                </>
              )}

              <div className="btnrow" style={{ marginTop: 18 }}>
                <button
                  className="btn primary"
                  disabled={selected.userStory.qualityStatus !== "passed" || selected.state === "BACKLOG_READY"}
                  onClick={() => setDialog("approve")}
                >
                  Approve for backlog
                </button>
                <button className="btn" onClick={() => setDialog("sendback")}>Send back for clarification</button>
                {selected.userStory.qualityStatus !== "passed" && (
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    The quality gate has not passed this story yet.
                  </span>
                )}
              </div>
            </section>
          )}

          {governable && domainReview && (
            <section className="panel">
              <h2>Business domain &amp; Domain Owner review</h2>

              <div className="grid halves">
                <div className="field">
                  <label htmlFor="domainpick">Business domain</label>
                  <select
                    id="domainpick"
                    value={domainReview.domainClassificationUncertain ? "uncertain" : domainReview.businessDomainId ?? ""}
                    onChange={(e) => assignDomain(e.target.value)}
                    disabled={domainBusy}
                  >
                    <option value="">— not yet classified —</option>
                    {allDomains.map((d) => (
                      <option key={d.id} value={d.id}>{d.apqcCode} · {d.name}</option>
                    ))}
                    <option value="uncertain">Classification uncertain</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Governance stage</div>
                  <div style={{ marginTop: 6 }}>
                    <span className="badge info">{DOMAIN_STAGE_LABEL[domainReview.stage] ?? domainReview.stage}</span>
                  </div>
                </div>
              </div>

              {domainReview.domainClassificationUncertain && (
                <div className="callout" style={{ marginTop: 12 }}>
                  <strong>Classification uncertain</strong>
                  {domainReview.domainClassificationNote || "Exposed honestly rather than forced into a domain that doesn't fit."}
                </div>
              )}

              <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Story history</h3>
              <div style={{ display: "grid", gap: 12 }}>
                {domainReview.history.map((v, i) => (
                  <Provenance
                    key={i}
                    kind={v.label === "domain_owner_edit" ? "human" : "ai"}
                    label={
                      v.label === "ai_generated" ? "AI-generated — original enhanced story"
                        : v.label === "domain_owner_edit" ? `Domain Owner edit by ${v.actor}`
                        : "Reviewer Agent — revised version"
                    }
                  >
                    <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13.5 }}>{v.userStory.statement}</p>
                    {v.note && <p style={{ margin: 0, fontSize: 13 }}>{v.note}</p>}
                  </Provenance>
                ))}
              </div>

              <div className="btnrow" style={{ marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
                {domainReview.stage === "ready_for_domain_owner" && (
                  <>
                    <input
                      type="text"
                      value={reviewerName}
                      onChange={(e) => {
                        setReviewerName(e.target.value);
                        localStorage.setItem("ciq_approver", e.target.value.trim());
                      }}
                      placeholder="Your name (Domain Owner)"
                      style={{ maxWidth: 220 }}
                    />
                    <button className="btn primary" disabled={!reviewerName.trim() || domainBusy} onClick={startDomainReview}>
                      Start Domain Owner review
                    </button>
                  </>
                )}

                {domainReview.stage === "domain_owner_reviewing" && !editForm && (
                  <>
                    <button className="btn" onClick={beginEdit} disabled={domainBusy}>Edit story</button>
                    <button className="btn primary" disabled={domainBusy || !reviewerName.trim()} onClick={() => setDomainDialog(true)}>
                      Approve as Domain Owner
                    </button>
                  </>
                )}

                {domainReview.stage === "reviewer_agent_refining" && (
                  <span className="badge warn">Reviewer Agent refining…</span>
                )}
              </div>

              {editForm && (
                <div className="panel" style={{ marginTop: 16, background: "var(--wash)" }}>
                  <h3 style={{ fontSize: 14, marginTop: 0 }}>Edit user story</h3>
                  <div className="field">
                    <label htmlFor="editstatement">Statement</label>
                    <textarea
                      id="editstatement"
                      value={editForm.statement}
                      onChange={(e) => setEditForm({ ...editForm, statement: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="editcontext">Business context</label>
                    <textarea
                      id="editcontext"
                      value={editForm.businessContext}
                      onChange={(e) => setEditForm({ ...editForm, businessContext: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Acceptance criteria</label>
                    {editForm.acceptanceCriteria.map((ac, i) => (
                      <div key={ac.id} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                        <span className="mono" style={{ minWidth: 32 }}>{ac.id}</span>
                        <input
                          type="text"
                          value={ac.text}
                          style={{ flex: 1 }}
                          onChange={(e) => {
                            const next = [...editForm.acceptanceCriteria];
                            next[i] = { ...ac, text: e.target.value };
                            setEditForm({ ...editForm, acceptanceCriteria: next });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="field">
                    <label htmlFor="editnote">Note to the Reviewer Agent</label>
                    <textarea
                      id="editnote"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="What should the Reviewer Agent check or tighten?"
                    />
                  </div>
                  <div className="btnrow">
                    <button className="btn primary" disabled={domainBusy} onClick={submitEdit}>
                      {domainBusy ? "Reviewer Agent refining…" : "Submit to Reviewer Agent"}
                    </button>
                    <button className="btn" onClick={() => setEditForm(null)} disabled={domainBusy}>Cancel</button>
                  </div>
                </div>
              )}

              {(domainReview.stage === "domain_owner_approved" || domainReview.stage === "ready_for_application_manager") && (
                <div className="callout" style={{ marginTop: 16 }}>
                  <strong>Approved by the Domain Owner</strong>
                  The business requirement is approved — this does not authorise implementation. It's
                  now ready for the Application Manager to admit into the Delivery Queue, on the
                  Approval &amp; Backlog page.
                </div>
              )}
              {domainReview.stage === "application_manager_approved" && (
                <div className="callout" style={{ marginTop: 16 }}>
                  <strong>Approved and queued for delivery</strong>
                  The Application Manager has added this to the Delivery Queue.
                </div>
              )}

              <ApiNote endpoint="GET /changes/{id}/domain-review" />
            </section>
          )}

          <section className="panel">
            <h2>Business impact <span className="qualifier">— used at backlog review</span></h2>
            <dl className="facts">
              <dt>Financial impact</dt><dd>{selected.businessImpact.financialImpact || <NotStated />}</dd>
              <dt>Operational reach</dt><dd>{selected.businessImpact.operationalReach || <NotStated />}</dd>
              <dt>Risk &amp; compliance</dt><dd>{selected.businessImpact.riskCompliance || <NotStated />}</dd>
              <dt>Strategic alignment</dt><dd>{selected.businessImpact.strategicAlignment || <NotStated />}</dd>
              <dt>Urgency</dt><dd>{selected.businessImpact.urgency || <NotStated />}</dd>
            </dl>
            <div className="apinote">
              Blank means the requester did not say — recorded honestly rather than guessed.
            </div>
          </section>

          <div className="btnrow">
            <button className="linkish" onClick={() => onOpenChange(selected.id)}>Open full change detail →</button>
          </div>
        </div>
      )}

      {dialog && selected && (
        <ConfirmDialog
          title={dialog === "approve" ? "Approve this story for the backlog?" : "Send this story back?"}
          intro={
            <>
              <p style={{ marginTop: 0 }}><strong>{selected.title}</strong> ({selected.id})</p>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{selected.userStory?.statement}</p>
            </>
          }
          whatHappensNext={
            dialog === "approve"
              ? "It joins the backlog for Domain Owner and Application Manager review. Nothing reaches JD Edwards yet."
              : "It returns to enhancement with your reason attached, so the gap can be filled."
          }
          confirmLabel={dialog === "approve" ? "Approve for backlog" : "Send back"}
          tone={dialog === "approve" ? "primary" : "danger"}
          requireNote={dialog === "sendback"}
          onCancel={() => setDialog(null)}
          onConfirm={async (decidedBy, note) => {
            setDialog(null); setBusy(true);
            if (dialog === "approve") await api.approveStoryForBacklog(selected.id, { decidedBy, note });
            else await api.sendStoryBack(selected.id, { decidedBy, note });
            await reload(); setBusy(false);
          }}
        />
      )}

      {domainDialog && selected && domainReview && (
        <ConfirmDialog
          title="Approve this story as Domain Owner?"
          intro={
            <>
              <p style={{ marginTop: 0 }}><strong>{selected.title}</strong> ({selected.id})</p>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{latestStory?.statement}</p>
            </>
          }
          whatHappensNext="The business requirement is approved. This does not authorise implementation — it becomes ready for the Application Manager to admit into the Delivery Queue, a separate decision."
          confirmLabel="Approve as Domain Owner"
          tone="primary"
          requireNote={false}
          onCancel={() => setDomainDialog(false)}
          onConfirm={async (decidedBy, note) => {
            setDomainDialog(false); setDomainBusy(true);
            const updated = await api.approveDomainOwnerStory(selected.id, { decidedBy, note });
            setDomainReview(updated);
            setDomainBusy(false);
          }}
        />
      )}
    </>
  );
}
