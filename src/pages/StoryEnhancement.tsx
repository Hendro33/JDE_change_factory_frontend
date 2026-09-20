import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { BusinessDomain, Change, ChangeSource, DomainReview, UserStory } from "../types/domain";
import {
  ApiNote,
  ConfirmDialog,
  DOMAIN_STAGE_LABEL,
  FlowSteps,
  Loading,
  NotStated,
  Provenance,
  StateBadge,
} from "../components/ui";

const SOURCES: ChangeSource[] = ["Business", "Support / Topdesk", "Optimisation", "DevOps"];
const STEPS = ["Received", "Refining", "Backlog ready"];

const RUNNING_STAGES = ["receiving", "improving", "checking"] as const;
const STAGE_LABEL: Record<string, string> = {
  receiving: "Receive Agent running…",
  improving: "Improve Agent running…",
  checking: "Check Agent running…",
};

export function StoryEnhancement({ onOpenChange }: { onOpenChange: (id: string) => void }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"approve" | "sendback" | null>(null);

  const [title, setTitle] = useState("");
  const [source, setSource] = useState<ChangeSource>("Support / Topdesk");
  const [ref, setRef] = useState("");
  const [request, setRequest] = useState("");

  // Business domain governance (Section 3/4).
  const [domains, setDomains] = useState<BusinessDomain[]>([]);
  const [domainReview, setDomainReview] = useState<DomainReview | null>(null);
  const [domainBusy, setDomainBusy] = useState(false);
  const [reviewerName, setReviewerName] = useState(() => localStorage.getItem("ciq_approver") ?? "");
  const [editForm, setEditForm] = useState<UserStory | null>(null);
  const [editNote, setEditNote] = useState("");
  const [domainDialog, setDomainDialog] = useState(false);

  const reload = () =>
    api.listChanges().then((all) => {
      const inScope = all.filter((c) => ["RECEIVED", "REFINING", "BACKLOG_READY"].includes(c.state));
      setChanges(inScope);
      setSelectedId((cur) => cur ?? inScope.find((c) => c.state === "REFINING")?.id ?? inScope[0]?.id ?? null);
    });

  useEffect(() => { reload(); }, []);

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
    api.listBusinessDomains().then(setDomains);
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

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>User story enhancement</h1>
          <div className="sub">Turn an incoming request into a story Jade can actually act on.</div>
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

      {!changes ? <Loading what="stories" /> : (
        <div className="detailgrid">
          <div className="stack">
            {selected ? (
              <>
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
                          {domains.map((d) => (
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
                        The business requirement is approved. Ready for the Application Manager to
                        approve for the sprint, on the Approval &amp; backlog page.
                      </div>
                    )}
                    {domainReview.stage === "application_manager_approved" && (
                      <div className="callout" style={{ marginTop: 16 }}>
                        <strong>Approved for sprint/build</strong>
                        The Application Manager has approved this for the sprint.
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
              </>
            ) : (
              <div className="empty">No stories in enhancement. Create a change request to start.</div>
            )}
          </div>

          <aside className="panel">
            <h2>In enhancement</h2>
            {changes.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>Nothing here yet.</div>
            ) : (
              <table className="data">
                <tbody>
                  {changes.map((c) => (
                    <tr
                      key={c.id}
                      className="clickable"
                      style={c.id === selectedId ? { background: "var(--wash)" } : undefined}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <td>
                        <div className="mono" style={{ color: "var(--muted)" }}>{c.id}</div>
                        <div>{c.title}</div>
                        <div style={{ marginTop: 4 }}><StateBadge state={c.state} /></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <ApiNote endpoint="GET /changes" />
          </aside>
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
              ? "It joins the backlog for the Application Manager to prioritise. Nothing reaches JD Edwards yet."
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
          whatHappensNext="The business requirement is approved. This does not approve the change for development — it becomes ready for the Application Manager to approve for the sprint, a separate decision."
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
