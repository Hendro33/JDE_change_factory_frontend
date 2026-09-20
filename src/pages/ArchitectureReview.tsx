import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { ArchitectureReviewRun, Change, DomainReview } from "../types/domain";
import { AskJadePanel } from "../components/AskJade";
import { ChangeGrid, FilterBar, useChangeListControls, type GridColumn } from "../components/WorkQueue";
import { ConfirmDialog, Loading, PriorityBadge, Provenance } from "../components/ui";

/**
 * Architecture Review — Gate 2. The Architect has already analysed the
 * JDE estate and proposed exactly one operation; a human reviews that
 * reasoning and either approves or rejects the specific write, before
 * anything reaches JD Edwards.
 */
export function ArchitectureReview() {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [domainReview, setDomainReview] = useState<DomainReview | null>(null);
  const [run, setRun] = useState<ArchitectureReviewRun | null>(null);
  const [showAnalysisHistory, setShowAnalysisHistory] = useState(false);
  // Same identity key ConfirmDialog already uses on this page (approve/
  // reject exact change) -- one Application Manager identity for every
  // decision and conversation turn here, not a second name to type.
  const [appManagerName, setAppManagerName] = useState(() => localStorage.getItem("ciq_approver") ?? "");

  const reload = () => {
    api.listChanges().then((all) => {
      const queue = all.filter((c) => c.architectDecision || c.exactChange);
      setChanges(queue);
      setOpenId((cur) => (cur && queue.some((c) => c.id === cur) ? cur : queue[0]?.id ?? null));
    });
  };
  useEffect(reload, []);

  useEffect(() => {
    if (!openId) { setDomainReview(null); setRun(null); return; }
    api.getDomainReview(openId).then((r) => setDomainReview(r ?? null));
    api.getArchitectureReview(openId).then((r) => setRun(r ?? null));
  }, [openId]);

  const columns: GridColumn[] = [
    { key: "id", header: "Change", render: (c) => <span className="mono">{c.id}</span>, sortValue: (c) => c.id },
    { key: "title", header: "Title", render: (c) => c.title, sortValue: (c) => c.title },
    { key: "route", header: "Route", render: (c) => c.architectDecision?.recommendedRoute ?? <span className="notstated">not decided</span> },
    { key: "decision", header: "Exact change", render: (c) =>
      c.changeApproval?.status === "approved" ? <span className="badge ok">Approved</span>
        : c.changeApproval?.status === "rejected" ? <span className="badge stop">Rejected</span>
        : c.exactChange ? <span className="badge warn">Awaiting your decision</span>
        : <span className="badge grey">Not proposed yet</span> },
    { key: "priority", header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
  ];

  const { search, setSearch, sortKey, sortDir, onSortChange, filtered } = useChangeListControls(
    changes ?? [], columns, (c) => `${c.id} ${c.title}`
  );

  // Awaiting-decision items first — that's the actual work on this screen.
  const sorted = [...filtered].sort((a, b) => {
    const aw = a.exactChange && !a.changeApproval ? 0 : 1;
    const bw = b.exactChange && !b.changeApproval ? 0 : 1;
    return aw - bw;
  });

  const open = changes?.find((c) => c.id === openId) ?? null;
  const ec = open?.exactChange;
  const decided = open?.changeApproval?.status === "approved" || open?.changeApproval?.status === "rejected";
  // Prefer the Architecture Review run's own "current" fields (kept in
  // sync with history's newest entry) over the Change's own static
  // copy -- the run reflects a re-analysis immediately, the Change
  // record only on its next full reload.
  const architectDecision = run?.architectDecision ?? open?.architectDecision;
  const implementationSpec = run?.implementationSpec ?? open?.implementationSpec;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Architecture Review</h1>
          <div className="sub">
            Gate 2 — the Architect's recommendation and the one exact operation it proposes.
          </div>
        </div>
        <div className="meta">
          {changes?.filter((c) => c.exactChange && !c.changeApproval).length ?? 0} awaiting your decision
        </div>
      </div>

      {changes && changes.length > 0 && (
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search by ID or title" selects={[]} />
      )}

      {!changes ? <Loading what="changes under architecture review" /> : (
        <section className="panel" style={{ marginBottom: 16 }}>
          <ChangeGrid
            changes={sorted}
            columns={columns}
            onRowClick={setOpenId}
            selectedId={openId}
            emptyMessage="Nothing here yet. A change arrives once Backlog Review has approved it for delivery and the Architect has analysed it."
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </section>
      )}

      {open && (
        <div className="stack">
          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{open.title}</h2>
                <div className="mono" style={{ color: "var(--muted)" }}>{open.id}</div>
              </div>
              <PriorityBadge priority={open.priority} />
            </div>
          </section>

          {architectDecision ? (
            <section className="panel">
              <h2>Architect recommendation</h2>
              <Provenance kind="ai" label={`Recommended route: ${architectDecision.recommendedRoute} · confidence ${Math.round(architectDecision.confidence * 100)}%`}>
                <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>{architectDecision.existingFunctionalityFound}</p>
                {architectDecision.alternativesConsidered.length > 0 && (
                  <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Why not the simpler options</div>
                    <table className="data">
                      <thead><tr><th>Considered</th><th>Why it was not selected</th></tr></thead>
                      <tbody>
                        {architectDecision.alternativesConsidered.map((a, i) => (
                          <tr key={i}><td>{a.approach}</td><td>{a.whyNot}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </Provenance>
              <dl className="facts" style={{ marginTop: 14 }}>
                <dt>Objects affected</dt>
                <dd>{architectDecision.objectsAffected.length
                  ? <span className="mono">{architectDecision.objectsAffected.join(", ")}</span>
                  : "None"}</dd>
                <dt>Could break</dt>
                <dd>{architectDecision.dependenciesAndConflicts.length
                  ? architectDecision.dependenciesAndConflicts.join("; ")
                  : "Nothing identified"}</dd>
                <dt>Rollback</dt><dd>{architectDecision.rollbackStrategy}</dd>
              </dl>
              {run && run.history.length > 1 && (
                <div style={{ marginTop: 14 }}>
                  <button className="linkish" onClick={() => setShowAnalysisHistory((v) => !v)}>
                    {showAnalysisHistory ? "Hide" : "Show"} analysis history ({run.history.length})
                  </button>
                  {showAnalysisHistory && (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      {[...run.history].reverse().map((v, i) => (
                        <div key={i} style={{ fontSize: 13, borderLeft: "3px solid var(--line-strong)", paddingLeft: 10 }}>
                          <div style={{ fontWeight: 700 }}>
                            {i === 0 ? "Current" : "Superseded"} — {v.architectDecision.recommendedRoute}, confidence {Math.round(v.architectDecision.confidence * 100)}% · {new Date(v.capturedAt).toLocaleString("en-GB")}
                          </div>
                          <div>{v.architectDecision.existingFunctionalityFound}</div>
                          {v.note && <div style={{ color: "var(--muted)" }}>{v.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            <section className="panel">
              <div className="callout">
                <strong>Architecture Review has not produced a recommendation yet</strong>
                This can take a few minutes after Backlog Review approval — check back shortly.
              </div>
            </section>
          )}

          {implementationSpec && (
            <section className="panel">
              <h2>Implementation specification</h2>
              <dl className="facts">
                <dt>Sequence</dt>
                <dd>
                  <ol style={{ margin: 0, paddingLeft: 18 }}>
                    {implementationSpec.sequence.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </dd>
                <dt>MCP operations</dt>
                <dd className="mono">{implementationSpec.requiredMcpOperations.join(", ") || "None"}</dd>
                <dt>Human actions required</dt>
                <dd>{implementationSpec.humanActionsRequired.join("; ") || "None"}</dd>
                <dt>Validation approach</dt>
                <dd>{implementationSpec.validationApproach}</dd>
              </dl>
            </section>
          )}

          {domainReview && (
            <AskJadePanel
              title="Ask Jade about this requirement"
              turns={domainReview.conversation}
              askedByDefault={appManagerName}
              onAsk={async (question, askedBy) => {
                setAppManagerName(askedBy);
                localStorage.setItem("ciq_approver", askedBy);
                const updated = await api.askAboutRequirement(open.id, { askedBy, question });
                setDomainReview(updated);
              }}
              renderAmendmentActions={(turn) => (
                <button
                  className="btn primary"
                  onClick={async () => {
                    const updated = await api.requestRequirementReconsideration(open.id, {
                      decidedBy: appManagerName || turn.askedBy,
                      note: `Flagged from Ask Jade about this requirement: "${turn.question}"`,
                    });
                    setDomainReview(updated);
                  }}
                >
                  Flag for Domain Owner reconsideration
                </button>
              )}
            />
          )}

          {architectDecision && (
            <AskJadePanel
              title="Ask Jade about this solution"
              turns={run?.conversation ?? []}
              askedByDefault={appManagerName}
              onAsk={async (question, askedBy) => {
                setAppManagerName(askedBy);
                localStorage.setItem("ciq_approver", askedBy);
                const updated = await api.askAboutSolution(open.id, { askedBy, question });
                setRun(updated);
              }}
              renderRecommendReanalysisActions={() => (
                <button
                  className="btn primary"
                  onClick={async () => {
                    await api.retriggerArchitectureReview(open.id);
                    const updated = await api.getArchitectureReview(open.id);
                    setRun(updated ?? null);
                  }}
                >
                  Re-run Architecture Review
                </button>
              )}
            />
          )}

          {ec && (
            <section className="panel">
              <h2>The exact change</h2>
              <Provenance
                kind={decided ? "executed" : "proposed"}
                label={decided ? `Decision recorded — ${open.changeApproval!.status}` : "Proposed only — nothing has been written to JD Edwards"}
              >
                <dl className="facts">
                  <dt>Operation</dt><dd className="mono">{ec.tool}</dd>
                  <dt>Application</dt><dd className="mono">{ec.application}</dd>
                  <dt>Version</dt><dd className="mono">{ec.version}</dd>
                  <dt>Processing option</dt><dd className="mono">{ec.option}</dd>
                  <dt>Current value</dt><dd className="mono">{ec.currentValue}</dd>
                  <dt>Proposed value</dt><dd className="mono"><strong>{ec.proposedValue}</strong></dd>
                  <dt>Environment</dt><dd className="mono">{ec.environment}</dd>
                  <dt>Verified by</dt><dd className="mono">{ec.testOrchestration}</dd>
                </dl>
              </Provenance>

              {open.changeApproval ? (
                <div style={{ marginTop: 12 }}>
                  <Provenance
                    kind="human"
                    label={`Exact change ${open.changeApproval.status} by ${open.changeApproval.approvedBy} · ${open.changeApproval.approvedAt ? new Date(open.changeApproval.approvedAt).toLocaleString("en-GB") : ""}`}
                  >
                    <div style={{ fontSize: 13.5 }}>
                      {open.changeApproval.note || <span className="notstated">no note recorded</span>}
                    </div>
                  </Provenance>
                </div>
              ) : (
                <div className="btnrow" style={{ marginTop: 16 }}>
                  <button className="btn primary" onClick={() => setDialog("approve")} disabled={busy}>
                    Approve exact change
                  </button>
                  <button className="btn danger" onClick={() => setDialog("reject")} disabled={busy}>
                    Reject exact change
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {dialog && open && ec && (
        <ConfirmDialog
          title={dialog === "approve" ? "Approve this exact change?" : "Reject this exact change?"}
          intro={
            <>
              <p style={{ marginTop: 0 }}>
                {dialog === "approve"
                  ? "You are approving one specific operation, not the change in general."
                  : "The Architect will need to propose a different operation, or this may need Human Implementation."}
              </p>
              <dl className="facts">
                <dt>Application</dt><dd className="mono">{ec.application}</dd>
                <dt>Version</dt><dd className="mono">{ec.version}</dd>
                <dt>Option</dt><dd className="mono">{ec.option}</dd>
                <dt>Change</dt><dd className="mono">{ec.currentValue} → <strong>{ec.proposedValue}</strong></dd>
              </dl>
            </>
          }
          whatHappensNext={
            dialog === "approve"
              ? "The Functional or Technical Agent may apply exactly this operation in DEV, then run the named test. If anything about the operation differs from what you see here, it will be refused."
              : "This exact operation is refused. Nothing is written to JD Edwards."
          }
          confirmLabel={dialog === "approve" ? "Approve exact change" : "Reject exact change"}
          tone={dialog === "approve" ? "primary" : "danger"}
          requireNote={dialog === "reject"}
          showReasonCode={dialog === "reject"}
          onCancel={() => setDialog(null)}
          onConfirm={async (decidedBy, note, reasonCode) => {
            setDialog(null); setBusy(true);
            if (dialog === "approve") await api.approveExactChange(open.id, { decidedBy, note });
            else await api.rejectExactChange(open.id, { decidedBy, note, rejectionReason: reasonCode });
            await reload(); setBusy(false);
          }}
        />
      )}
    </>
  );
}
